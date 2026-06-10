#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');

function readStdin() {
  return new Promise(resolve => {
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function parseInput(raw) {
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function readFilePreview(filePath, maxBytes) {
  if (!filePath) {
    return null;
  }
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const length = Math.min(Number(maxBytes) || 512, stat.size);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return {
      path: filePath,
      size: stat.size,
      preview: buffer.toString('utf8')
    };
  } finally {
    fs.closeSync(fd);
  }
}

function fetchUrlSummary(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }

    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, { method: 'GET', timeout: 5000 }, res => {
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024) {
          req.destroy();
        }
      });
      res.on('end', () => resolve({
        url,
        statusCode: res.statusCode,
        contentType: res.headers['content-type'] || '',
        bytesRead: bytes
      }));
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const input = parseInput(await readStdin());
    const file = readFilePreview(input.filePath, input.maxBytes);
    const response = await fetchUrlSummary(input.url);

    console.log(JSON.stringify({
      ok: true,
      modules: ['fs', 'http', 'https'],
      node: process.version,
      argv: process.argv.slice(2),
      file,
      response
    }, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
})();
