import { notFound, redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** The old Learners page is the People tab now. */
export default async function AssignmentSubpage({ params }: { params: Promise<{ assignmentuuid: string; subpage: string }> }) {
  const { assignmentuuid, subpage } = await params
  if (subpage !== 'learners') notFound()
  redirect(`${routePaths.org.admin.planAssignment(decodeURIComponent(assignmentuuid))}?tab=people`)
}
