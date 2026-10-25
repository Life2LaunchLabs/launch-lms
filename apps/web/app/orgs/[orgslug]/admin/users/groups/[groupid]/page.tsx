import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** Group profiles moved under Threads. */
export default async function GroupPage({ params, searchParams }: { params: Promise<{ groupid: string }>; searchParams: Promise<{ view?: string; assignment?: string }> }) {
  const [{ groupid }, { view, assignment }] = await Promise.all([params, searchParams])
  redirect(routePaths.org.admin.people.group(groupid, view === 'plans' || view === 'requirements' ? view : undefined, assignment))
}
