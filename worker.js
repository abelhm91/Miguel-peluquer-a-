// Punto de entrada en Cloudflare Workers.
// Las páginas y estilos de /public los sirve Cloudflare como "static assets";
// este Worker solo atiende /api/* contra la base de datos D1.
import { d1Adapter } from './server/db.js';
import { createApi } from './server/app.js';

let api;
let apiEnv;

export default {
  async fetch(request, env) {
    if (!api || apiEnv !== env) {
      api = createApi({
        db: d1Adapter(env.DB),
        adminPassword: env.ADMIN_PASSWORD,
        sessionSecret: env.SESSION_SECRET,
        secureCookies: new URL(request.url).protocol === 'https:',
      });
      apiEnv = env;
    }
    const res = await api(request);
    return res ?? env.ASSETS.fetch(request);
  },
};
