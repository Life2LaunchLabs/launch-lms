import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** Old verify links: the award page is the verification now. */
export default async function BadgeVerifyRedirect(props: { params: Promise<{ orgslug: string; uuid: string }> }) {
  const { orgslug, uuid } = await props.params
  redirect(getUriWithOrg(orgslug, routePaths.org.badgeAward(uuid)))
}
