import { koAdjectives, koNouns } from './ko'

const PAD_LENGTH = 2

interface NicknameDictionary {
  adjectives: readonly string[]
  nouns: readonly string[]
}

const dictionaries: Record<string, NicknameDictionary> = {
  ko: { adjectives: koAdjectives, nouns: koNouns },
}

function pickRandom<T>(arr: readonly T[]): T {
  const index = Math.floor(Math.random() * arr.length)
  const value = arr[index]
  if (value === undefined) {
    throw new Error('Nickname dictionary is empty')
  }
  return value
}

export function generateNickname(locale = 'ko'): string {
  const dict = dictionaries[locale] ?? dictionaries.ko
  if (!dict) {
    throw new Error(`Missing nickname dictionary for locale: ${locale}`)
  }
  const adjective = pickRandom(dict.adjectives)
  const noun = pickRandom(dict.nouns)
  const suffix = String(Math.floor(Math.random() * 100)).padStart(PAD_LENGTH, '0')
  return `${adjective} ${noun}${suffix}`
}

export { koAdjectives, koNouns }
