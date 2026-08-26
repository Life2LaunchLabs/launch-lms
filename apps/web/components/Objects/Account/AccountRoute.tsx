import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import AccountClient from '@components/Objects/Account/AccountClient'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import type { AccountPageTab } from '@components/Objects/Account/AccountPageShell'

export default async function AccountRoute({ orgslug, tab }: { orgslug: string; tab: AccountPageTab }) {
  const session = await getServerSession()
  if (!session) redirect(getUriWithOrg(orgslug, routePaths.org.root()))
  await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  return <AccountClient orgslug={orgslug} subpage={tab} />
}
