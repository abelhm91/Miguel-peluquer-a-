// Servidor local con Node (desarrollo y pruebas). En producción se usa Cloudflare (worker.js).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';
import { nodeAdapter } from './server/db.js';
import { createApi } from './server/app.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const port = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const PAGES = { '/': 'index.html', '/admin': 'admin.html', '/cita': 'cita.html', '/aviso-legal': 'aviso-legal.html', '/privacidad': 'privacidad.html' };

if (!process.env.ADMIN_PASSWORD) console.warn('⚠  ADMIN_PASSWORD no está definida: el panel /admin estará desactivado.');

const db = await nodeAdapter(process.env.DATABASE_FILE || join(root, 'data', 'reservas.db'));
const api = createApi({
  db,
  adminPassword: process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
  secureCookies: process.env.NODE_ENV === 'production',
  notifyEnv: process.env,
});

async function serveStatic(req, res, pathname) {
  const rel = PAGES[pathname.replace(/\/+$/, '') || '/'] || pathname.slice(1);
  const file = normalize(join(publicDir, decodeURIComponent(rel)));
  const info = file.startsWith(publicDir) ? await stat(file).catch(() => null) : null;
  if (!info?.isFile()) {
    res.writeHead(404, { 'content-type': MIME['.html'] });
    return res.end(await readFile(join(publicDir, '404.html')).catch(() => 'No encontrado'));
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : await readFile(file));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`);
    }
    if (url.pathname === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url></urlset>`);
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])),
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const r = await api(request);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('Error');
  }
}).listen(port, () => console.log(`Reservas de Miguel de la Cruz en http://localhost:${port}  (panel: /admin)`));
