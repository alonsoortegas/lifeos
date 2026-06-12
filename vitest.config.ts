import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    // server-only throws unless the Next.js bundler resolves its exports condition.
    // In Vitest (Node.js) we alias it to a no-op so tests can import server-only
    // modules without the guard firing — the modules are still server-side anyway.
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'test-utils/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
})
