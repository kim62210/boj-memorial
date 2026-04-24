import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
}

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as PackageJson

describe('production start contract', () => {
  it('does not rely on dev-only tooling', () => {
    const start = pkg.scripts?.start ?? ''
    expect(start).toBeTruthy()

    if (start.includes('tsx')) {
      expect(pkg.dependencies).toHaveProperty('tsx')
      return
    }

    expect(start).toContain('node dist/server.js')
  })
})
