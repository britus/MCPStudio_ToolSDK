#!/usr/bin/env node
'use strict';

/**
 * Inspect one Safetensors file or a directory containing sharded Safetensors.
 * Large files are read by offset/chunks; they are never loaded into one Buffer.
 *
 * Usage:
 *   node dump_safetensors.js [file-or-directory] [options]
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTO_SCAN_MAX_BYTES = 256 * 1024 * 1024;
const IO_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024 * 1024;
const DTYPE_BYTES = {
  BOOL: 1, I8: 1, U8: 1,
  I16: 2, U16: 2, F16: 2, BF16: 2,
  I32: 4, U32: 4, F32: 4,
  I64: 8, U64: 8, F64: 8,
};

function parseArgs(argv) {
  const options = {
    target: path.join(__dirname, 'model.safetensors'),
    previewValues: 8,
    json: false,
    stats: null,
    sha256: null,
    help: false,
  };
  let targetSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--stats') options.stats = true;
    else if (arg === '--no-stats') options.stats = false;
    else if (arg === '--sha256') options.sha256 = true;
    else if (arg === '--no-sha256') options.sha256 = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--values') {
      if (i + 1 >= argv.length) throw new Error('missing value after --values');
      options.previewValues = Number(argv[++i]);
    } else if (arg.startsWith('--values=')) {
      options.previewValues = Number(arg.slice('--values='.length));
    } else if (!arg.startsWith('-') && !targetSeen) {
      options.target = arg;
      targetSeen = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  options.previewValues = Math.floor(options.previewValues);
  if (options.previewValues < 0 || options.previewValues > 1000) {
    throw new Error('--values must be between 0 and 1000');
  }
  return options;
}

function readExact(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = fs.readSync(fd, buffer, offset, length - offset, position + offset);
    if (read === 0) throw new Error(`unexpected end of file at byte ${position + offset}`);
    offset += read;
  }
  return buffer;
}

function halfToFloat(value) {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function bfloatToFloat(value) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value << 16, true);
  return view.getFloat32(0, true);
}

function readValue(buffer, offset, dtype) {
  switch (dtype) {
    case 'BOOL': return buffer.readUInt8(offset) !== 0;
    case 'I8': return buffer.readInt8(offset);
    case 'U8': return buffer.readUInt8(offset);
    case 'I16': return buffer.readInt16LE(offset);
    case 'U16': return buffer.readUInt16LE(offset);
    case 'I32': return buffer.readInt32LE(offset);
    case 'U32': return buffer.readUInt32LE(offset);
    case 'I64': return buffer.readBigInt64LE(offset);
    case 'U64': return buffer.readBigUInt64LE(offset);
    case 'F16': return halfToFloat(buffer.readUInt16LE(offset));
    case 'BF16': return bfloatToFloat(buffer.readUInt16LE(offset));
    case 'F32': return buffer.readFloatLE(offset);
    case 'F64': return buffer.readDoubleLE(offset);
    default: return undefined;
  }
}

function jsonValue(value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function computeStats(fd, absoluteOffset, elements, dtype, bytesPerValue) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let finite = 0;
  let nonFinite = 0;
  const valuesPerChunk = Math.max(1, Math.floor(IO_CHUNK_BYTES / bytesPerValue));

  for (let start = 0; start < elements; start += valuesPerChunk) {
    const count = Math.min(valuesPerChunk, elements - start);
    const buffer = readExact(fd, count * bytesPerValue, absoluteOffset + start * bytesPerValue);
    for (let i = 0; i < count; i++) {
      const raw = readValue(buffer, i * bytesPerValue, dtype);
      const value = typeof raw === 'bigint' ? Number(raw) : raw;
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
        finite++;
      } else {
        nonFinite++;
      }
    }
  }
  return {
    min: finite ? min : null,
    max: finite ? max : null,
    mean: finite ? sum / finite : null,
    finite,
    nonFinite,
  };
}

function hashFile(fd, fileBytes) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(Math.min(IO_CHUNK_BYTES, fileBytes));
  for (let position = 0; position < fileBytes;) {
    const length = Math.min(buffer.length, fileBytes - position);
    const read = fs.readSync(fd, buffer, 0, length, position);
    if (read === 0) throw new Error(`unexpected end of file at byte ${position}`);
    hash.update(buffer.subarray(0, read));
    position += read;
  }
  return hash.digest('hex');
}

function inspectTensor(fd, dataStart, dataBytes, name, info, options) {
  if (!info || typeof info !== 'object') throw new Error(`invalid tensor entry: ${name}`);
  const shape = info.shape;
  const offsets = info.data_offsets;
  if (!Array.isArray(shape) || !shape.every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error(`invalid shape for tensor "${name}"`);
  }
  if (!Array.isArray(offsets) || offsets.length !== 2) {
    throw new Error(`invalid data_offsets for tensor "${name}"`);
  }

  const [begin, end] = offsets;
  if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end < begin || end > dataBytes) {
    throw new Error(`out-of-bounds data_offsets for tensor "${name}"`);
  }
  const elements = shape.reduce((product, dimension) => product * dimension, 1);
  const bytesPerValue = DTYPE_BYTES[info.dtype] || null;
  const byteLength = end - begin;
  const expectedBytes = bytesPerValue === null ? null : elements * bytesPerValue;
  if (expectedBytes !== null && expectedBytes !== byteLength) {
    throw new Error(
      `shape/dtype size mismatch for tensor "${name}": expected ${expectedBytes}, found ${byteLength}`
    );
  }

  const preview = [];
  if (bytesPerValue !== null && options.previewValues > 0) {
    const count = Math.min(elements, options.previewValues);
    const buffer = readExact(fd, count * bytesPerValue, dataStart + begin);
    for (let i = 0; i < count; i++) {
      preview.push(jsonValue(readValue(buffer, i * bytesPerValue, info.dtype)));
    }
  }

  let stats = null;
  if (options.scanStats && bytesPerValue !== null && elements > 0 && info.dtype !== 'BOOL') {
    stats = computeStats(fd, dataStart + begin, elements, info.dtype, bytesPerValue);
  }

  const tensor = {
    name,
    dtype: info.dtype,
    shape,
    elements,
    bytes: byteLength,
    dataOffsets: [begin, end],
    preview,
    stats,
  };
  if (name === 'vocab_codepoints' && preview.length) {
    tensor.previewCharacters = preview.map((value) => {
      const codepoint = Number(value);
      return Number.isInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff
        ? String.fromCodePoint(codepoint)
        : null;
    });
  }
  if (bytesPerValue === null) tensor.note = `unsupported dtype: ${info.dtype}`;
  return tensor;
}

function inspectFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error(`not a file: ${absolutePath}`);
  if (stat.size < 8) throw new Error('file is too small for a Safetensors header');

  const scanStats = options.stats === true ||
    (options.stats !== false && stat.size <= AUTO_SCAN_MAX_BYTES);
  const calculateSha256 = options.sha256 === true ||
    (options.sha256 !== false && stat.size <= AUTO_SCAN_MAX_BYTES);
  const fd = fs.openSync(absolutePath, 'r');
  try {
    const prefix = readExact(fd, 8, 0);
    const headerLengthBig = prefix.readBigUInt64LE(0);
    if (headerLengthBig > BigInt(MAX_HEADER_BYTES)) {
      throw new Error(`Safetensors header exceeds ${MAX_HEADER_BYTES} bytes`);
    }
    const headerBytes = Number(headerLengthBig);
    const dataStart = 8 + headerBytes;
    if (headerBytes < 2 || dataStart > stat.size) throw new Error('invalid Safetensors header length');

    let header;
    try {
      header = JSON.parse(readExact(fd, headerBytes, 8).toString('utf8'));
    } catch (error) {
      throw new Error(`invalid Safetensors JSON header: ${error.message}`);
    }
    const dataBytes = stat.size - dataStart;
    const tensorOptions = {
      previewValues: options.previewValues ?? 8,
      scanStats,
    };
    const tensors = Object.entries(header)
      .filter(([name]) => name !== '__metadata__')
      .map(([name, info]) => inspectTensor(fd, dataStart, dataBytes, name, info, tensorOptions));

    return {
      format: 'safetensors',
      file: absolutePath,
      name: path.basename(absolutePath),
      bytes: stat.size,
      sha256: calculateSha256 ? hashFile(fd, stat.size) : null,
      sha256Status: calculateSha256 ? 'calculated' :
        (options.sha256 === false ? 'disabled' : 'skipped-large-file'),
      headerBytes,
      dataBytes,
      metadata: header.__metadata__ || {},
      tensorCount: tensors.length,
      statisticsStatus: scanStats ? 'calculated' :
        (options.stats === false ? 'disabled' : 'skipped-large-file'),
      tensors,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function inspectIndex(directory, actualTensors) {
  const indexPath = path.join(directory, 'model.safetensors.index.json');
  if (!fs.existsSync(indexPath)) return null;
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw new Error(`invalid shard index ${indexPath}: ${error.message}`);
  }
  const weightMap = index.weight_map || {};
  const missing = [];
  const wrongShard = [];
  for (const [tensor, shard] of Object.entries(weightMap)) {
    const actualShard = actualTensors.get(tensor);
    if (!actualShard) missing.push(tensor);
    else if (actualShard !== shard) wrongShard.push({ tensor, expected: shard, actual: actualShard });
  }
  const unindexed = [];
  for (const [tensor, shard] of actualTensors) {
    if (!Object.hasOwn(weightMap, tensor)) unindexed.push({ tensor, shard });
  }
  return {
    file: indexPath,
    metadata: index.metadata || {},
    entries: Object.keys(weightMap).length,
    validation: {
      valid: missing.length === 0 && wrongShard.length === 0 && unindexed.length === 0,
      missing,
      wrongShard,
      unindexed,
    },
  };
}

function inspectDirectory(directoryPath, options = {}) {
  const directory = path.resolve(directoryPath);
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.safetensors'))
    .sort()
    .map((name) => path.join(directory, name));
  if (files.length === 0) throw new Error(`no .safetensors files found in ${directory}`);

  const shards = files.map((file) => inspectFile(file, options));
  const actualTensors = new Map();
  const duplicates = [];
  const dtypeSummary = {};
  let elements = 0;
  for (const shard of shards) {
    for (const tensor of shard.tensors) {
      if (actualTensors.has(tensor.name)) duplicates.push(tensor.name);
      actualTensors.set(tensor.name, shard.name);
      elements += tensor.elements;
      const summary = dtypeSummary[tensor.dtype] || { tensors: 0, elements: 0, bytes: 0 };
      summary.tensors++;
      summary.elements += tensor.elements;
      summary.bytes += tensor.bytes;
      dtypeSummary[tensor.dtype] = summary;
    }
  }
  const index = inspectIndex(directory, actualTensors);
  if (index && duplicates.length) {
    index.validation.duplicateTensors = duplicates;
    index.validation.valid = false;
  }

  return {
    format: 'safetensors-sharded',
    directory,
    bytes: shards.reduce((sum, shard) => sum + shard.bytes, 0),
    dataBytes: shards.reduce((sum, shard) => sum + shard.dataBytes, 0),
    shardCount: shards.length,
    tensorCount: shards.reduce((sum, shard) => sum + shard.tensorCount, 0),
    elements,
    dtypeSummary,
    duplicateTensors: duplicates,
    index,
    shards,
  };
}

function inspectPath(targetPath, options = {}) {
  const absolutePath = path.resolve(targetPath);
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) return inspectDirectory(absolutePath, options);
  return inspectFile(absolutePath, options);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number' && !Number.isInteger(value)) return value.toPrecision(7);
  return String(value);
}

function printMetadata(metadata) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) console.log('  (none)');
  for (const [key, value] of entries) console.log(`  ${key}: ${value}`);
}

function printableCharacter(char) {
  if (char === '\n') return '\\n';
  if (char === '\t') return '\\t';
  if (char === ' ') return '␠';
  return char;
}

function printTensors(tensors) {
  for (const tensor of tensors) {
    console.log(`\n${tensor.name}`);
    console.log(`  dtype:       ${tensor.dtype}`);
    console.log(`  shape:       [${tensor.shape.join(' × ')}]`);
    console.log(`  elements:    ${tensor.elements.toLocaleString('en-US')}`);
    console.log(`  size:        ${formatBytes(tensor.bytes)}`);
    console.log(`  data range:  ${tensor.dataOffsets[0]}..${tensor.dataOffsets[1]}`);
    if (tensor.stats) {
      console.log(
        `  stats:       min=${formatNumber(tensor.stats.min)}  ` +
        `max=${formatNumber(tensor.stats.max)}  mean=${formatNumber(tensor.stats.mean)}  ` +
        `non-finite=${tensor.stats.nonFinite}`
      );
    }
    if (tensor.preview.length) console.log(`  values:      ${tensor.preview.map(formatNumber).join(', ')}`);
    if (tensor.previewCharacters) {
      console.log(`  characters:  ${tensor.previewCharacters.map(printableCharacter).join(' ')}`);
    }
    if (tensor.note) console.log(`  note:        ${tensor.note}`);
  }
}

function printFile(report, showTitle = true) {
  if (showTitle) {
    console.log('SAFETENSORS FILE DUMP');
    console.log('=====================');
  }
  console.log(`File:         ${report.file}`);
  console.log(`Size:         ${formatBytes(report.bytes)} (${report.bytes} bytes)`);
  console.log(`SHA-256:      ${report.sha256 || `[${report.sha256Status}]`}`);
  console.log(`Header:       ${formatBytes(report.headerBytes)}`);
  console.log(`Tensor data:  ${formatBytes(report.dataBytes)}`);
  console.log(`Tensors:      ${report.tensorCount}`);
  console.log(`Statistics:   ${report.statisticsStatus}`);
  console.log('\nMETADATA');
  console.log('--------');
  printMetadata(report.metadata);
  console.log('\nTENSORS');
  console.log('-------');
  printTensors(report.tensors);
}

function printDirectory(report) {
  console.log('SAFETENSORS SHARDED MODEL DUMP');
  console.log('==============================');
  console.log(`Directory:    ${report.directory}`);
  console.log(`Total size:   ${formatBytes(report.bytes)} (${report.bytes} bytes)`);
  console.log(`Tensor data:  ${formatBytes(report.dataBytes)}`);
  console.log(`Shards:       ${report.shardCount}`);
  console.log(`Tensors:      ${report.tensorCount}`);
  console.log(`Elements:     ${report.elements.toLocaleString('en-US')}`);
  if (report.index) {
    console.log(`Index:        ${report.index.file}`);
    console.log(`Index entries:${String(report.index.entries).padStart(6)}`);
    console.log(`Index valid:  ${report.index.validation.valid ? 'yes' : 'NO'}`);
  } else {
    console.log('Index:        not found');
  }

  console.log('\nDTYPE SUMMARY');
  console.log('-------------');
  for (const [dtype, summary] of Object.entries(report.dtypeSummary).sort()) {
    console.log(
      `${dtype.padEnd(6)} ${String(summary.tensors).padStart(5)} tensors  ` +
      `${summary.elements.toLocaleString('en-US').padStart(18)} elements  ${formatBytes(summary.bytes)}`
    );
  }

  if (report.index && !report.index.validation.valid) {
    const validation = report.index.validation;
    console.log('\nINDEX ERRORS');
    console.log('------------');
    console.log(`Missing tensors:    ${validation.missing.length}`);
    console.log(`Wrong shard:        ${validation.wrongShard.length}`);
    console.log(`Unindexed tensors:  ${validation.unindexed.length}`);
  }

  for (const shard of report.shards) {
    console.log(`\n\nSHARD: ${shard.name}`);
    console.log('='.repeat(Math.min(80, 7 + shard.name.length)));
    printFile(shard, false);
  }
}

function printHuman(report) {
  if (report.format === 'safetensors-sharded') printDirectory(report);
  else printFile(report);
}

function printHelp() {
  console.log(`Usage: ./dump_safetensors.sh [file-or-directory] [options]

Options:
  --values N     Number of tensor values to preview (default: 8, max: 1000)
  --stats        Force min/max/mean scan, including files larger than 256 MiB
  --no-stats     Skip min/max/mean calculation
  --sha256       Force SHA-256, including files larger than 256 MiB
  --no-sha256    Skip SHA-256 calculation
  --json         Emit machine-readable JSON
  -h, --help     Show this help

A directory is scanned for all *.safetensors files. If present,
model.safetensors.index.json is used to validate the shard-to-tensor mapping.
Statistics and SHA-256 are skipped automatically for files larger than 256 MiB
unless explicitly enabled. Without a target, this project's model is used.`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const report = inspectPath(options.target, options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  inspectFile,
  inspectDirectory,
  inspectPath,
  printHuman,
};
