import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { routing, type AppLocale } from '@/i18n/routing'

interface HomePageProps {
  params: Promise<{ locale: string }>
}

export function generateStaticParams(): Array<{ locale: AppLocale }> {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const tEntry = await getTranslations('entry')
  const tTombstone = await getTranslations('tombstone')
  const tMetadata = await getTranslations('metadata')

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-24">
      <section className="max-w-xl space-y-6 text-center">
        <p className="text-sm tracking-[0.3em] text-[color:var(--color-text-muted)] uppercase">
          {tTombstone('rip')}
        </p>
        <h1 className="text-4xl font-bold sm:text-5xl">{tEntry('title')}</h1>
        <p className="text-base leading-relaxed text-[color:var(--color-text-secondary)]">
          {tEntry('instruction')}
        </p>
        <p className="text-xs text-[color:var(--color-text-muted)]">{tMetadata('description')}</p>
      </section>
    </main>
  )
}
