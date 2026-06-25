import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUserByUsername } from '@services/users/users'
import ProfileResumeClient from '../../../portfolio/resume/ProfileResumeClient'

function normalizeProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return { ...profile }
}

function getPublicUserData(userData: any) {
  const profile = normalizeProfileValue(userData.profile)

  if (profile.featured?.publicVisible === false) {
    profile.featured = { ...profile.featured, enabled: false, cards: [] }
  }

  if (profile.timelinePublicVisible === false) {
    profile.timeline = []
  }

  if (profile.achievements?.publicVisible === false) {
    profile.achievements = { ...profile.achievements, enabled: false, custom: [], featured: [] }
  }

  return {
    ...userData,
    profile,
  }
}

const UserResumePage = async (props: { params: Promise<{ orgslug: string; username: string }> }) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  if (!accessToken) {
    redirect(`/orgs/${params.orgslug}/login?redirect=/orgs/${params.orgslug}/user/${params.username}/resume`)
  }

  const user = await getUserByUsername(params.username, accessToken)

  return (
    <ProfileResumeClient
      initialUser={getPublicUserData(user)}
      orgslug={params.orgslug}
      mode="public"
      profileUsername={params.username}
    />
  )
}

export default UserResumePage
