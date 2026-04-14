import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

const NewCollectionPage = async (props: any) => {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, '/courses'))
}

export default NewCollectionPage
