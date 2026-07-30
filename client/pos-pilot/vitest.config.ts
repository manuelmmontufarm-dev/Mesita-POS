import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'client/pos-pilot',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
