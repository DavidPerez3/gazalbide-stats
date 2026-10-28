// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { siteConfig } from '../../scripts/site-config.mjs';
import fs from 'node:fs';

describe('deploy configuration', () => {
  it('keeps GitHub Pages defaults and supports root domains', () => {
    expect(siteConfig().base).toBe('/gazalbide-stats/');
    expect(siteConfig({ VITE_APP_BASE: '/', VITE_PUBLIC_SITE_URL: 'https://club.example/' })).toEqual({ base: '/', url: 'https://club.example/', domain: 'club.example' });
  });
  it('rejects mismatched, credential-bearing and unsafe URLs', () => {
    for (const url of ['http://club.example/', 'https://user:pass@club.example/', 'https://club.example/?code=secret', 'https://club.example/#/login', 'https://club.example/wrong/']) {
      expect(() => siteConfig({ VITE_APP_BASE: '/', VITE_PUBLIC_SITE_URL: url })).toThrow();
    }
    expect(() => siteConfig({ VITE_APP_BASE: '/../' })).toThrow();
  });
  it('uses portable installation and shortcut URLs with actual icon sizes', () => {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(manifest.scope).toBe('./');
    expect(manifest.start_url).toBe('./');
    for (const icon of manifest.icons) {
      const png = fs.readFileSync(`public/${icon.src}`);
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    expect(manifest.shortcuts.map((item) => item.url)).toEqual(['./#/fantasy', './#/porra']);
  });
});

it('emits a real-host 404 recovery document without guessed redirects or private sitemap URLs',async()=>{
 const {siteMetadataPlugin}=await import('../../scripts/site-config.mjs');
 const os=await import('node:os');const path=await import('node:path');
 for(const config of [siteConfig(),siteConfig({VITE_APP_BASE:'/',VITE_PUBLIC_SITE_URL:'https://gazalbide.ddns.net/'})]){
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'gazal-seo-'));
  try{const plugin=siteMetadataPlugin(config);plugin.configResolved({root:out,build:{outDir:'.'}});plugin.writeBundle();const html=fs.readFileSync(path.join(out,'404.html'),'utf8');expect(html).toContain(`href="${config.url}"`);expect(html).toContain('noindex,nofollow');expect(html).not.toContain('http-equiv');const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8');expect(sitemap).toContain(`<loc>${config.url}</loc>`);expect(sitemap).not.toContain('#');expect(sitemap).not.toContain('admin');expect(fs.readFileSync(path.join(out,'robots.txt'),'utf8')).toContain(`Sitemap: ${config.url}sitemap.xml`);const tags=plugin.transformIndexHtml();expect(tags.find(t=>t.tag==='link'&&t.attrs.rel==='canonical').attrs.href).toBe(config.url);expect(tags.find(t=>t.attrs.property==='og:url').attrs.content).toBe(config.url);}finally{fs.rmSync(out,{recursive:true,force:true});}
 }
});
