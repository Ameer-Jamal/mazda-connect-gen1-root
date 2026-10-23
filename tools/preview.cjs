'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/controller.js': ['controller.js', 'text/javascript; charset=utf-8'],
  '/mock-adapter.js': ['mock-adapter.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/palette.css': ['palette.css', 'text/css; charset=utf-8']
};
function createServer() {
  return http.createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'");
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { response.writeHead(400).end('Invalid request target'); return; }
    const asset = Object.hasOwn(files, pathname) ? files[pathname] : null;
    if (!asset || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end('Not found'); return;
    }
    fs.readFile(path.join(__dirname, '../simulator', asset[0]), (error, bytes) => {
      if (error) { response.writeHead(500).end('Preview asset unavailable'); return; }
      response.setHeader('Content-Type', asset[1]);
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : bytes);
    });
  });
}
if (require.main === module) {
  const server = createServer();
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('Offline simulator: http://127.0.0.1:4173 (loopback only; inherited payloads are not served)'));
}
module.exports = { createServer };
