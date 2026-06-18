export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'

const OrgHomePage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  const session = await getServerSession()

  if (!session) {
    redirect('/welcome')
  }
  redirect(getUriWithOrg(orgslug, routePaths.org.portfolio()))
}

export default OrgHomePage
