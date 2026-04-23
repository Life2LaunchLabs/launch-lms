'use client'

import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Building2, Search, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import OrganizationCard from '@components/Organizations/OrganizationCard'
import { getDiscoverOrganizations } from '@services/organizations/orgs'

interface AccountOrganizationsProps {
  orgslug: string
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-12 text-center">
      <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
        <Icon className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-xl font-bold text-slate-700">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  )
}

export default function AccountOrganizations({ orgslug }: AccountOrganizationsProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [query, setQuery] = useState('')

  const { data: organizations, error, isLoading } = useSWR(
    ['account-organizations', query, accessToken],
    ([, currentQuery, token]) =>
      getDiscoverOrganizations(
        { page: 1, limit: 48, query: currentQuery },
        null,
        token || undefined
      )
  )

  const organizationList = useMemo(() => organizations || [], [organizations])
  const myOrganizations = useMemo(
    () => organizationList.filter((organization) => organization.is_member),
    [organizationList]
  )

  return (
    <div className="rounded-xl bg-white p-5 nice-shadow sm:p-6">
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Organizations</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Keep track of the organizations you belong to and browse others across the platform.
          </p>
        </div>

        <div className="relative max-w-xl">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search organizations"
            aria-label="Search organizations"
            className="h-12 w-full rounded-2xl border border-black/5 bg-slate-50 pl-12 pr-4 text-sm shadow-sm outline-none transition focus:border-black/10 focus:ring-2 focus:ring-black/5"
          />
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          We couldn&apos;t load organizations right now.
        </div>
      )}

      <div className="space-y-10">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-2">
              <Users className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Organizations</h2>
              <p className="text-sm text-slate-500">Organizations you&apos;re currently enrolled in.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {myOrganizations.map((organization) => (
              <OrganizationCard
                key={organization.org_uuid}
                organization={organization}
                currentOrgslug={orgslug}
              />
            ))}

            {!isLoading && myOrganizations.length === 0 && (
              <EmptyState
                icon={Users}
                title="No organizations yet"
                description={query ? 'No memberships match your search yet.' : 'Join an organization from the list below to see it here.'}
              />
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-2">
              <Building2 className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">All Organizations</h2>
              <p className="text-sm text-slate-500">
                {query ? `Showing results for "${query}".` : 'Discover open organizations across the platform.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {organizationList.map((organization) => (
              <OrganizationCard
                key={organization.org_uuid}
                organization={organization}
                currentOrgslug={orgslug}
              />
            ))}

            {isLoading && (
              <>
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-52 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </>
            )}

            {!isLoading && organizationList.length === 0 && (
              <EmptyState
                icon={Building2}
                title="No organizations found"
                description={query ? 'Try a broader search term.' : 'No organizations are available to explore right now.'}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
