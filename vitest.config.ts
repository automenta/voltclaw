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
      'voltclaw': resolve(__dirname, 'packages/voltclaw/src/index.ts'),
      '@voltclaw/nostr': resolve(__dirname, 'packages/@voltclaw/nostr/src/index.ts'),
      '@voltclaw/llm': resolve(__dirname, 'packages/@voltclaw/llm/src/index.ts'),
      '@voltclaw/memory': resolve(__dirname, 'packages/@voltclaw/memory/src/index.ts'),
      '@voltclaw/tools': resolve(__dirname, 'packages/@voltclaw/tools/src/index.ts'),
      '@voltclaw/testing': resolve(__dirname, 'packages/@voltclaw/testing/src/index.ts')
    }
  }
});
