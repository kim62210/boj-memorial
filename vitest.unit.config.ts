import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
    },
  },
  test: {
    name: 'unit',
    include: [
      'lib/realtime/**/*.test.ts',
      'lib/api/**/*.test.ts',
      'lib/security/**/*.test.ts',
      'lib/validation/**/*.test.ts',
      'src/runtime/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/realtime/**/*.ts'],
      exclude: [
        'lib/realtime/**/*.test.ts',
        'lib/realtime/index.ts',
        'lib/realtime/io.ts',
        'lib/realtime/repositories.ts',
        'lib/realtime/socketHandlers.ts',
        'lib/realtime/types.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
})
