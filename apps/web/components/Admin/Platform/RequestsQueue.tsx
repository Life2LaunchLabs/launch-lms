'use client'
import React, { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { updatePlanRequest } from '@services/platform/platform'
import {
  EmptyState,
  FilterSelect,
  LoadingRows,
  OrgLogo,
  StatusBadge,
  formatDate,
} from './shared'
import { Tray } from '@phosphor-icons/react'

export default function RequestsQueue() {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const [statusFilter, setStatusFilter] = useState('pending')
  const [updating, setUpdating] = useState<string | null>(null)

  const query = statusFilter === 'all' ? '' : `?status=${statusFilter}`
  const { data: requests, isLoading, mutate } = useSWR<any[]>(
    accessToken ? `${getAPIUrl()}superadmin/plan-requests${query}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: true }
  )

  const handleUpdate = async (requestUuid: string, status: 'approved' | 'denied') => {
    setUpdating(requestUuid)
    const res = await updatePlanRequest(requestUuid, status, null, accessToken)
    setUpdating(null)
    if (res.status === 200) {
      toast.success(`Request ${status}${status === 'approved' ? ' — change applied' : ''}`)
      mutate()
    } else {
      toast.error(res.data?.detail || 'Failed to update request')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <FilterSelect
          label="Status"
          value={statusFilter}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'denied', label: 'Denied' },
            { value: 'all', label: 'All' },
          ]}
          onChange={setStatusFilter}
        />
        <span className="text-xs text-gray-400">
          {requests?.length ?? 0} request{(requests?.length ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
        {isLoading ? (
          <LoadingRows />
        ) : !requests || requests.length === 0 ? (
          <EmptyState
            icon={<Tray size={40} weight="fill" />}
            message={
              statusFilter === 'pending'
                ? 'No pending requests — all caught up'
                : 'No requests found'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Organization', 'Type', 'Requested', 'Message', 'Status', 'Date', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {requests.map((req: any) => (
                  <tr key={req.request_uuid} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={getUriWithOrg(
                          org?.slug,
                          `/admin/platform/orgs/${req.org_id}?tab=requests`
                        )}
                        className="flex items-center gap-2.5 group"
                      >
                        <OrgLogo orgUuid={req.org_uuid} logoImage={req.org_logo_image} size={26} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 group-hover:underline truncate">
                            {req.org_name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono truncate">{req.org_slug}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {req.request_type === 'plan_upgrade' ? 'Plan upgrade' : 'Package'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{req.requested_value}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[220px] truncate">
                      {req.message || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={
                          req.status === 'approved'
                            ? 'green'
                            : req.status === 'denied'
                              ? 'red'
                              : 'amber'
                        }
                      >
                        {req.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(req.creation_date)}
                    </td>
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
        )}
      </div>
    </div>
  )
}
