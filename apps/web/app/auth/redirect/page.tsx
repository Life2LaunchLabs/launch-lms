'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

export default function AuthRedirectPage() {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const ownerOrgSlug = getDefaultOrg()

  const { data: adminOrgs } = useSWR(
    accessToken ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null,
    (url) => swrFetcher(url, accessToken),
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
    }
  )

  useEffect(() => {
    if (session?.status === 'loading') return

    if (session?.status === 'unauthenticated') {
      window.location.href = getUriWithOrg(ownerOrgSlug, routePaths.owner.login())
      return
    }

    if (!Array.isArray(adminOrgs)) return

    if (adminOrgs.length === 1) {
      window.location.href = getUriWithOrg(adminOrgs[0].slug, routePaths.org.dash.root())
      return
    }

    if (adminOrgs.length > 1) {
      window.location.href = getUriWithOrg(ownerOrgSlug, routePaths.owner.account.orgAdmin())
      return
    }

    window.location.href = getUriWithOrg(ownerOrgSlug, routePaths.owner.root())
  }, [adminOrgs, session?.status])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
        </div>
        <h1 className="text-lg font-semibold text-gray-800 mb-1">Signing you in...</h1>
        <p className="text-gray-500 text-sm">Setting up your workspace.</p>
      </div>
    </div>
  )
}
