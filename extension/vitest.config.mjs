import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['extension/tests/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['extension/chrome/**/*.js', 'extension/firefox/background.js'],
      reporter: ['text-summary', 'text', 'lcovonly'],
      reportsDirectory: 'coverage/extension',
    },
  },
});
