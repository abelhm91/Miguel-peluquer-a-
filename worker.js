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
    if (!api || apiEnv !== env) {
      api = createApi({
        db: d1Adapter(env.DB),
        adminPassword: env.ADMIN_PASSWORD,
        sessionSecret: env.SESSION_SECRET,
        secureCookies: new URL(request.url).protocol === 'https:',
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
