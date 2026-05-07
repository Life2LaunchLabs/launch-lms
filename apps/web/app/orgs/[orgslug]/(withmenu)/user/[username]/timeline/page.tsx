import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import ProfileTimeline from '@components/Objects/Profile/ProfileTimeline'
import { getUserByUsername } from '@services/users/users'

interface UserTimelinePageProps {
  params: Promise<{ orgslug: string; username: string }>
}

const UserTimelinePage = async ({ params }: UserTimelinePageProps) => {
  const resolvedParams = await params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  if (!accessToken) {
    redirect(`/orgs/${resolvedParams.orgslug}/login?redirect=/orgs/${resolvedParams.orgslug}/user/${resolvedParams.username}/timeline`)
  }

  const user = await getUserByUsername(resolvedParams.username, accessToken)

  return (
    <ProfileTimeline
      initialUser={user}
      orgslug={resolvedParams.orgslug}
      profileUsername={user.username}
      canEdit={session?.user?.username === user.username}
    />
  )
}

export default UserTimelinePage
