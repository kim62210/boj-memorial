import type { MetadataRoute } from 'next'

const SITE_URL = 'https://boj-memorial.brian-dev.cloud'
const LAST_CONTENT_UPDATE = new Date('2026-04-21T00:00:00.000Z')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: LAST_CONTENT_UPDATE,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
