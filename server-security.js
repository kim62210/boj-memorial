'use strict'

function parseAllowedOrigins(value, nodeEnv) {
  const origins = String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length > 0) return origins

  if (nodeEnv === 'production') {
    throw new Error('ALLOWED_ORIGINS must be set in production')
  }

  return false
}

module.exports = {
  parseAllowedOrigins,
}
