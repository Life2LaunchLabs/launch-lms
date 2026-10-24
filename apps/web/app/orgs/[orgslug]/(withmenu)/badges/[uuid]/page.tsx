import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { normalizeMediaUrl } from '@services/media/media'
import { badgeAwardsApi } from '@services/badges/badges'
import AwardPage from '@components/Badges/AwardPage'

type AwardPageProps = { params: Promise<{ orgslug: string; uuid: string }> }

const load = (uuid: string) => badgeAwardsApi.award(uuid, undefined, { revalidate: 0 }).catch(() => null)

export async function generateMetadata(props: AwardPageProps): Promise<Metadata> {
  const { orgslug, uuid } = await props.params
  const [org, award] = await Promise.all([getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }).catch(() => null), load(uuid)])
  if (!award) return { title: `Badge - ${org?.name || 'Launch LMS'}` }
  const learner = award.learner?.name || award.learner?.username || 'A learner'
  const title = buildPageTitle(`${learner} earned ${award.achievement.name}`, org?.name, getOrgSeoConfig(org))
  const description = award.achievement.description || ''
  const image = normalizeMediaUrl(award.achievement.image_url) || '/empty_thumbnail.png'
  return {
    title,
    description,
    alternates: { canonical: getCanonicalUrl(orgslug, `/badges/${uuid}`) },
    openGraph: { title, description, images: [{ url: image, alt: award.achievement.name }], type: 'article' },
  }
}

export default async function BadgeAwardRoute(props: AwardPageProps) {
  const { orgslug, uuid } = await props.params
  const award = await load(uuid)
  if (!award) notFound()
  return <AwardPage orgslug={orgslug} award={award} />
}
