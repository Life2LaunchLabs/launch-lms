import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** Making an organization moved to /start. */
export default function OrgSignupPage() {
  redirect(routePaths.auth.orgSignup())
}
