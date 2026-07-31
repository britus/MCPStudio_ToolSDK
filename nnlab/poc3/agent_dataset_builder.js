'use strict';

/**
 * Dataset Builder for continuation training.
 *
 * stdin:  {"datasetResources":[...],"epochs":35,"learningRate":0.12,"seed":42}
 * stdout: one JSON object containing scriptArguments for train.js
 *
 * Every run archives the new normalized dataset and creates a deterministic
 * replay mix. The default mix uses 60% current data and 40% historical data.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT = '${TOOLSDK}/nnlab/poc3';
const MODEL = path.join(PROJECT, 'model.safetensors');
const TRAIN = path.join(PROJECT, 'train.js');
const DATASET_ROOT = path.join(PROJECT, 'datasets');
const ARCHIVE_DIRECTORY = path.join(DATASET_ROOT, 'archive');
const MIXED_DIRECTORY = path.join(DATASET_ROOT, 'mixed');
const LATEST_MANIFEST = path.join(DATASET_ROOT, 'latest.json');
const LEGACY_OUTPUT = path.join(PROJECT, 'adk_training_dataset.txt');
const DEFAULT_NEW_DATA_RATIO = 0.6;
const MAX_SOURCE_BYTES = 255 * 1024 * 1024;
const MAX_TOTAL_CHARS = 255 * 1024 * 1024;
const MAX_FILES = 1200;
const MAX_LINES = 128 * 1024;
const MAX_MIXED_LINES = 2000; // train.js consumes at most 2,000 lines per run.
const MAX_HISTORY_UNIQUE_LINES = 1_000_000;
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.html', '.htm', '.json', '.jsonl', '.csv', '.tsv',
  '.xml', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.swift', '.mm',
  '.m', '.c', '.h', '.hxx', '.cxx', '.cpp', '.hpp', '.ui', '.java',
  '.kt', '.kts', '.sh', '.zsh', '.yaml', '.yml', '.toml', '.pri',
  '.pro', '.mak',
]);
const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'build', 'Build', 'DerivedData', '.swiftpm',
  '.cache', 'datasets',
]);

function fail(message, details) {
  process.stderr.write(`${JSON.stringify({
    status: 'halted',
    error: message,
    details: details || null,
  })}\n`);
  process.exit(2);
}

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    fail('Invalid stdinJSON for Dataset Builder.', error.message);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function writeJson(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seed) {
  const output = values.slice();
  const random = mulberry32(seed);
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)));
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<\/(p|div|section|article|main|header|footer|nav|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function readTextFile(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('Not a regular file.');
  if (stat.size > MAX_SOURCE_BYTES) {
    throw new Error(`File exceeds ${MAX_SOURCE_BYTES} bytes.`);
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) throw new Error('Binary file is not accepted.');
  return buffer.toString('utf8');
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function collectDirectory(directoryPath) {
  const texts = [];
  const files = [];
  const stack = [directoryPath];
  while (stack.length && files.length < MAX_FILES) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && !isInside(absolute, DATASET_ROOT)) {
          stack.push(absolute);
        }
      } else if (
        entry.isFile() &&
        absolute !== LEGACY_OUTPUT &&
        absolute !== MODEL &&
        !isInside(absolute, DATASET_ROOT) &&
        (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || entry.name === 'Makefile')
      ) {
        files.push(absolute);
        if (files.length >= MAX_FILES) break;
      }
    }
  }
  for (const file of files) {
    try {
      texts.push(readTextFile(file));
    } catch (error) {
      process.stderr.write(`Skipping ${file}: ${error.message}\n`);
    }
  }
  return { texts, files };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'EoFMCPStudio-AI-Trainer/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !/(text|html|json|xml|javascript)/.test(contentType)) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    if (!response.body) throw new Error('Response body is empty.');
    const reader = response.body.getReader();
    const chunks = [];
    let byteCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error(`Response exceeds ${MAX_SOURCE_BYTES} bytes.`);
      }
      chunks.push(Buffer.from(value));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return contentType.includes('html') || /<html[\s>]/i.test(body)
      ? htmlToText(body)
      : body;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeResource(resource) {
  if (typeof resource === 'string') {
    if (/^https?:\/\//i.test(resource)) return { type: 'url', value: resource };
    if (!path.isAbsolute(resource)) throw new Error('Local resource paths must be absolute.');
    const stat = fs.statSync(resource);
    return { type: stat.isDirectory() ? 'directory' : 'file', value: resource };
  }
  if (!resource || typeof resource !== 'object') {
    throw new Error('Resource must be an object or string.');
  }
  const type = String(resource.type || '').toLowerCase();
  const value = String(resource.value || '').trim();
  if (!['url', 'file', 'directory'].includes(type) || !value) {
    throw new Error('Resource requires type url, file, or directory and a non-empty value.');
  }
  return { type, value };
}

function makeLines(text) {
  const lines = [];
  for (const rawLine of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const compact = rawLine.replace(/\s+/g, ' ').trim();
    for (let offset = 0; offset < compact.length; offset += 1000) {
      const chunk = compact.slice(offset, offset + 1000).trim();
      if (chunk) lines.push(chunk);
    }
  }
  return lines;
}

function uniqueBoundedLines(texts) {
  const lines = [];
  const seen = new Set();
  let characters = 0;
  for (const text of texts) {
    for (const line of makeLines(text)) {
      if (seen.has(line)) continue;
      if (lines.length >= MAX_LINES || characters + line.length > MAX_TOTAL_CHARS) {
        return { lines, characters };
      }
      seen.add(line);
      lines.push(line);
      characters += line.length;
    }
  }
  return { lines, characters };
}

function ensureDatasetDirectories(datasetRoot = DATASET_ROOT) {
  const archiveDirectory = path.join(datasetRoot, 'archive');
  const mixedDirectory = path.join(datasetRoot, 'mixed');
  fs.mkdirSync(archiveDirectory, { recursive: true });
  fs.mkdirSync(mixedDirectory, { recursive: true });
  return { archiveDirectory, mixedDirectory };
}

function listArchiveFiles(archiveDirectory) {
  return fs.readdirSync(archiveDirectory)
    .filter((name) => /^dataset_\d{6}\.txt$/.test(name))
    .sort()
    .map((name) => path.join(archiveDirectory, name));
}

function sequenceFromPath(filePath) {
  const match = path.basename(filePath).match(/^dataset_(\d{6})\.txt$/);
  return match ? Number(match[1]) : 0;
}

function numberedName(prefix, sequence, extension = '.txt') {
  return `${prefix}_${String(sequence).padStart(6, '0')}${extension}`;
}

function archiveDataset(lines, details, archiveDirectory, sequence) {
  const name = numberedName('dataset', sequence);
  const datasetPath = path.join(archiveDirectory, name);
  const manifestPath = path.join(
    archiveDirectory,
    numberedName('dataset', sequence, '.manifest.json')
  );
  const content = `${lines.join('\n')}\n`;
  const manifest = {
    version: 1,
    sequence,
    id: path.basename(name, '.txt'),
    createdAt: new Date().toISOString(),
    datasetPath,
    sha256: sha256(content),
    lineCount: lines.length,
    characterCount: lines.reduce((sum, line) => sum + line.length, 0),
    ...details,
  };
  atomicWrite(datasetPath, content);
  writeJson(manifestPath, manifest);
  return { datasetPath, manifestPath, manifest };
}

function migrateLegacyDataset(archiveDirectory, legacyOutput = LEGACY_OUTPUT) {
  if (listArchiveFiles(archiveDirectory).length > 0 || !fs.existsSync(legacyOutput)) {
    return null;
  }
  const normalized = uniqueBoundedLines([readTextFile(legacyOutput)]);
  if (normalized.lines.length === 0) return null;
  return archiveDataset(normalized.lines, {
    origin: 'legacy-migration',
    resources: [{ type: 'legacy', value: legacyOutput }],
  }, archiveDirectory, 1);
}

function collectHistoricalReplay(archiveFiles, newLines, desiredCount, seed) {
  if (desiredCount <= 0 || archiveFiles.length === 0) {
    return { lines: [], scannedUniqueLines: 0, truncated: false };
  }
  const newLineHashes = new Set(newLines.map((line) => sha256(line)));
  const historicalHashes = new Set();
  const reservoir = [];
  const random = mulberry32(seed);
  let scannedUniqueLines = 0;
  let truncated = false;

  for (const archiveFile of archiveFiles) {
    for (const line of makeLines(readTextFile(archiveFile))) {
      const hash = sha256(line);
      if (newLineHashes.has(hash) || historicalHashes.has(hash)) continue;
      historicalHashes.add(hash);
      scannedUniqueLines++;
      if (reservoir.length < desiredCount) {
        reservoir.push(line);
      } else {
        const replacement = Math.floor(random() * scannedUniqueLines);
        if (replacement < desiredCount) reservoir[replacement] = line;
      }
      if (historicalHashes.size >= MAX_HISTORY_UNIQUE_LINES) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  return { lines: reservoir, scannedUniqueLines, truncated };
}

function buildReplayMix({
  newLines,
  historicalFiles,
  newDataRatio = DEFAULT_NEW_DATA_RATIO,
  seed = 42,
  sequence,
  mixedDirectory,
}) {
  const maxNewLines = Math.max(1, Math.floor(MAX_MIXED_LINES * newDataRatio));
  const selectedNew = newLines.length > maxNewLines
    ? shuffled(newLines, seed ^ sequence).slice(0, maxNewLines)
    : newLines.slice();
  const desiredReplay = newDataRatio >= 1
    ? 0
    : Math.min(
      MAX_MIXED_LINES - selectedNew.length,
      Math.round(selectedNew.length * (1 - newDataRatio) / newDataRatio)
    );
  const replay = collectHistoricalReplay(
    historicalFiles,
    selectedNew,
    desiredReplay,
    seed ^ sequence ^ 0x9e3779b9
  );

  const entries = [
    ...selectedNew.map((line) => ({ line, source: 'new' })),
    ...replay.lines.map((line) => ({ line, source: 'replay' })),
  ];
  const mixedEntries = shuffled(entries, seed ^ sequence ^ 0x85ebca6b);
  const bounded = [];
  let characterCount = 0;
  for (const entry of mixedEntries) {
    if (
      bounded.length >= MAX_MIXED_LINES ||
      characterCount + entry.line.length > MAX_TOTAL_CHARS
    ) break;
    bounded.push(entry);
    characterCount += entry.line.length;
  }

  const mixedName = numberedName('training_mix', sequence);
  const mixedPath = path.join(mixedDirectory, mixedName);
  const manifestPath = path.join(
    mixedDirectory,
    numberedName('training_mix', sequence, '.manifest.json')
  );
  const content = `${bounded.map((entry) => entry.line).join('\n')}\n`;
  const newLineCount = bounded.filter((entry) => entry.source === 'new').length;
  const replayLineCount = bounded.length - newLineCount;
  const manifest = {
    version: 1,
    sequence,
    id: path.basename(mixedName, '.txt'),
    createdAt: new Date().toISOString(),
    mixedDatasetPath: mixedPath,
    sha256: sha256(content),
    seed,
    requestedNewDataRatio: newDataRatio,
    actualNewDataRatio: bounded.length ? newLineCount / bounded.length : 1,
    lineCount: bounded.length,
    characterCount,
    newLineCount,
    replayLineCount,
    historicalDatasetCount: historicalFiles.length,
    historicalDatasets: historicalFiles,
    scannedUniqueHistoricalLines: replay.scannedUniqueLines,
    historyScanTruncated: replay.truncated,
  };
  atomicWrite(mixedPath, content);
  writeJson(manifestPath, manifest);
  return { mixedPath, manifestPath, manifest };
}

async function consumeResources(resources) {
  const texts = [];
  const manifest = [];
  for (const rawResource of resources) {
    let resource;
    try {
      resource = normalizeResource(rawResource);
      if (resource.type === 'url') {
        const parsed = new URL(resource.value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('Only HTTP/HTTPS URLs are accepted.');
        }
        const text = await fetchText(parsed.href);
        texts.push(text);
        manifest.push({ type: 'url', value: parsed.href, characters: text.length });
      } else {
        if (!path.isAbsolute(resource.value)) {
          throw new Error('Local resource paths must be absolute.');
        }
        const resolved = path.resolve(resource.value);
        const stat = fs.statSync(resolved);
        if (resource.type === 'file') {
          if (!stat.isFile()) throw new Error('Declared file is not a regular file.');
          const text = readTextFile(resolved);
          texts.push(text);
          manifest.push({ type: 'file', value: resolved, characters: text.length });
        } else {
          if (!stat.isDirectory()) throw new Error('Declared directory is not a directory.');
          const collected = collectDirectory(resolved);
          texts.push(...collected.texts);
          manifest.push({ type: 'directory', value: resolved, files: collected.files.length });
        }
      }
    } catch (error) {
      throw new Error(JSON.stringify({
        message: 'Dataset resource could not be consumed.',
        resource: rawResource,
        error: error.message,
      }));
    }
  }
  return { texts, manifest };
}

async function buildDatasets(input, paths = {}) {
  const projectDirectory = paths.projectDirectory || PROJECT;
  const modelPath = paths.modelPath || MODEL;
  const trainPath = paths.trainPath || TRAIN;
  const datasetRoot = paths.datasetRoot || DATASET_ROOT;
  const legacyOutput = paths.legacyOutput || LEGACY_OUTPUT;
  const latestManifest = path.join(datasetRoot, 'latest.json');
  const resources = Array.isArray(input.datasetResources) ? input.datasetResources : [];
  if (resources.length === 0) {
    throw new Error(
      `Dataset resource missing: provide at least one website URL, local file, or local directory.` +
      (input.haltReason ? ` ${input.haltReason}` : '')
    );
  }
  if (input.projectDirectory && input.projectDirectory !== projectDirectory) {
    throw new Error(`Unexpected projectDirectory: ${input.projectDirectory}`);
  }
  if (input.datasetDirectory && input.datasetDirectory !== datasetRoot) {
    throw new Error(`Unexpected datasetDirectory: ${input.datasetDirectory}`);
  }
  // Accept the former fixed output only for backwards-compatible callers.
  if (input.datasetOutput && input.datasetOutput !== legacyOutput) {
    throw new Error(`Unexpected legacy datasetOutput: ${input.datasetOutput}`);
  }
  if (!fs.existsSync(trainPath)) throw new Error(`Training script is missing: ${trainPath}`);
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Continuation requires the existing model.safetensors: ${modelPath}`);
  }

  const epochs = Number.isFinite(Number(input.epochs))
    ? Math.max(1, Math.floor(Number(input.epochs)))
    : 35;
  const learningRate = Number.isFinite(Number(input.learningRate))
    ? Number(input.learningRate)
    : 0.12;
  const seed = Number.isFinite(Number(input.seed)) ? Math.floor(Number(input.seed)) : 42;
  const newDataRatio = Number.isFinite(Number(input.newDataRatio))
    ? Number(input.newDataRatio)
    : DEFAULT_NEW_DATA_RATIO;
  if (!(learningRate > 0 && learningRate <= 1)) {
    throw new Error('learningRate must be > 0 and <= 1.');
  }
  if (!(newDataRatio >= 0.1 && newDataRatio <= 1)) {
    throw new Error('newDataRatio must be between 0.1 and 1.');
  }

  const directories = ensureDatasetDirectories(datasetRoot);
  const migration = migrateLegacyDataset(directories.archiveDirectory, legacyOutput);
  const historicalFiles = listArchiveFiles(directories.archiveDirectory);
  const nextSequence = historicalFiles.reduce(
    (max, file) => Math.max(max, sequenceFromPath(file)),
    0
  ) + 1;

  const consumed = await consumeResources(resources);
  const normalized = uniqueBoundedLines(consumed.texts);
  if (normalized.lines.length === 0) {
    throw new Error(`Dataset resources produced no usable text: ${JSON.stringify(consumed.manifest)}`);
  }

  const archived = archiveDataset(normalized.lines, {
    origin: 'workflow',
    resources: consumed.manifest,
  }, directories.archiveDirectory, nextSequence);
  const mixed = buildReplayMix({
    newLines: normalized.lines,
    historicalFiles,
    newDataRatio,
    seed,
    sequence: nextSequence,
    mixedDirectory: directories.mixedDirectory,
  });

  // Compatibility alias for humans and older integrations. Training receives
  // mixed.mixedPath directly and does not rely on this alias.
  atomicWrite(legacyOutput, fs.readFileSync(mixed.mixedPath));
  const latest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sequence: nextSequence,
    archiveDatasetPath: archived.datasetPath,
    archiveManifestPath: archived.manifestPath,
    mixedDatasetPath: mixed.mixedPath,
    mixedManifestPath: mixed.manifestPath,
  };
  writeJson(latestManifest, latest);

  return {
    status: 'ready',
    trainingMode: 'continue',
    modelPath,
    datasetDirectory: datasetRoot,
    datasetPath: mixed.mixedPath,
    mixedDatasetPath: mixed.mixedPath,
    mixedDatasetManifestPath: mixed.manifestPath,
    newDatasetPath: archived.datasetPath,
    newDatasetManifestPath: archived.manifestPath,
    archiveSequence: nextSequence,
    migratedLegacyDataset: migration ? migration.datasetPath : null,
    datasetManifest: consumed.manifest,
    datasetLineCount: mixed.manifest.lineCount,
    datasetCharacterCount: mixed.manifest.characterCount,
    newDatasetLineCount: archived.manifest.lineCount,
    replayLineCount: mixed.manifest.replayLineCount,
    historicalDatasetCount: mixed.manifest.historicalDatasetCount,
    requestedNewDataRatio: mixed.manifest.requestedNewDataRatio,
    actualNewDataRatio: mixed.manifest.actualNewDataRatio,
    scriptArguments: [
      mixed.mixedPath,
      '--epochs', String(epochs),
      '--learning-rate', String(learningRate),
      '--seed', String(seed),
    ],
  };
}

async function main() {
  try {
    const result = await buildDatasets(readInput());
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    let details = null;
    try {
      details = JSON.parse(error.message);
    } catch {
      details = error.message;
    }
    fail('Dataset Builder failed.', details);
  }
}

if (require.main === module) {
  main().catch((error) => fail('Dataset Builder failed.', error.message));
}

module.exports = {
  makeLines,
  uniqueBoundedLines,
  buildReplayMix,
  buildDatasets,
  listArchiveFiles,
};
