'use client'
import React, { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  deletePlatformOrg,
  updatePlanRequest,
  updatePlatformOrgPlan,
  updatePlatformOrgSettings,
} from '@services/platform/platform'
import {
  Card,
  EmptyState,
  OrgLogo,
  Pagination,
  PlanBadge,
  SearchInput,
  StatusBadge,
  UserAvatar,
  formatDate,
  useDebounced,
} from './shared'
import {
  ArrowLeft,
  ArrowSquareOut,
  Buildings,
  ChartBar,
  Check,
  CreditCard,
  Eye,
  EyeSlash,
  GearSix,
  Globe,
  Medal,
  Tray,
  Users,
} from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import PageLoading from '@components/Objects/Loaders/PageLoading'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Buildings },
  { id: 'badges', label: 'Badges', icon: Medal },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: ChartBar },
  { id: 'plan', label: 'Plan', icon: CreditCard },
  { id: 'requests', label: 'Requests', icon: Tray },
  { id: 'settings', label: 'Settings', icon: GearSix },
] as const

type TabId = (typeof TABS)[number]['id']

function useUrlParams() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const updateParams = (
    updates: Record<string, string | number>,
    removals?: string[]
  ) => {
    const params = new URLSearchParams(searchParams.toString())
    if (removals) for (const key of removals) params.delete(key)
    for (const [key, value] of Object.entries(updates)) {
      const strVal = String(value)
      if (
        (key === 'tab' && strVal === 'overview') ||
        (key === 'page' && strVal === '1') ||
        (key === 'search' && strVal === '') ||
        (key === 'days' && strVal === '30')
      ) {
        params.delete(key)
      } else {
        params.set(key, strVal)
      }
    }
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  return { searchParams, updateParams }
}

export default function OrgDetail() {
  const params = useParams()
  const orgId = params.orgId as string
  const session = useLHSession() as any
  const currentOrg = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const { searchParams, updateParams } = useUrlParams()
  const router = useRouter()

  const requestedTab = searchParams.get('tab')
  const activeTab = (requestedTab === 'courses' ? 'badges' : requestedTab || 'overview') as TabId
  const setActiveTab = (tab: TabId) => updateParams({ tab }, ['page', 'search', 'days'])

  const orgKey = accessToken ? `${getAPIUrl()}superadmin/organizations/${orgId}` : null
  const { data: org, isLoading, mutate } = useSWR(
    orgKey,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const backHref = getUriWithOrg(currentOrg?.slug, '/admin/platform/orgs')

  if (isLoading) return <PageLoading />
  if (!org) {
    return (
      <EmptyState
        icon={<Buildings size={40} weight="fill" />}
        message="Organization not found"
      />
    )
  }

  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
      >
        <ArrowLeft size={14} weight="bold" />
        Back to Organizations
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <OrgLogo orgUuid={org.org_uuid} logoImage={org.logo_image} size={48} />
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <PlanBadge plan={org.plan} />
            {org.is_owner_org && <StatusBadge tone="blue">Owner org</StatusBadge>}
            {(org.pending_request_count ?? 0) > 0 && (
              <StatusBadge tone="amber">
                {org.pending_request_count} pending request
                {org.pending_request_count === 1 ? '' : 's'}
              </StatusBadge>
            )}
          </div>
          <p className="text-sm text-gray-400 font-mono mt-0.5">{org.slug}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-200'
              }`}
            >
              <Icon size={16} weight={activeTab === tab.id ? 'fill' : 'regular'} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab org={org} orgId={orgId} accessToken={accessToken} />
      )}
      {activeTab === 'badges' && (
        <BadgesTab orgId={orgId} accessToken={accessToken} orgSlug={org.slug} />
      )}
      {activeTab === 'users' && (
        <OrgUsersTab orgId={orgId} accessToken={accessToken} currentOrgSlug={currentOrg?.slug} />
      )}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'plan' && (
        <PlanTab
          orgId={orgId}
          accessToken={accessToken}
          currentPlan={org.plan}
          config={org.config}
          onChanged={mutate}
        />
      )}
      {activeTab === 'requests' && (
        <RequestsTab orgId={orgId} accessToken={accessToken} onChanged={mutate} />
      )}
      {activeTab === 'settings' && (
        <SettingsTab
          org={org}
          accessToken={accessToken}
          onSaved={mutate}
          onDeleted={() => router.push(backHref)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Overview
// ============================================================================

function UsageBar({
  label,
  usage,
  limit,
}: {
  label: string
  usage: number
  limit: number | string
}) {
  const isUnlimited = limit === 'unlimited' || limit === 0
  const numLimit = typeof limit === 'number' ? limit : 0
  const pct = isUnlimited ? 0 : numLimit > 0 ? Math.min(100, (usage / numLimit) * 100) : 0
  const barColor = isUnlimited
    ? 'bg-blue-400'
    : pct >= 90
      ? 'bg-red-400'
      : pct >= 70
        ? 'bg-yellow-400'
        : 'bg-emerald-400'

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 nice-shadow">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-xs text-gray-400">
          {usage.toLocaleString()} / {isUnlimited ? 'Unlimited' : numLimit.toLocaleString()}
        </p>
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-2">{usage.toLocaleString()}</p>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: isUnlimited ? '15%' : `${Math.max(2, pct)}%` }}
        />
      </div>
      {!isUnlimited && pct >= 90 && (
        <p className="text-[10px] text-red-500 mt-1.5">Limit almost reached</p>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm text-gray-800 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function OverviewTab({
  org,
  orgId,
  accessToken,
}: {
  org: any
  orgId: string
  accessToken: string
}) {
  const { data: usageData } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/organizations/${orgId}/usage` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const features = usageData?.features
  const badgeFeature = features?.badges || features?.courses

  return (
    <div className="space-y-5">
      {features ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <UsageBar label="Badges" usage={badgeFeature?.usage ?? 0} limit={badgeFeature?.limit ?? 'unlimited'} />
          <UsageBar label="Members" usage={features.members.usage} limit={features.members.limit} />
          <UsageBar label="Admin Seats" usage={features.admin_seats.usage} limit={features.admin_seats.limit} />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Users', value: org.user_count },
            { label: 'Badges', value: org.badge_count ?? org.course_count },
            { label: 'Admins', value: org.admin_users?.length || 0 },
            { label: 'Custom Domains', value: org.custom_domains?.length || 0 },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-5 nice-shadow">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <Card title="Details">
          <div className="space-y-2.5">
            <InfoRow label="Email" value={org.email || '—'} />
            <InfoRow label="Slug" value={org.slug} mono />
            <InfoRow label="UUID" value={org.org_uuid} mono />
            <InfoRow label="Created" value={formatDate(org.creation_date)} />
            <InfoRow label="Updated" value={formatDate(org.update_date)} />
            {org.description && <InfoRow label="Description" value={org.description} />}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Custom domains">
            {org.custom_domains?.length > 0 ? (
              <div className="space-y-2">
                {org.custom_domains.map((domain: string) => (
                  <div key={domain} className="flex items-center gap-2 text-sm text-emerald-600">
                    <Globe size={14} weight="fill" />
                    {domain}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No custom domains configured</p>
            )}
          </Card>

          <Card title="Admins">
            {org.admin_users?.length > 0 ? (
              <div className="space-y-2">
                {org.admin_users.map((admin: any) => (
                  <div key={admin.username} className="flex items-center gap-2">
                    <UserAvatar userUuid={admin.user_uuid} avatarImage={admin.avatar_image} size={24} />
                    <span className="text-sm text-gray-800">{admin.username}</span>
                    <span className="text-xs text-gray-400">{admin.email}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No admin users</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Badges
// ============================================================================

function getFrontendDomain(): string {
  if (typeof window === 'undefined') return 'localhost:3000'
  return (
    document.cookie
      .split('; ')
      .find((c) => c.startsWith('launchlms_frontend_domain='))
      ?.split('=')[1] || 'localhost:3000'
  )
}

function BadgesTab({
  orgId,
  accessToken,
  orgSlug,
}: {
  orgId: string
  accessToken: string
  orgSlug: string
}) {
  const { searchParams, updateParams } = useUrlParams()
  const page = Number(searchParams.get('page')) || 1
  const setPage = (p: number) => updateParams({ tab: 'badges', page: p })
  const domain = getFrontendDomain()

  const { data, isLoading } = useSWR(
    accessToken
      ? `${getAPIUrl()}superadmin/organizations/${orgId}/badges?page=${page}&limit=20`
      : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  if (isLoading) return <PageLoading />

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  if (items.length === 0 && page === 1) {
    return (
      <EmptyState
        icon={<Medal size={40} weight="fill" />}
        message="No badges in this organization"
      />
    )
  }

  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'

  return (
    <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            {['Badge', 'Status', 'Visibility', 'Created'].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((badge: any) => {
            const badgeId = badge.badge_uuid.replace(/^badge_/, '')
            const badgeUrl = `${protocol}//${orgSlug}.${domain}/badges/${badgeId}`
            return (
              <tr
                key={badge.id}
                className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer"
                onClick={() => window.open(badgeUrl, '_blank', 'noopener,noreferrer')}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {badge.thumbnail_image ? (
                      <img
                        src={badge.thumbnail_image}
                        alt=""
                        className="h-8 w-12 object-cover rounded bg-gray-100"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="h-8 w-12 rounded bg-gray-100 flex items-center justify-center">
                        <Medal size={14} weight="fill" className="text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{badge.name}</p>
                      {badge.description && (
                        <p className="text-xs text-gray-400 truncate max-w-xs">{badge.description}</p>
                      )}
                    </div>
                    <ArrowSquareOut size={14} weight="bold" className="text-gray-300 ml-auto shrink-0" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={badge.status === 'published' ? 'green' : badge.status === 'coming_soon' ? 'blue' : 'amber'}>
                    {badge.status === 'coming_soon' ? 'Coming soon' : badge.status === 'published' ? 'Published' : 'Draft'}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    {badge.public ? (
                      <>
                        <Eye size={14} /> Public
                      </>
                    ) : (
                      <>
                        <EyeSlash size={14} /> Private
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-400">{formatDate(badge.creation_date)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}

// ============================================================================
// Users
// ============================================================================

function OrgUsersTab({
  orgId,
  accessToken,
  currentOrgSlug,
}: {
  orgId: string
  accessToken: string
  currentOrgSlug?: string
}) {
  const { searchParams, updateParams } = useUrlParams()
  const page = Number(searchParams.get('page')) || 1
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebounced(search)

  const { data, isLoading } = useSWR(
    accessToken
      ? `${getAPIUrl()}superadmin/organizations/${orgId}/users?page=${page}&limit=20&search=${encodeURIComponent(debouncedSearch)}`
      : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  if (isLoading && !data) return <PageLoading />

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">
          {total} user{total !== 1 ? 's' : ''}
        </span>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            updateParams({ tab: 'users', search: value, page: 1 })
          }}
          placeholder="Search users..."
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Users size={40} weight="fill" />}
          message={search ? 'No users match your search' : 'No users in this organization'}
        />
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['User', 'Email', 'Role', 'Joined'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((user: any) => {
                const membership = (user.orgs || []).find(
                  (m: any) => m.id === Number(orgId)
                )
                return (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <Link
                        href={getUriWithOrg(currentOrgSlug || '', `/admin/platform/users/${encodeURIComponent(user.username)}`)}
                        className="flex items-center gap-3 group"
                      >
                        <UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={28} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:underline">
                            {user.username}
                          </p>
                          {(user.first_name || user.last_name) && (
                            <p className="text-xs text-gray-400">
                              {[user.first_name, user.last_name].filter(Boolean).join(' ')}
                            </p>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 capitalize">
                        {membership?.role_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-400">
                        {formatDate(membership?.since || user.creation_date)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => updateParams({ tab: 'users', page: p, search })}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Analytics (stub parity with legacy)
// ============================================================================

function AnalyticsTab() {
  return (
    <EmptyState
      icon={<ChartBar size={40} weight="fill" />}
      message="No analytics available in this environment"
    />
  )
}

// ============================================================================
// Plan
// ============================================================================

const PLAN_CHOICES = [
  { id: 'free', name: 'Free', description: 'Basic course features, 1 admin' },
  { id: 'full', name: 'Full', description: 'Communities, resources, packages' },
  { id: 'enterprise', name: 'Enterprise', description: 'White-label, custom domains, unlimited' },
]

function PlanTab({
  orgId,
  accessToken,
  currentPlan,
  config,
  onChanged,
}: {
  orgId: string
  accessToken: string
  currentPlan: string
  config: any
  onChanged: () => void
}) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await updatePlatformOrgPlan(Number(orgId), selectedPlan, accessToken)
    setSaving(false)
    if (res.status === 200) {
      toast.success('Plan updated')
      onChanged()
      globalMutate(`${getAPIUrl()}superadmin/organizations/${orgId}`)
    } else {
      toast.error(res.data?.detail || 'Failed to update plan')
    }
  }

  const features = config?.resolved_features || config?.features || {}

  return (
    <div className="space-y-6">
      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLAN_CHOICES.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`text-left p-4 rounded-xl border transition-all bg-white ${
                selectedPlan === plan.id
                  ? 'border-gray-900 nice-shadow'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <PlanBadge plan={plan.id} />
                {selectedPlan === plan.id && (
                  <Check size={16} weight="bold" className="text-emerald-500" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{plan.description}</p>
            </button>
          ))}
        </div>
        {selectedPlan !== currentPlan && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save plan'}
            </button>
            <button
              onClick={() => setSelectedPlan(currentPlan)}
              className="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {Object.keys(features).length > 0 && (
        <Card title="Feature limits">
          <div className="divide-y divide-gray-50 -my-2">
            {Object.entries(features).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      val?.enabled !== false ? 'bg-emerald-400' : 'bg-gray-200'
                    }`}
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {val?.limit !== undefined && <span>Limit: {val.limit}</span>}
                  {val?.signup_mode && <span>Signup: {val.signup_mode}</span>}
                  {val?.admin_limit !== undefined && <span>Admin limit: {val.admin_limit}</span>}
                  <span className={val?.enabled !== false ? 'text-emerald-500' : 'text-gray-300'}>
                    {val?.enabled !== false ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Requests
// ============================================================================

function RequestsTab({
  orgId,
  accessToken,
  onChanged,
}: {
  orgId: string
  accessToken: string
  onChanged: () => void
}) {
  const { data: requests, isLoading, mutate } = useSWR<any[]>(
    accessToken ? `${getAPIUrl()}superadmin/organizations/${orgId}/plan-requests` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const [updating, setUpdating] = useState<string | null>(null)

  const handleUpdate = async (requestUuid: string, status: 'approved' | 'denied') => {
    setUpdating(requestUuid)
    const res = await updatePlanRequest(requestUuid, status, null, accessToken)
    setUpdating(null)
    if (res.status === 200) {
      toast.success(`Request ${status}`)
      mutate()
      onChanged()
    } else {
      toast.error(res.data?.detail || 'Failed to update request')
    }
  }

  if (isLoading) return <PageLoading />

  if (!requests || requests.length === 0) {
    return (
      <EmptyState
        icon={<Tray size={40} weight="fill" />}
        message="No plan or package requests for this organization"
      />
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            {['Type', 'Requested', 'Message', 'Status', 'Date', ''].map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((req: any) => (
            <tr key={req.request_uuid} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-3 text-gray-600">
                {req.request_type === 'plan_upgrade' ? 'Plan upgrade' : 'Package'}
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{req.requested_value}</td>
              <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">
                {req.message || '—'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  tone={
                    req.status === 'approved' ? 'green' : req.status === 'denied' ? 'red' : 'amber'
                  }
                >
                  {req.status}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(req.creation_date)}</td>
              <td className="px-4 py-3">
                {req.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdate(req.request_uuid, 'approved')}
                      disabled={updating === req.request_uuid}
                      className="text-xs px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleUpdate(req.request_uuid, 'denied')}
                      disabled={updating === req.request_uuid}
                      className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Settings (incl. danger zone)
// ============================================================================

function SettingsTab({
  org,
  accessToken,
  onSaved,
  onDeleted,
}: {
  org: any
  accessToken: string
  onSaved: () => void
  onDeleted: () => void
}) {
  const [form, setForm] = useState({
    name: org.name || '',
    slug: org.slug || '',
    email: org.email || '',
    description: org.description || '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteSlug, setDeleteSlug] = useState('')

  const hasChanges =
    form.name !== (org.name || '') ||
    form.slug !== (org.slug || '') ||
    form.email !== (org.email || '') ||
    form.description !== (org.description || '')

  const handleSave = async () => {
    setSaving(true)
    const res = await updatePlatformOrgSettings(org.id, form, accessToken)
    setSaving(false)
    if (res.status === 200) {
      toast.success('Settings saved')
      onSaved()
    } else {
      toast.error(res.data?.detail || 'Failed to save settings')
    }
  }

  const handleDelete = async () => {
    const res = await deletePlatformOrg(org.id, accessToken)
    if (res.status === 200) {
      toast.success(`Organization ${org.name} deleted`)
      onDeleted()
    } else {
      toast.error(res.data?.detail || 'Failed to delete organization')
    }
  }

  const inputClass =
    'mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400'

  return (
    <div className="max-w-2xl space-y-5">
      <Card title="Organization settings">
        <div className="space-y-3">
          <label className="block text-sm text-gray-600">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-gray-600">
            Slug
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className={`${inputClass} font-mono`}
            />
            <span className="text-[11px] text-gray-400">
              Used in URLs. Changing this will break existing links.
            </span>
          </label>
          <label className="block text-sm text-gray-600">
            Email
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-gray-600">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              onClick={() =>
                setForm({
                  name: org.name || '',
                  slug: org.slug || '',
                  email: org.email || '',
                  description: org.description || '',
                })
              }
              className="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              Reset
            </button>
          </div>
        )}
      </Card>

      <div className="bg-white border border-red-100 rounded-xl nice-shadow p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h3>
        {org.is_owner_org ? (
          <p className="text-sm text-gray-400">
            The owner organization cannot be deleted.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Deleting an organization permanently removes its badges, users'
              memberships, and all associated data.
            </p>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Delete organization
            </button>
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {org.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the organization and all its data. Type{' '}
              <span className="font-mono font-semibold">{org.slug}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={deleteSlug}
            onChange={(e) => setDeleteSlug(e.target.value)}
            placeholder={org.slug}
            className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:border-red-400"
          />
          <DialogFooter>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              disabled={deleteSlug !== org.slug}
              onClick={() => {
                setConfirmDelete(false)
                handleDelete()
              }}
              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-500 disabled:opacity-40"
            >
              Delete organization
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
