import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

type OrganizationsPageProps = {
  params: Promise<{ orgslug: string }>
}

export default async function OrganizationsPage(props: OrganizationsPageProps) {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.organizations()))
}
