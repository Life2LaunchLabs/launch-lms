import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** Profiles moved under Threads. */
export default async function PersonPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ username }, { tab }] = await Promise.all([params, searchParams])
  redirect(routePaths.org.admin.people.user(decodeURIComponent(username), tab === 'plans' ? 'plans' : undefined))
}
