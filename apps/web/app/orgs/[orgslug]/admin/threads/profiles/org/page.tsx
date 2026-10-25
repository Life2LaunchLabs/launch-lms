import ProfilePage from '@components/Threads/profiles/ProfilePage'
import type { OrgTab } from '@services/routing/paths'

const TABS: OrgTab[] = ['overview', 'invites', 'join']

export default async function OrgProfilePage({ params, searchParams }: { params: Promise<{ orgslug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ orgslug }, { tab }] = await Promise.all([params, searchParams])
  return <ProfilePage orgslug={orgslug} selection={{ kind: 'org', tab: TABS.find((item) => item === tab) }} />
}
