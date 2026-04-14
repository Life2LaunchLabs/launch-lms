import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

const TrailPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  redirect(getUriWithOrg(orgslug, '/badge'))
}

export default TrailPage
