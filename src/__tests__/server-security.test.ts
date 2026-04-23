import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseAllowedOrigins } = require('../../server-security')

describe('Socket.IO CORS origin parsing', () => {
  it('splits ALLOWED_ORIGINS, trims whitespace, and removes empty entries', () => {
    expect(
      parseAllowedOrigins(' https://boj-memorial.example.com, ,https://staging.example.com '),
    ).toEqual(['https://boj-memorial.example.com', 'https://staging.example.com'])
  })

  it('fails closed in production when ALLOWED_ORIGINS is empty', () => {
    expect(() => parseAllowedOrigins('', 'production')).toThrow(/ALLOWED_ORIGINS/)
  })

  it('allows same-origin local development when ALLOWED_ORIGINS is empty outside production', () => {
    expect(parseAllowedOrigins('', 'development')).toBe(false)
  })
})
