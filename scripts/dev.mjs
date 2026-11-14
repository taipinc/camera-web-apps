import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { networkInterfaces } from 'node:os';

const secure = process.argv.includes('--https');
const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || (secure ? 8443 : 8080));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function handle(request, response) {
  try {
    const url = new URL(request.url, 'http://localhost');
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== resolve(root) && !path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      path = resolve(path, 'index.html');
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

async function main() {
let options;
if (secure) {
  try {
    options = {
      key: await readFile(new URL('../.certs/key.pem', import.meta.url)),
      cert: await readFile(new URL('../.certs/cert.pem', import.meta.url)),
    };
  } catch {
    console.error('Missing HTTPS certificate. Run npm run setup:https first. See README.md for iPhone setup.');
    process.exit(1);
  }
}
const server = secure ? https.createServer(options, handle) : http.createServer(handle);
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => {
  const scheme = secure ? 'https' : 'http';
  console.log(`Local: ${scheme}://localhost:${port}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`Network: ${scheme}://${address.address}:${port}`);
    }
  }
});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
