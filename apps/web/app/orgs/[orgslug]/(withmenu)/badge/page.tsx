import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
}

const BadgePage = async (props: MetadataProps) => {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, routePaths.org.profile()))
}

export default BadgePage
