import { getUriWithOrg } from '@services/config/config'
import { redirect } from 'next/navigation'

const CoursesPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  redirect(getUriWithOrg(orgslug, '/badges'))
}

export default CoursesPage
