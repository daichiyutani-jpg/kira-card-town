/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** ビルド後に dist の全ファイルを事前キャッシュする Service Worker（dist/sw.js）を作る */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'kira-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && f !== '.nojekyll')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const assets = ['./', ...files];
      const sw = readFileSync('sw/sw-template.js', 'utf8')
        .replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`)
        .replace('const ASSETS = __ASSETS__;', `const ASSETS = ${JSON.stringify(assets, null, 2)};`);
      if (sw.includes('__VERSION__') || sw.includes('__ASSETS__')) throw new Error('sw-template.js の置き換えに失敗しました');
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, '.nojekyll'), '');
      console.log(`\n[service worker] version ${version}, ${assets.length} files precached`);
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorkerPlugin()],
  build: {
    target: ['es2020', 'safari15', 'chrome90'],
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
