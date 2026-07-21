import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections, getLearningBadges, getLearningPath } from '@services/learning/learning'
import { getOrgPodcasts } from '@services/podcasts/podcasts'
import { NextRequest, NextResponse } from 'next/server'

function getBaseUrlFromRequest(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost'
  const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}/`
}

export async function GET(request: NextRequest) {
  const orgSlug = request.headers.get('X-Sitemap-Orgslug')
  const sitemapType = request.nextUrl.searchParams.get('type')

  if (!orgSlug) {
    return NextResponse.json(
      { error: 'Missing X-Sitemap-Orgslug header' },
      { status: 400 }
    )
  }

  const baseUrl = getBaseUrlFromRequest(request)

  // If no type specified, return sitemap index
  if (!sitemapType) {
    const sitemapIndex = generateSitemapIndex(baseUrl)
    return new NextResponse(sitemapIndex, {
      headers: { 'Content-Type': 'application/xml' },
    })
  }

  const orgInfo = await getOrganizationContextInfo(orgSlug, null)

  let sitemapUrls: SitemapUrl[] = []

  switch (sitemapType) {
    case 'pages': {
      sitemapUrls = [
        { loc: baseUrl, priority: 1.0, changefreq: 'daily' },
        { loc: `${baseUrl}badges`, priority: 0.9, changefreq: 'weekly' },
        { loc: `${baseUrl}podcasts`, priority: 0.9, changefreq: 'weekly' },
        { loc: `${baseUrl}news`, priority: 0.8, changefreq: 'weekly' },
      ]
      break
    }
    case 'badges': {
      const response = await getLearningBadges(orgInfo.id).catch(() => ({ data: [] }))
      const badges = Array.isArray(response) ? response : response?.data || []
      for (const badge of badges) {
        sitemapUrls.push({
          loc: `${baseUrl}badges/${badge.badge_uuid.replace('badge_', '')}`,
          priority: 0.7,
          changefreq: 'weekly',
          lastmod: badge.update_date,
        })
      }
      break
    }
    case 'activities': {
      const response = await getLearningBadges(orgInfo.id).catch(() => ({ data: [] }))
      const badges = Array.isArray(response) ? response : response?.data || []
      for (const badge of badges) {
        try {
          const path = await getLearningPath(badge.badge_uuid, undefined, true)
          for (const activity of path?.activities || []) {
            if (activity.activity_uuid) {
              sitemapUrls.push({
                loc: `${baseUrl}badges/${badge.badge_uuid.replace('badge_', '')}/chapter/${activity.activity_uuid.replace('learning_activity_', '')}`,
                priority: 0.6,
                changefreq: 'weekly',
                lastmod: activity.update_date,
              })
            }
          }
        } catch {
          // Skip activities for this badge if metadata fetch fails.
        }
      }
      break
    }
    case 'badge-collections': {
      const response = await getLearningBadgeCollections(orgInfo.id).catch(() => ({ data: [] }))
      const collections = Array.isArray(response) ? response : response?.data || []
      for (const collection of collections) {
        sitemapUrls.push({
          loc: `${baseUrl}badges?collection=${collection.collection_uuid}`,
          priority: 0.6,
          changefreq: 'weekly',
          lastmod: collection.update_date,
        })
      }
      break
    }
    case 'podcasts': {
      const podcasts = await getOrgPodcasts(orgSlug, null).catch(() => [])
      for (const podcast of podcasts) {
        sitemapUrls.push({
          loc: `${baseUrl}podcast/${podcast.podcast_uuid.replace('podcast_', '')}`,
          priority: 0.7,
          changefreq: 'weekly',
          lastmod: podcast.update_date,
        })
      }
      break
    }
    default: {
      return NextResponse.json({ error: 'Invalid sitemap type' }, { status: 400 })
    }
  }

  const sitemap = generateSitemap(sitemapUrls)
  return new NextResponse(sitemap, {
    headers: { 'Content-Type': 'application/xml' },
  })
}

interface SitemapUrl {
  loc: string
  priority: number
  changefreq: string
  lastmod?: string
}

const SITEMAP_TYPES = ['pages', 'badges', 'activities', 'badge-collections', 'podcasts']

function generateSitemapIndex(baseUrl: string): string {
  const sitemaps = SITEMAP_TYPES.map(type => `
  <sitemap>
    <loc>${baseUrl}sitemap.xml?type=${type}</loc>
  </sitemap>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`
}

function generateSitemap(urls: SitemapUrl[]): string {
  const urlEntries = urls
    .map(({ loc, priority, changefreq, lastmod }) => {
      let entry = `
    <url>
      <loc>${loc}</loc>
      <priority>${priority.toFixed(1)}</priority>
      <changefreq>${changefreq}</changefreq>`
      if (lastmod) {
        entry += `
      <lastmod>${lastmod.split('T')[0]}</lastmod>`
      }
      entry += `
    </url>`
      return entry
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}
