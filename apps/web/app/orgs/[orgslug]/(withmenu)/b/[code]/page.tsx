import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { routePaths } from '@services/config/config'
import { badgeAwardsApi } from '@services/badges/badges'
import AwardPage from '@components/Badges/AwardPage'

type AwardPageProps = { params: Promise<{ orgslug: string; code: string }> }

const load = (code: string) => badgeAwardsApi.byCode(code, { revalidate: 0 }).catch(() => null)

export async function generateMetadata(props: AwardPageProps): Promise<Metadata> {
  const { orgslug, code } = await props.params
  const [org, award] = await Promise.all([getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }).catch(() => null), load(code)])
  if (!award) return { title: `Badge - ${org?.name || 'Launch LMS'}` }
  const learner = award.learner?.name || award.learner?.username || 'A learner'
  const title = buildPageTitle(`${learner} earned ${award.achievement.name}`, org?.name, getOrgSeoConfig(org))
  const issuer = award.issuing_org?.name
  const description = award.status === 'revoked'
    ? `${issuer || 'The issuer'} revoked this badge.`
    : `${issuer ? `Awarded by ${issuer}. ` : ''}${award.achievement.description || ''}`.trim()
  const canonical = getCanonicalUrl(orgslug, routePaths.org.badgeAward(award.code))
  // The preview card is drawn by the web app itself (app/api/badges/[code]/image).
  const image = `${new URL(canonical).origin}/api/badges/${encodeURIComponent(award.code)}/image`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: [{ url: image, width: 1200, height: 630, alt: `${award.achievement.name} badge` }], type: 'article' },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    robots: award.status === 'revoked' ? { index: false } : undefined,
  }
}

export default async function BadgeAwardRoute(props: AwardPageProps) {
  const { orgslug, code } = await props.params
  const award = await load(code)
  if (!award) notFound()
  const { check, ...rest } = award
  return <AwardPage orgslug={orgslug} award={rest} check={check} pageUrl={getCanonicalUrl(orgslug, routePaths.org.badgeAward(award.code))} />
}
