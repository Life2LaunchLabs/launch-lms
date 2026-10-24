import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgOgImageMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { planJoiningApi } from '@services/goals/planJoining'
import PlanPage from '@components/Discover/PlanPage'

type PlanPageProps = { params: Promise<{ orgslug: string; uuid: string }> }

async function load(orgslug: string, uuid: string) {
  const [session, org] = await Promise.all([getServerSession(), getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }).catch(() => null)])
  const page = await planJoiningApi.plan(uuid, session?.tokens?.access_token ?? undefined, org?.id, { revalidate: 0 }).catch(() => null)
  return { org, page }
}

export async function generateMetadata(props: PlanPageProps): Promise<Metadata> {
  const { orgslug, uuid } = await props.params
  const { org, page } = await load(orgslug, uuid)
  if (!page) return { title: `Plan - ${org?.name || 'Launch LMS'}` }
  const seoConfig = getOrgSeoConfig(org)
  const title = buildPageTitle(page.title, org?.name, seoConfig)
  const fallbackImage = seoConfig.default_og_image ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image) : null
  const image = normalizeMediaUrl(page.badge?.image_url || page.thumbnail_image) || fallbackImage || '/empty_thumbnail.png'
  const description = page.description || seoConfig.default_meta_description || ''
  return {
    title,
    description,
    alternates: { canonical: getCanonicalUrl(orgslug, `/discover/plans/${uuid}`) },
    openGraph: { title, description, images: [{ url: image, alt: page.title }], type: 'article' },
  }
}

export default async function DiscoverPlanRoute(props: PlanPageProps) {
  const { orgslug, uuid } = await props.params
  const { org, page } = await load(orgslug, uuid)
  if (!page) notFound()
  return <PlanPage orgslug={orgslug} orgId={org?.id} initialPage={page} />
}
