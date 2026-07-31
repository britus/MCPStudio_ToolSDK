'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { loadGenerativeModel, generateText } = require('./src/generator');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MODEL_PATH = path.join(ROOT, 'model.safetensors');
let training = { status: 'idle', progress: null, result: null, error: null };

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function modelInfo() {
  const loaded = loadGenerativeModel(MODEL_PATH);
  const stat = fs.statSync(MODEL_PATH);
  return {
    ready: true,
    file: 'model.safetensors',
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    type: loaded.metadata.model_type,
    architecture: loaded.metadata.architecture,
    trainedAt: loaded.metadata.trained_at,
    inputFile: loaded.metadata.input_file,
    contextSize: loaded.model.contextSize,
    vocabSize: loaded.vocab.size,
    parameters: loaded.model.paramCount(),
    epochs: Number(loaded.metadata.epochs),
    trainingRuns: Number(loaded.metadata.training_runs || 1),
    totalEpochs: Number(loaded.metadata.total_epochs || loaded.metadata.epochs),
    finalLoss: Number(loaded.metadata.final_loss),
    finalPerplexity: Number(loaded.metadata.final_perplexity),
  };
}

function startTraining(body) {
  const epochs = Math.min(200, Math.max(1, Math.floor(Number(body.epochs) || 35)));
  const contextSize = body.contextSize === undefined
    ? null
    : Math.min(64, Math.max(2, Math.floor(Number(body.contextSize) || 16)));
  const learningRate = Math.min(1, Math.max(0.001, Number(body.learningRate) || 0.12));
  const seed = Math.floor(Number(body.seed) || 42);
  const args = [
    path.join(ROOT, 'train.js'),
    path.join(ROOT, 'dataset.txt'),
    '--epochs', String(epochs),
    '--learning-rate', String(learningRate),
    '--seed', String(seed),
  ];
  if (contextSize !== null) args.push('--context', String(contextSize));
  if (body.fresh === true) args.push('--fresh');

  training = {
    status: 'running',
    startedAt: new Date().toISOString(),
    settings: { epochs, contextSize, learningRate, seed, fresh: body.fresh === true },
    progress: { epoch: 0, loss: null, perplexity: null },
    result: null,
    error: null,
  };

  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderrBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk;
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('PROGRESS ')) continue;
      try {
        training.progress = JSON.parse(line.slice('PROGRESS '.length));
      } catch {
        // A malformed progress line is non-fatal; the child exit status is authoritative.
      }
    }
  });
  child.on('error', (error) => {
    training = { ...training, status: 'error', error: error.message };
  });
  child.on('close', (code) => {
    if (code !== 0) {
      training = {
        ...training,
        status: 'error',
        error: stderrBuffer.trim() || `training process exited with code ${code}`,
      };
      return;
    }
    try {
      const result = JSON.parse(stdout);
      training = {
        ...training,
        status: 'complete',
        completedAt: new Date().toISOString(),
        progress: result.training.history.at(-1),
        result,
      };
    } catch (error) {
      training = { ...training, status: 'error', error: `invalid training output: ${error.message}` };
    }
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/model') {
    try {
      json(res, 200, modelInfo());
    } catch (error) {
      json(res, 503, { ready: false, error: error.message });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    try {
      const body = await readJson(req);
      const loaded = loadGenerativeModel(MODEL_PATH);
      const result = generateText(loaded, String(body.prompt || ''), {
        maxNewChars: body.maxNewChars,
        temperature: body.temperature,
        topK: body.topK,
        seed: body.seed,
        stopAtNewline: body.stopAtNewline,
      });
      json(res, 200, result);
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/train') {
    try {
      if (training.status === 'running') {
        json(res, 409, { error: 'training is already running', training });
        return true;
      }
      const body = await readJson(req);
      startTraining(body);
      json(res, 202, training);
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/train/status') {
    json(res, 200, training);
    return true;
  }
  return false;
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = path.resolve(PUBLIC, requested);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`) && filePath !== path.join(PUBLIC, 'index.html')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (url.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, url);
    if (!handled) json(res, 404, { error: 'endpoint not found' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`EoF Neural Network Lab: http://${HOST}:${PORT}`);
  });
}

module.exports = { server, modelInfo };
