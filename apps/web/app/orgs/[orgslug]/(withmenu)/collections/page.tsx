import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

const CollectionsPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  redirect(getUriWithOrg(orgslug, '/courses'))
}

export default CollectionsPage
