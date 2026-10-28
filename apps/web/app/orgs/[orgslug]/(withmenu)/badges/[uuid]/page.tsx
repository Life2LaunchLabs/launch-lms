import { notFound, redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeAwardsApi } from '@services/badges/badges'

/** Award links from before short codes: they go to the award's page at /b/<code>. */
export default async function BadgeAwardRedirect(props: { params: Promise<{ orgslug: string; uuid: string }> }) {
  const { orgslug, uuid } = await props.params
  const award = await badgeAwardsApi.award(uuid, undefined, { revalidate: 0 }).catch(() => null)
  if (!award) notFound()
  redirect(getUriWithOrg(orgslug, routePaths.org.badgeAward(award.code)))
}
