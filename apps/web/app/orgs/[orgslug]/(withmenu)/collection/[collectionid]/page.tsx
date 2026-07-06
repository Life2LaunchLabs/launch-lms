import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getCollectionById } from '@services/courses/collections'
import { getServerSession } from '@/lib/auth/server'
import { getCanonicalUrl, getOrgSeoConfig, buildPageTitle, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import CollectionClient from './collection'
import { getLearningBadgeCollections } from '@services/learning/learning'
import { cleanLearningCollectionId, learningCollectionsToLegacyCollections } from '@services/learning/legacyAdapters'

type MetadataProps = {
  params: Promise<{ orgslug: string; collectionid: string }>
}

async function getLearningCollectionByRouteId(org: any, collectionid: string, accessToken?: string | null) {
  try {
    const response = await getLearningBadgeCollections(
      org.id,
      accessToken || undefined,
      false,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const rawCollections = response.success ? response.data : response
    const collections = learningCollectionsToLegacyCollections(rawCollections, org)
    const cleanRouteId = cleanLearningCollectionId(collectionid)
    return collections.find((collection: any) => cleanLearningCollectionId(collection.collection_uuid) === cleanRouteId) || null
  } catch {
    return null
  }
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  const seoConfig = getOrgSeoConfig(org)

  let collection: any = null
  collection = await getLearningCollectionByRouteId(org, params.collectionid, access_token)
  try {
    if (!collection) {
      collection = await getCollectionById(
        params.collectionid,
        access_token || '',
        { revalidate: 0, tags: ['collections'] }
      )
    }
  } catch {
    // Collection might not exist or user doesn't have access
  }

  const title = buildPageTitle(collection ? collection.name : 'Collection', org?.name || 'Organization', seoConfig)
  const description = collection?.description || seoConfig.default_meta_description || `Browse this collection from ${org?.name || 'this organization'}`
  const ogImageUrl = seoConfig.default_og_image
    ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
    : null
  const imageUrl = ogImageUrl || getOrgThumbnailMediaDirectory(org?.org_uuid, org?.thumbnail_image)
  const canonical = getCanonicalUrl(params.orgslug, `/collection/${params.collectionid}`)

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 600,
          alt: collection?.name || org?.name || 'Collection',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      ...(seoConfig.twitter_handle && { site: seoConfig.twitter_handle }),
    },
  }
}

const CollectionPage = async (props: { params: MetadataProps['params'] }) => {
  const params = await props.params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  let collection: any = null
  collection = await getLearningCollectionByRouteId(org, params.collectionid, access_token)
  try {
    if (!collection) {
      collection = await getCollectionById(
        params.collectionid,
        access_token || '',
        { revalidate: 0, tags: ['collections'] }
      )
    }
  } catch {
    // Collection might not exist or user doesn't have access
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(params.orgslug, '/') },
    { name: 'Badges', url: getCanonicalUrl(params.orgslug, '/badges') },
    { name: collection?.name || 'Collection', url: getCanonicalUrl(params.orgslug, `/collection/${params.collectionid}`) },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <CollectionClient
        orgslug={params.orgslug}
        collectionid={params.collectionid}
        initialCollection={collection}
      />
    </>
  )
}

export default CollectionPage
