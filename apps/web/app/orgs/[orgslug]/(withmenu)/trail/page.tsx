import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const TrailPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  redirect(getUriWithOrg(orgslug, routePaths.org.badge()))
}

export default TrailPage
