import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

// The old /admin/programs tree now lives under /admin/plans.
export default async function LegacyProgramsRedirect({ params }: { params: Promise<{ orgslug: string; rest?: string[] }> }) {
  const { rest = [] } = await params
  const [programUuid, subpage] = rest.map(decodeURIComponent)
  if (!programUuid) redirect(routePaths.org.dash.programs())
  redirect(routePaths.org.dash.programPage(programUuid, subpage && subpage !== 'assignments' ? subpage : 'overview'))
}
