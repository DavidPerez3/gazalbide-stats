import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { siteConfig, siteMetadataPlugin } from './scripts/site-config.mjs';

export default defineConfig(({ mode, command }) => {
  const config = siteConfig(loadEnv(mode, process.cwd(), ''), command === 'serve');
  return { plugins: [react(), siteMetadataPlugin(config)], base: config.base };
});
