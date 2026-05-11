import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config.client'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
}

const BadgePage = async (props: MetadataProps) => {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.badges()))
}

export default BadgePage
