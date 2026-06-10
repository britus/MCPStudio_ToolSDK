#!/usr/bin/env node

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf8');
  console.log(JSON.stringify({
    ok: true,
    argv: process.argv.slice(2),
    stdin: stdin ? JSON.parse(stdin) : null
  }, null, 2));
});
