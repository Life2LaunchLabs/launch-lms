import { ImageResponse } from 'next/og'
import { planPalette } from '@components/Goals/planColors'
import { badgeAwardsApi, badgeKindLabel } from '@services/badges/badges'

export const runtime = 'nodejs'
export const revalidate = 3600

/** An image as a data URL, or nothing when it can't be read, so a missing badge image never breaks the card. */
async function inline(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { next: { revalidate: 3600 } })
    const type = response.headers.get('content-type') || ''
    if (!response.ok || !/^image\/(png|jpe?g|gif|webp)/.test(type)) return null
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

/** The card shown when a badge's page is shared (Open Graph / X): the badge, who earned it, and who awarded it. */
export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params
  const award = await badgeAwardsApi.byCode(code, { revalidate: 300 }).catch(() => null)
  if (!award) return new Response('Not found', { status: 404 })
  const badge = award.achievement
  const color = planPalette(badge.color || 'blue')
  // Stored media is read through the internal host when there is one, not back out through the public domain.
  const base = process.env.LAUNCHLMS_INTERNAL_API_URL ? new URL(process.env.LAUNCHLMS_INTERNAL_API_URL).origin : request.url
  const source = badge.image_url ? new URL(badge.image_url.replace('/api/v1/content/', '/content/'), base).toString() : ''
  const image = source ? await inline(source) : null
  const learner = award.learner?.name || award.learner?.username || 'A learner'
  const revoked = award.status === 'revoked'
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 64, padding: '0 88px', background: '#fffdf8', color: '#13202a', borderTop: `18px solid ${color.deep}` }}>
      {image
        ? <img src={image} width={300} height={300} style={{ borderRadius: 150, objectFit: 'cover' }} alt="" />
        : <div style={{ width: 300, height: 300, borderRadius: 150, background: color.face, border: `14px solid ${color.edge}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.faceInk, fontSize: 140, fontWeight: 700 }}>
          {(badge.name || '?').slice(0, 1).toUpperCase()}
        </div>}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: revoked ? '#b91c1c' : color.deep }}>
          {revoked ? 'Revoked' : badgeKindLabel(badge.kind)}
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.08 }}>{badge.name}</div>
        <div style={{ fontSize: 34, color: '#5b6770' }}>{`Earned by ${learner}${award.issuing_org ? ` · ${award.issuing_org.name}` : ''}`}</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}
