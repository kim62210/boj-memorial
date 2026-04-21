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
    name: 'integration',
    include: ['src/tests/api/**/*.test.ts', 'tests/socket/**/*.test.ts'],
    testTimeout: 45_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: 'v8',
      include: ['app/api/**/*.ts', 'lib/realtime/socketHandlers.ts'],
      exclude: ['app/**/layout.tsx', 'app/**/page.tsx'],
      thresholds: {
        lines: 90,
        statements: 90,
      },
    },
  },
})
