import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localeFiles = ['ko', 'en'].map((locale) => ({
  locale,
  file: path.join(rootDir, 'messages', `${locale}.json`),
}))

const flattenKeys = (value, prefix = '') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenKeys(child, prefix ? `${prefix}.${key}` : key),
    )
  }

  return [prefix]
}

const collectHtmlValues = (value, prefix = '') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      collectHtmlValues(child, prefix ? `${prefix}.${key}` : key),
    )
  }

  if (typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)) {
    return [prefix]
  }

  return []
}

const readMessages = async ({ locale, file }) => {
  const content = await readFile(file, 'utf8')
  return { locale, messages: JSON.parse(content) }
}

const localeMessages = await Promise.all(localeFiles.map(readMessages))
const [base] = localeMessages
const baseKeys = new Set(flattenKeys(base.messages))
const failures = []

for (const { locale, messages } of localeMessages) {
  const keys = new Set(flattenKeys(messages))
  const missing = [...baseKeys].filter((key) => !keys.has(key))
  const extra = [...keys].filter((key) => !baseKeys.has(key))
  const htmlValues = collectHtmlValues(messages)

  if (missing.length > 0) {
    failures.push(`${locale}: missing keys\n${missing.map((key) => `  - ${key}`).join('\n')}`)
  }

  if (extra.length > 0) {
    failures.push(`${locale}: extra keys\n${extra.map((key) => `  - ${key}`).join('\n')}`)
  }

  if (htmlValues.length > 0) {
    failures.push(
      `${locale}: raw HTML in message values\n${htmlValues.map((key) => `  - ${key}`).join('\n')}`,
    )
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `i18n verification passed (${baseKeys.size} keys, ${localeMessages.length} locales)\n`,
)
