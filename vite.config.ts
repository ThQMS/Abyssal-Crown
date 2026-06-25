import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works when served from a GitHub Pages subpath.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  // NOTE: NÃO incluir '**/*.json' aqui. Marcar .json como asset faz o Vite
  // devolver a URL do arquivo em vez de PARSEAR os dados, quebrando os imports
  // `import data from '@/data/*.json'` (data.map deixaria de existir). Os PNGs
  // do tileset já são resolvidos via import.meta.glob('...?url').
  assetsInclude: ['**/*.png'],
});
