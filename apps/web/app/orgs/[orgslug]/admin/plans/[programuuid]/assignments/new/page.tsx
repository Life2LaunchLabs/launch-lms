import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

// Assigning is a dialog on the template overview now.
export default async function NewAssignmentRedirect({ params }: { params: Promise<{ orgslug: string; programuuid: string }> }) {
  const { programuuid } = await params
  redirect(routePaths.org.dash.programPage(decodeURIComponent(programuuid), 'overview'))
}
