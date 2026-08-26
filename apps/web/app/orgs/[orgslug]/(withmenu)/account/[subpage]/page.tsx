import { Metadata } from 'next'
import AccountRoute from '@components/Objects/Account/AccountRoute'
import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { AccountPageTab } from '@components/Objects/Account/AccountPageShell'

type MetadataProps = {
  params: Promise<{ orgslug: string; subpage: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const LEGACY_ACCOUNT_SUBPAGES = ['security', 'purchases', 'general']
const PROFILE_SUBPAGES = ['profile', 'badges']
const ACCOUNT_TABS = new Set<AccountPageTab>(['messages', 'organizations', 'preferences'])

const getSubpageTitle = (subpage: string): string => {
  const titles: Record<string, string> = {
    'messages': 'Messages',
    'organizations': 'Organizations',
    'preferences': 'Appearance',
  }
  return titles[subpage] || 'Account'
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const title = getSubpageTitle(params.subpage)
  const description = 'Manage your account settings'

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
  }
}

const AccountSubPage = async (props: { params: Promise<{ orgslug: string; subpage: string }> }) => {
  const params = await props.params
  if (ACCOUNT_TABS.has(params.subpage as AccountPageTab)) {
    return <AccountRoute orgslug={params.orgslug} tab={params.subpage as AccountPageTab} />
  }

  if (PROFILE_SUBPAGES.includes(params.subpage)) {
    redirect(getUriWithOrg(params.orgslug, routePaths.org.portfolioEdit()))
  }

  if (LEGACY_ACCOUNT_SUBPAGES.includes(params.subpage)) {
    redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.root()))
  }

  if (params.subpage === 'org-admin') {
    redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.organizations()))
  }

  redirect(getUriWithOrg(params.orgslug, routePaths.owner.account.root()))
}

export default AccountSubPage
