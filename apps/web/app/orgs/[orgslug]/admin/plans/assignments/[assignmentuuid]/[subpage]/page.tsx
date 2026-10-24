import { notFound, redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** The old Learners page is the People tab now. */
export default async function AssignmentSubpage({ params }: { params: Promise<{ orgslug: string; assignmentuuid: string; subpage: string }> }) {
  const { orgslug, assignmentuuid, subpage } = await params
  if (subpage !== 'learners') notFound()
  redirect(`${getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(decodeURIComponent(assignmentuuid)))}?tab=people`)
}
