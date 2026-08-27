import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

export default function LegacyProgramsPage() {
  redirect(routePaths.org.programs())
}
