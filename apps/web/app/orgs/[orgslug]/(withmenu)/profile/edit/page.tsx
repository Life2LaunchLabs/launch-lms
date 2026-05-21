import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const ProfileEditPage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  redirect(getUriWithOrg(params.orgslug, routePaths.org.profile()))
}

export default ProfileEditPage
