import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config.client'

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ orgslug: string; communityuuid: string }>
}) {
  const { orgslug, communityuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.communitySettings(communityuuid, 'general')))
}
