'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useEffect } from 'react'
import { ArrowLeft, Building2, Loader2, Shield } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

export default function AccountOrgAdmin() {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  const { data: adminOrgs, isLoading } = useSWR(
    accessToken ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null,
    (url) => swrFetcher(url, accessToken),
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
    }
  )

  useEffect(() => {
    if (!Array.isArray(adminOrgs) || adminOrgs.length !== 1) return
    window.location.href = getUriWithOrg(adminOrgs[0].slug, routePaths.org.dash.root())
  }, [adminOrgs])

  if (isLoading || session?.status === 'loading') {
    return (
      <div className="bg-white rounded-xl nice-shadow p-8 text-center">
        <Loader2 className="w-8 h-8 mx-auto text-gray-500 animate-spin" />
        <p className="mt-4 text-sm text-gray-500">Loading your organizations...</p>
      </div>
    )
  }

  const organizations = Array.isArray(adminOrgs) ? adminOrgs : []

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl nice-shadow p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-gray-100">
            <Shield className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Org Admin</h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose which organization you want to manage. Your user experience stays anchored to the owner org.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl nice-shadow p-6">
        {organizations.length > 1 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your admin organizations</h2>
              <p className="text-sm text-gray-500">Select an organization to open its dashboard.</p>
            </div>
            <div className="space-y-3">
              {organizations.map((organization: any) => (
                <Link
                  key={organization.id}
                  href={getUriWithOrg(organization.slug, routePaths.org.dash.root())}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 transition-colors hover:border-gray-900 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-100">
                      <Building2 className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{organization.name}</p>
                      <p className="text-sm text-gray-500">{organization.slug}</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700">Open dashboard</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6 text-gray-500" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No admin organizations yet</h2>
            <p className="mt-1 text-sm text-gray-500">
              You can return to the user experience or create an organization from signup.
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          <Link
            href={getUriWithOrg(getDefaultOrg(), routePaths.org.root())}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to User Experience
          </Link>
        </div>
      </div>
    </div>
  )
}
