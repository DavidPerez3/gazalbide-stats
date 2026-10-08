import fs from 'node:fs';
import path from 'node:path';

export function siteConfig(env = {}, development = false) {
  const base = env.VITE_APP_BASE || (development ? '/' : '/gazalbide-stats/');
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('VITE_APP_BASE debe ser una ruta absoluta con barra final.');
  const site = new URL(env.VITE_PUBLIC_SITE_URL || `https://davidperez3.github.io${base}`);
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== base) {
    throw new Error('VITE_PUBLIC_SITE_URL debe usar HTTPS y coincidir con VITE_APP_BASE, sin credenciales, query ni hash.');
  }
  if (site.hostname !== 'davidperez3.github.io' && base !== '/') throw new Error('El dominio propio debe usar VITE_APP_BASE=/');
  return { base, url: site.href, domain: site.hostname === 'davidperez3.github.io' ? null : site.hostname };
}
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export function siteMetadataPlugin(config) {
  let outDir;
  return {
    name: 'gazalbide-site-metadata',
    configResolved(vite) { outDir = path.resolve(vite.root, vite.build.outDir); },
    transformIndexHtml() {
      const description = 'Partidos, estadísticas, Fantasy y GazalBet de Gazalbide CB.';
      return [
        { tag: 'meta', attrs: { name: 'description', content: description } },
        { tag: 'link', attrs: { rel: 'canonical', href: config.url } },
        ...Object.entries({ 'og:type': 'website', 'og:locale': 'es_ES', 'og:title': 'Gazalbide Stats', 'og:description': description, 'og:url': config.url, 'og:image': `${config.url}icon-512.png`, 'og:image:width': '512', 'og:image:height': '512' }).map(([property, content]) => ({ tag: 'meta', attrs: { property, content } })),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
      ];
    },
    writeBundle() {
      fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.url}sitemap.xml\n`);
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(config.url)}</loc></url></urlset>\n`);
      const cname = path.join(outDir, 'CNAME');
      if (config.domain) fs.writeFileSync(cname, `${config.domain}\n`);
      else if (fs.existsSync(cname)) fs.unlinkSync(cname);
    },
  };
}
