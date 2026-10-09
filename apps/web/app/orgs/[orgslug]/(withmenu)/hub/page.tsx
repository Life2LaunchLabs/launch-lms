import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'


export const metadata: Metadata = {
  title: 'Hub',
  description: 'Your starting point for learning, resources, and opportunities.',
}

export default async function HubPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{
    channel?: string
    user_channel?: string
    query?: string
    q?: string
    type?: string
    resource_types?: string
    tags?: string
    access?: string
    provider?: string
    resource?: string
    conversation?: string
  }>
}) {
  const { orgslug } = await params
  await searchParams
  const session = await getServerSession()

  if (!session?.tokens?.access_token) {
    redirect(getUriWithOrg(orgslug, routePaths.auth.login({ next: routePaths.org.hub() })))
  }

  // The shared learner layout owns the persistent Hub, including URL filters.
  return null
}
