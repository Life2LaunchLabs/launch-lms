import { getServerSession } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import BadgesHub from '@components/Badges/BadgesHub'
import { type BadgesPageTab } from '@components/Badges/BadgesPageShell'
import { getLearningBadgeAwards, getLearningBadgeCollections } from '@services/learning/learning'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { getUriWithOrg } from '@services/config/config'

function cleanBadgeUuid(value?: string | null) {
  return String(value || '').replace(/^badge_/, '')
}

function getAwardedBadgeUuid(award: any) {
  return award?.badge?.badge_uuid || award?.award?.badge_uuid || award?.badge_class?.id || ''
}

function filterAvailableCollections(collections: any[], earnedBadgeUuids: Set<string>) {
  return (collections || [])
    .map((collection: any) => ({
      ...collection,
      badges: (collection.badges || []).filter((badge: any) => !earnedBadgeUuids.has(cleanBadgeUuid(badge.badge_uuid))),
    }))
    .filter((collection: any) => (collection.badges || []).length > 0)
}

export default async function BadgesHubPage({ orgslug, initialTab, choosingBadge = false }: { orgslug: string; initialTab: BadgesPageTab; choosingBadge?: boolean }) {
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  if (initialTab === 'my-badges' && !accessToken) redirect(getUriWithOrg(orgslug, '/'))
  let collections: any[] = []
  let earnedBadgeUuids = new Set<string>()

  try {
    const response = await getLearningBadgeCollections(undefined, accessToken ?? undefined, false, { revalidate: 0, tags: ['learning-badges'] })
    collections = response.success ? response.data : response
  } catch (error) {
    console.error('Failed to load badge collections', { orgslug, error })
  }

  if (accessToken) {
    try {
      const awards = await getLearningBadgeAwards(undefined, accessToken)
      earnedBadgeUuids = new Set((awards || []).map(getAwardedBadgeUuid).map(cleanBadgeUuid).filter(Boolean))
    } catch (error) {
      console.error('Failed to load earned badges for catalog filtering', { orgslug, error })
    }
  }

  const initialPortfolio = accessToken ? await getMyPortfolio(accessToken) : null
  return <BadgesHub orgslug={orgslug} initialTab={initialTab} collections={filterAvailableCollections(collections, earnedBadgeUuids)} choosingBadge={choosingBadge} initialPortfolio={initialPortfolio} />
}
