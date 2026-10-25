import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** People became Threads. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams
  redirect(routePaths.org.admin.threads.root({ invite: invite === 'staff' || invite === 'learner' ? invite : undefined }))
}
