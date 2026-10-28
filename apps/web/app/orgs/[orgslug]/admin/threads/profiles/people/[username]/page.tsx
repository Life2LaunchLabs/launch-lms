import ProfilePage from '@components/Threads/profiles/ProfilePage'
import type { PersonTab } from '@services/routing/paths'

const TABS: PersonTab[] = ['overview', 'portfolio', 'plans', 'access']

export default async function PersonProfilePage({ params, searchParams }: { params: Promise<{ orgslug: string; username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ orgslug, username }, { tab }] = await Promise.all([params, searchParams])
  return <ProfilePage orgslug={orgslug} selection={{ kind: 'person', username: decodeURIComponent(username), tab: TABS.find((item) => item === tab) }} />
}
