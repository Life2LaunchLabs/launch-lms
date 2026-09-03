import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import HubExperience from './HubExperience'

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
  }>
}) {
  const { orgslug } = await params
  const filters = await searchParams
  const session = await getServerSession()

  if (!session?.tokens?.access_token) {
    redirect(getUriWithOrg(orgslug, routePaths.auth.login({ next: routePaths.org.hub() })))
  }

  return (
    <HubExperience orgslug={orgslug} filters={filters} />
  )
}
