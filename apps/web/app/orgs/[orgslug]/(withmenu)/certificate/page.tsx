import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
}

const CertificatePage = async (props: MetadataProps) => {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.badges()))
}

export default CertificatePage
