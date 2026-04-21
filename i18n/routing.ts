import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  localePrefix: 'always',
  localeDetection: false,
})

export type AppLocale = (typeof routing.locales)[number]
