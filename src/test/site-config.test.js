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
