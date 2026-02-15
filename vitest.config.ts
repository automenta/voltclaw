import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'examples', '**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      'voltclaw': resolve(__dirname, 'src/index.ts'),
      '@voltclaw/nostr': resolve(__dirname, 'src/nostr/index.ts'),
      '@voltclaw/llm': resolve(__dirname, 'src/llm/index.ts'),
      '@voltclaw/memory': resolve(__dirname, 'src/memory/index.ts'),
      '@voltclaw/tools': resolve(__dirname, 'src/tools/index.ts'),
      '@voltclaw/testing': resolve(__dirname, 'src/testing/index.ts'),
      '@voltclaw/cli': resolve(__dirname, 'src/cli/index.ts')
    }
  }
});
