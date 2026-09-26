import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// SMA-174 — the two suites that drive a real Chrome (src/test/layout: nine
// runs of the scenes launcher, five sessions of the page launcher, every one
// of them at once). They get their own project, run AFTER every jsdom file
// (`sequence.groupOrder`), one file at a time: on the 4-vCPU CI runner their
// browsers starved the three vitest workers, and the PlantLibrary tests —
// 1 to 3 s each on their own — stretched past the 20 s timeout (run
// 36248124628: 20 883 ms). The partition is exact and total: the files
// listed here run in `layout`, every other test file in `unit`; the run's
// counts (164 files, 3 363 tests) prove nothing is left out.
const CHROME_SUITES = [
  'src/test/layout/dashboardLayout.test.tsx',
  'src/test/layout/pageLayout.test.tsx',
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, ...CHROME_SUITES],
        },
      },
      {
        extends: true,
        test: {
          name: 'layout',
          include: CHROME_SUITES,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
