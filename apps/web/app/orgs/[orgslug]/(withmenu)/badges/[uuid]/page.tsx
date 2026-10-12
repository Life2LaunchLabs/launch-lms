import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgOgImageMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { badgeDiscoverApi } from '@services/learning/badgeDiscover'
import BadgeDetail from '@components/Badges/detail/BadgeDetail'

type BadgePageProps = { params: Promise<{ orgslug: string; uuid: string }> }

async function loadBadge(uuid: string) {
  const session = await getServerSession()
  return badgeDiscoverApi.badge(uuid, session?.tokens?.access_token ?? undefined, { revalidate: 0, tags: ['learning-badges'] }).catch(() => null)
}

export async function generateMetadata(props: BadgePageProps): Promise<Metadata> {
  const { orgslug, uuid } = await props.params
  const [org, page] = await Promise.all([getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }), loadBadge(uuid)])
  if (!page) return { title: `Badge - ${org?.name || 'Launch LMS'}` }
  const seoConfig = getOrgSeoConfig(org)
  const title = buildPageTitle(page.name, org.name, seoConfig)
  const fallbackImage = seoConfig.default_og_image ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image) : null
  const image = normalizeMediaUrl(page.thumbnail_image) || fallbackImage || '/empty_thumbnail.png'
  const description = page.subtitle || page.description || seoConfig.default_meta_description || ''
  return {
    title,
    description,
    alternates: { canonical: getCanonicalUrl(orgslug, `/badges/${uuid}`) },
    openGraph: { title, description, images: [{ url: image, alt: page.name }], type: 'article' },
  }
}

export default async function BadgePage(props: BadgePageProps) {
  const { orgslug, uuid } = await props.params
  const page = await loadBadge(uuid)
  if (!page) notFound()
  return <BadgeDetail orgslug={orgslug} initialPage={page} />
}
