import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** Old resource pages: a resource now opens as a sheet over Discover. */
export default async function DiscoverResourcePage({ params }: { params: Promise<{ orgslug: string; resourceuuid: string }> }) {
  const { resourceuuid } = await params
  redirect(routePaths.org.resource(decodeURIComponent(resourceuuid)))
}
