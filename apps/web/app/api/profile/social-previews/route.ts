export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

type SocialPreviewItem = {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
}

const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[a-zA-Z0-9_-]{20,}$/
const HANDLE_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/
const execFileAsync = promisify(execFile)

function cleanHandle(value: string) {
  const trimmed = value.trim().replace(/^@+/, '').replace(/^\/+/, '')
  return trimmed.split(/[/?#]/)[0]
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`)
  } catch {
    return value.replace(/\\u0026/g, '&').replace(/\\\//g, '/')
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'LaunchLMS/1.0 (+https://launchlms.com)',
    },
    next: { revalidate: 900 },
  })
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  return response.text()
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'x-ig-app-id': '936619743392459',
    },
    next: { revalidate: 900 },
  })
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  return response.json()
}

async function fetchJsonWithCurl(url: string) {
  const { stdout } = await execFileAsync('curl', [
    '-L',
    '--silent',
    '--show-error',
    '--max-time',
    '10',
    url,
    '-H',
    'accept: application/json,text/plain,*/*',
    '-H',
    'accept-language: en-US,en;q=0.9',
    '-H',
    'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    '-H',
    'x-asbd-id: 129477',
    '-H',
    'x-ig-app-id: 936619743392459',
    '-H',
    'x-requested-with: XMLHttpRequest',
    '-H',
    'cookie: ig_nrcb=1',
  ], { maxBuffer: 1024 * 1024 * 2 })

  return JSON.parse(stdout)
}

async function fetchImageWithCurl(url: string) {
  const { stdout } = await execFileAsync('curl', [
    '-L',
    '--silent',
    '--show-error',
    '--max-time',
    '10',
    url,
    '-H',
    'accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    '-H',
    'referer: https://www.instagram.com/',
    '-H',
    'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  ], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 5 })

  return stdout
}

function getProxiedInstagramImageUrl(url: string) {
  if (!url) return ''
  return `/api/profile/social-previews?image=${encodeURIComponent(url)}`
}

function getXmlTag(entry: string, tagName: string) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`).exec(entry)
  return match ? decodeHtml(match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()) : ''
}

async function resolveYouTubeChannelId(handle: string) {
  if (YOUTUBE_CHANNEL_ID_PATTERN.test(handle)) return handle

  const page = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`)
  const matches = [
    /"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,
    /<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{20,})">/,
    /\/channel\/(UC[a-zA-Z0-9_-]{20,})/,
  ]

  for (const pattern of matches) {
    const match = pattern.exec(page)
    if (match?.[1]) return match[1]
  }

  return ''
}

async function getYouTubePreviews(handle: string): Promise<SocialPreviewItem[]> {
  const channelId = await resolveYouTubeChannelId(handle)
  if (!channelId) return []

  const feed = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`)
  const entries = feed.match(/<entry>[\s\S]*?<\/entry>/g) || []

  return entries.slice(0, 6).map((entry) => {
    const videoId = getXmlTag(entry, 'yt:videoId')
    const title = getXmlTag(entry, 'title')
    const hrefMatch = /<link rel="alternate" href="([^"]+)"/.exec(entry)
    const thumbnailMatch = /<media:thumbnail url="([^"]+)"/.exec(entry)

    return {
      id: videoId || hrefMatch?.[1] || title,
      title,
      url: decodeHtml(hrefMatch?.[1] || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/@${handle}`)),
      thumbnailUrl: decodeHtml(thumbnailMatch?.[1] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '')),
    }
  }).filter((item) => item.id && item.url)
}

function collectInstagramImageUrls(page: string) {
  const urls = new Set<string>()
  const patterns = [
    /"thumbnail_src":"([^"]+)"/g,
    /"display_url":"([^"]+)"/g,
    /"profile_pic_url_hd":"([^"]+)"/g,
    /"profile_pic_url":"([^"]+)"/g,
  ]

  for (const pattern of patterns) {
    for (const match of page.matchAll(pattern)) {
      if (!match[1]) continue
      urls.add(decodeJsonString(match[1]))
      if (urls.size >= 6) return Array.from(urls)
    }
  }

  return Array.from(urls)
}

async function getInstagramPreviews(handle: string): Promise<SocialPreviewItem[]> {
  try {
    const mediaItems = await getInstagramApiPreviews(handle)
    if (mediaItems.length > 0) return mediaItems
  } catch {
    // Fall through to the lower-fidelity public page parser.
  }

  const page = await fetchText(`https://www.instagram.com/${encodeURIComponent(handle)}/`)
  const imageUrls = collectInstagramImageUrls(page)

  return imageUrls.slice(0, 6).map((thumbnailUrl, index) => ({
    id: `${handle}-${index}`,
    title: `Instagram preview ${index + 1}`,
    url: `https://www.instagram.com/${handle}/`,
    thumbnailUrl,
  }))
}

async function getInstagramApiPreviews(handle: string): Promise<SocialPreviewItem[]> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`
  let data: any

  try {
    data = await fetchJson(url)
  } catch {
    data = await fetchJsonWithCurl(url)
  }

  const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges
  if (!Array.isArray(edges)) return []

  return edges.slice(0, 6).map((edge: any, index: number) => {
    const node = edge?.node || {}
    const shortcode = String(node.shortcode || '')
    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || ''
    const thumbnailUrl = node.thumbnail_src || node.display_url || node.thumbnail_resources?.at(-1)?.src || ''

    return {
      id: String(node.id || shortcode || `${handle}-${index}`),
      title: caption || `Instagram preview ${index + 1}`,
      url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${handle}/`,
      thumbnailUrl: getProxiedInstagramImageUrl(thumbnailUrl),
    }
  }).filter((item) => item.thumbnailUrl)
}

function isAllowedInstagramImageUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (
      url.hostname === 'instagram.com' ||
      url.hostname.endsWith('.instagram.com') ||
      url.hostname === 'fbcdn.net' ||
      url.hostname.endsWith('.fbcdn.net')
    )
  } catch {
    return false
  }
}

async function getInstagramImageResponse(imageUrl: string) {
  if (!isAllowedInstagramImageUrl(imageUrl)) {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'referer': 'https://www.instagram.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      next: { revalidate: 900 },
    })

    if (response.ok && response.body) {
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'cache-control': 'public, max-age=900, stale-while-revalidate=3600',
          'content-type': response.headers.get('content-type') || 'image/jpeg',
        },
      })
    }
  } catch {
    // Curl succeeds for some Instagram/CDN requests that reject Node fetch.
  }

  const imageBuffer = await fetchImageWithCurl(imageUrl)
  if (!imageBuffer.byteLength) {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 502 })
  }

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=900, stale-while-revalidate=3600',
      'content-type': 'image/jpeg',
    },
  })
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get('image')
  if (imageUrl) return getInstagramImageResponse(imageUrl)

  const site = request.nextUrl.searchParams.get('site')
  const handle = cleanHandle(request.nextUrl.searchParams.get('handle') || '')

  if ((site !== 'youtube' && site !== 'instagram') || !handle) {
    return NextResponse.json({ items: [] }, { status: 400 })
  }

  if (!YOUTUBE_CHANNEL_ID_PATTERN.test(handle) && !HANDLE_PATTERN.test(handle)) {
    return NextResponse.json({ items: [] }, { status: 400 })
  }

  try {
    const items = site === 'youtube'
      ? await getYouTubePreviews(handle)
      : await getInstagramPreviews(handle)

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
