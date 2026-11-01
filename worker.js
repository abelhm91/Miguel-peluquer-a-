// Punto de entrada en Cloudflare Workers.
// Las páginas y estilos de /public los sirve Cloudflare como "static assets";
// este Worker solo atiende /api/* contra la base de datos D1.
import { d1Adapter } from './server/db.js';
import { createApi } from './server/app.js';
import { sendDailySummary } from './server/summary.js';

let api;
let apiEnv;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') {
      return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
    }
    if (url.pathname === '/sitemap.xml') {
      const location = `${url.origin}/`;
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${location}</loc></url></urlset>`, {
        headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
    }
    if (!api || apiEnv !== env) {
      api = createApi({
        db: d1Adapter(env.DB),
        adminPassword: env.ADMIN_PASSWORD,
        sessionSecret: env.SESSION_SECRET,
        secureCookies: url.protocol === 'https:',
        notifyEnv: env,
      });
      apiEnv = env;
    }
    const res = await api(request, ctx);
    return res ?? env.ASSETS.fetch(request);
  },

  // Cron Trigger (wrangler.jsonc → triggers.crons): resumen de las citas de mañana.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      sendDailySummary({ db: d1Adapter(env.DB), env, siteUrl: env.SITE_URL || 'https://miguel-peluquer-a.abelacheeme.workers.dev' })
        .then((r) => console.log('resumen diario', JSON.stringify(r)))
        .catch((e) => console.error('resumen diario', e))
    );
  },
};
