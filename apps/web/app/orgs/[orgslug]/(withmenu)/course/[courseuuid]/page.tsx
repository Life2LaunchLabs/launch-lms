import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const LegacyCoursePage = async (props: {
  params: Promise<{ orgslug: string; courseuuid: string }>
}) => {
  const { orgslug, courseuuid } = await props.params
  redirect(getUriWithOrg(orgslug, routePaths.org.course(courseuuid)))
}

export default LegacyCoursePage
