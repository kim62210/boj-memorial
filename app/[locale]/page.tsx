import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { MemorialScene } from '@/components/scene'
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

  return (
    <main className="relative min-h-dvh">
      <MemorialScene />
    </main>
  )
}
