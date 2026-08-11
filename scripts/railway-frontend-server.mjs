import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.env.PORT || 3000);
const root = resolve('dist/rawafed-admission-management/browser');
const apiBaseUrl = String(process.env.API_BASE_URL || process.env.RAWAFED_API_BASE_URL || '').replace(/\/$/, '');

if (!existsSync(join(root, 'index.html'))) {
  throw new Error(`Angular build output was not found at ${root}. Run npm run build first.`);
}
if (process.env.NODE_ENV === 'production' && !/^https:\/\/[^/]+\/api$/.test(apiBaseUrl)) {
  throw new Error('API_BASE_URL must be an HTTPS Railway backend URL ending in /api.');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const sendFile = (res, filePath, method) => {
  const extension = extname(filePath).toLowerCase();
  const immutable = /(?:^|\/)(?:chunk-|main-|styles-|polyfills-).+\.[a-z0-9]+$/i.test(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    'Content-Length': statSync(filePath).size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (method === 'HEAD') return res.end();
  createReadStream(filePath).pipe(res);
};

createServer((req, res) => {
  const method = req.method || 'GET';
  if (!['GET', 'HEAD'].includes(method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', service: 'rawafed-erp-frontend' }));
  }
  if (pathname === '/runtime-config') {
    const body = `window.RAWAFED_API_BASE_URL=${JSON.stringify(apiBaseUrl)};`;
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    return res.end(method === 'HEAD' ? undefined : body);
  }

  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const candidate = resolve(root, relative);
  if (candidate.startsWith(`${root}/`) && existsSync(candidate) && statSync(candidate).isFile()) {
    return sendFile(res, candidate, method);
  }
  return sendFile(res, join(root, 'index.html'), method);
}).listen(port, '0.0.0.0', () => {
  console.log(`Rawafed Railway frontend listening on 0.0.0.0:${port}`);
});
