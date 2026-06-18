import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function AnalyticsDisabledPage({
  params,
}: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.root()))
}
