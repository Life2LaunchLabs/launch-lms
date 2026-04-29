'use client'

import React, { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Search, Users } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import TypeOfContentTitle from '@components/Objects/StyledElements/Titles/TypeOfContentTitle'
import OrganizationCard from '@components/Organizations/OrganizationCard'
import { DiscoverOrganization } from '@services/organizations/orgs'

interface OrganizationsPageClientProps {
  organizations: DiscoverOrganization[]
  orgslug: string
  query: string
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: any
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

export default function OrganizationsPageClient({
  organizations,
  orgslug,
  query,
}: OrganizationsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(query)

  const myOrganizations = useMemo(
    () => organizations.filter((organization) => organization.is_member),
    [organizations]
  )

  const updateSearch = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (value.trim()) {
      params.set('q', value.trim())
    } else {
      params.delete('q')
    }
    router.push(`?${params.toString()}`)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    updateSearch(searchQuery)
  }

  return (
    <GeneralWrapperStyled>
      <div className="mb-6 flex flex-col space-y-4">
        <TypeOfContentTitle title="Organizations" type="col" />
        <p className="max-w-2xl text-sm text-slate-600">
          Browse organizations across the platform, keep your memberships in one place, and jump into the ones you belong to.
        </p>

        <form onSubmit={handleSubmit} className="relative max-w-xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search organizations"
            aria-label="Search organizations"
            className="h-12 w-full rounded-2xl border border-black/5 bg-white pl-12 pr-24 text-sm shadow-sm outline-none transition focus:border-black/10 focus:ring-2 focus:ring-black/5"
          />
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <button
            type="submit"
            className="absolute right-2 top-2 inline-flex h-8 items-center rounded-xl bg-black px-4 text-sm font-medium text-white transition hover:bg-black/85"
          >
            Search
          </button>
        </form>
      </div>

      <div className="space-y-10">
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-slate-100 p-2">
              <Users className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Organizations</h2>
              <p className="text-sm text-slate-500">Organizations you're currently enrolled in.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myOrganizations.map((organization) => (
              <OrganizationCard
                key={organization.org_uuid}
                organization={organization}
                currentOrgslug={orgslug}
              />
            ))}
            {myOrganizations.length === 0 && (
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizations.map((organization) => (
              <OrganizationCard
                key={organization.org_uuid}
                organization={organization}
                currentOrgslug={orgslug}
              />
            ))}
            {organizations.length === 0 && (
              <EmptyState
                icon={Building2}
                title="No organizations found"
                description={query ? 'Try a broader search term.' : 'No organizations are available to explore right now.'}
              />
            )}
          </div>
        </section>
      </div>
    </GeneralWrapperStyled>
  )
}
