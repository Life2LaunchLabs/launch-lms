import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { OwnerProfilePageClient } from '@components/Objects/Profile/ProfilePageClient'
import { getUser } from '@services/users/users'
import { getUriWithOrg, routePaths } from '@services/config/config'

const JOURNAL_CANVAS_IDS = ['identity', 'lifestyle', 'navigation'] as const
type JournalCanvasId = typeof JOURNAL_CANVAS_IDS[number]

const ProfileJournalCanvasPage = async (props: { params: Promise<{ orgslug: string, canvasid: string }> }) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const userId = session?.user?.id

  if (!JOURNAL_CANVAS_IDS.includes(params.canvasid as typeof JOURNAL_CANVAS_IDS[number])) {
    notFound()
  }
  const canvasId = params.canvasid as JournalCanvasId

  if (!accessToken || !userId) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.root()))
  }

  const user = await getUser(String(userId), accessToken)

  return (
    <OwnerProfilePageClient
      initialUser={user}
      orgslug={params.orgslug}
      initialTab={canvasId}
    />
  )
}

export default ProfileJournalCanvasPage
