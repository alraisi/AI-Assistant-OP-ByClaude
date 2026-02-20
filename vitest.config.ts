import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      exclude: [
        'src/index.ts',
        'src/buddy.ts',
        'src/whatsapp.ts',
        'src/setup/**',
        'src/llm/**',
        'src/__tests__/**',
        'dist/**',
        'persona/**',
        'scripts/**',
        'node_modules/**',
        '*.config.*',
      ],
    },
  },
});
