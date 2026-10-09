import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function ResourceDetailPage(props: { params: Promise<{ orgslug: string; resourceuuid: string }> }) {
  const { orgslug, resourceuuid } = await props.params
  redirect(getUriWithOrg(orgslug, routePaths.org.resource(resourceuuid)))
}
