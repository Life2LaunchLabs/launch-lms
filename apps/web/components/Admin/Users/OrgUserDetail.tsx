'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, CalendarDays, Mail, Shield, UserRound, Users } from 'lucide-react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { UserAvatar } from '@components/Admin/Platform/shared'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export default function OrgUserDetail({ username, orgslug }: { username: string; orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const query = new URLSearchParams({ page: '1', limit: '20', search: username }).toString()
  const { data, isLoading } = useSWR(
    org?.id && accessToken ? `${getAPIUrl()}orgs/${org.id}/users?${query}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const membership = data?.items?.find((item: any) => item.user?.username === username)
  const user = membership?.user

  if (isLoading) return <PageLoading />

  return (
    <div className="flex h-full w-full flex-col bg-[#f8f8f8]">
      <AdminFeatureHeader
        feature="Users"
        activeTab="users"
        tabs={[
          { id: 'users', label: 'Users', icon: <Users size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) },
          { id: 'groups', label: 'Groups', href: getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups()) },
          { id: 'roles', label: 'Roles', href: getUriWithOrg(orgslug, routePaths.org.dash.users.roles()) },
          { id: 'signups', label: 'Sign-ups', href: getUriWithOrg(orgslug, routePaths.org.dash.users.signups()) },
          { id: 'new', label: 'Add user', href: getUriWithOrg(orgslug, routePaths.org.dash.users.add()) },
          { id: 'audit-logs', label: 'Audit logs', href: getUriWithOrg(orgslug, routePaths.org.dash.users.auditLogs()) },
        ]}
      />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.users())} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black">
          <ArrowLeft size={14} />
          Back to users
        </Link>
        {!user ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center nice-shadow">
            <UserRound className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="font-semibold text-gray-700">User not found in this organization</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
              <UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={56} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}</h1>
                <p className="text-sm text-gray-500">@{user.username}</p>
              </div>
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <DetailCard icon={<Mail size={17} />} label="Email" value={user.email || '—'} />
              <DetailCard icon={<Shield size={17} />} label="Organization role" value={membership.role?.name || '—'} />
              <DetailCard icon={<CalendarDays size={17} />} label="Joined" value={formatDate(membership.joined_at)} />
              <DetailCard icon={<CalendarDays size={17} />} label="Last login" value={formatDate(user.last_login_at)} />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function DetailCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{icon}{label}</div>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
