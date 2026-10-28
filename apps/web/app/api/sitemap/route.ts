import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { planJoiningApi } from '@services/goals/planJoining'
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
        { loc: `${baseUrl}discover`, priority: 0.9, changefreq: 'weekly' },
        { loc: `${baseUrl}news`, priority: 0.8, changefreq: 'weekly' },
      ]
      break
    }
    case 'plans':
    case 'collections': {
      const feed = await planJoiningApi.discover(undefined, undefined, orgInfo.id).catch(() => null)
      if (sitemapType === 'plans') {
        for (const plan of feed?.plans || []) {
          sitemapUrls.push({ loc: `${baseUrl}discover/plans/${plan.template_uuid}`, priority: 0.7, changefreq: 'weekly', lastmod: plan.update_date })
        }
      } else {
        for (const collection of feed?.collections || []) {
          sitemapUrls.push({ loc: `${baseUrl}discover/collections/${collection.collection_uuid}`, priority: 0.6, changefreq: 'weekly' })
        }
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

const SITEMAP_TYPES = ['pages', 'plans', 'collections']

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
