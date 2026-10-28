import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

/** Old achievements links: a learner's badges live on their portfolio. */
export default async function UserAchievementsPage({ params }: { params: Promise<{ orgslug: string; username: string }> }) {
  const { orgslug, username } = await params
  redirect(getUriWithOrg(orgslug, `/user/${encodeURIComponent(username)}/badges`))
}
