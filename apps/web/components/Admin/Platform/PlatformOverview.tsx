'use client'
import React from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Card, OrgLogo, StatCard, UserAvatar, formatDate } from './shared'
import { ArrowRight, Tray } from '@phosphor-icons/react'

export default function PlatformOverview() {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token

  const { data } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/overview` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const { data: pendingRequests } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/plan-requests?status=pending` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const href = (path: string) => getUriWithOrg(org?.slug, path)

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Organizations" value={data?.org_count ?? '—'} />
        <StatCard label="Users" value={data?.user_count ?? '—'} />
        <StatCard label="Courses" value={data?.course_count ?? '—'} />
        <StatCard
          label="Pending requests"
          value={data?.pending_request_count ?? '—'}
          hint={data?.pending_request_count > 0 ? 'Needs your attention' : undefined}
        />
      </div>

      {/* Pending requests inbox */}
      {pendingRequests && pendingRequests.length > 0 && (
        <Card
          title="Pending requests"
          action={
            <Link
              href={href('/admin/platform/requests')}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              View all
              <ArrowRight size={12} weight="bold" />
            </Link>
          }
        >
          <div className="divide-y divide-gray-50 -my-1">
            {pendingRequests.slice(0, 5).map((req: any) => (
              <Link
                key={req.request_uuid}
                href={href('/admin/platform/requests')}
                className="flex items-center gap-3 py-2.5 group"
              >
                <Tray size={16} className="text-amber-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">
                    <span className="font-medium">{req.org_name}</span>{' '}
                    requests{' '}
                    {req.request_type === 'plan_upgrade' ? 'plan upgrade to' : 'package'}{' '}
                    <span className="font-medium">{req.requested_value}</span>
                  </p>
                  {req.message && (
                    <p className="text-xs text-gray-400 truncate">{req.message}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDate(req.creation_date)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Recent signups / orgs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <Card
          title="Newest users"
          action={
            <Link
              href={href('/admin/platform/users')}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              All users
              <ArrowRight size={12} weight="bold" />
            </Link>
          }
        >
          <div className="divide-y divide-gray-50 -my-1">
            {(data?.recent_users || []).map((user: any) => (
              <Link
                key={user.id}
                href={href(`/admin/platform/users/${user.id}`)}
                className="flex items-center gap-3 py-2.5 group"
              >
                <UserAvatar userUuid={user.user_uuid} avatarImage={user.avatar_image} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 group-hover:underline truncate">
                    {user.username}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDate(user.creation_date)}
                </span>
              </Link>
            ))}
            {data && data.recent_users?.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No users yet</p>
            )}
          </div>
        </Card>

        <Card
          title="Newest organizations"
          action={
            <Link
              href={href('/admin/platform/orgs')}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              All orgs
              <ArrowRight size={12} weight="bold" />
            </Link>
          }
        >
          <div className="divide-y divide-gray-50 -my-1">
            {(data?.recent_orgs || []).map((row: any) => (
              <Link
                key={row.id}
                href={href(`/admin/platform/orgs/${row.id}`)}
                className="flex items-center gap-3 py-2.5 group"
              >
                <OrgLogo orgUuid={row.org_uuid} logoImage={row.logo_image} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 group-hover:underline truncate">
                    {row.name}
                  </p>
                  <p className="text-xs text-gray-400 font-mono truncate">{row.slug}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDate(row.creation_date)}
                </span>
              </Link>
            ))}
            {data && data.recent_orgs?.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No organizations yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
