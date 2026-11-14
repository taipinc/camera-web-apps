import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const check = spawnSync('mkcert', ['-version'], { encoding: 'utf8' });
if (check.error || check.status !== 0) {
  console.error('Install mkcert first: brew install mkcert\nThen run: mkcert -install\nSee README.md for iPhone certificate setup.');
  process.exit(1);
}
const directory = new URL('../.certs/', import.meta.url);
await mkdir(directory, { recursive: true });
const ips = Object.values(networkInterfaces()).flat().filter((address) => address?.family === 'IPv4' && !address.internal).map((address) => address.address);
const result = spawnSync('mkcert', [
  '-key-file', fileURLToPath(new URL('key.pem', directory)),
  '-cert-file', fileURLToPath(new URL('cert.pem', directory)),
  'localhost', '127.0.0.1', '::1', ...new Set(ips),
], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log('Certificate ready. Run npm run dev:https.');
