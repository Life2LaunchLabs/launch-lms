'use client'

import React from 'react'
import useSWR from 'swr'
import { Plus, X } from 'lucide-react'
import { Switch } from '@components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { goalAdminApi, type AssignmentSummary } from '@services/goals/admin'
import { membershipKeys, PERMISSION_NAMES, type StaffPermission, type StaffPermissionInfo } from '@services/organizations/membership'
import type { AssignmentRoleKey, InviteAssignment } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'

/** What a staff or admin invitation carries besides the role. */
export interface StaffSetup { permissions: StaffPermission[] | null; assignments: InviteAssignment[]; note: string }

export const emptyStaffSetup = (): StaffSetup => ({ permissions: null, assignments: [], note: '' })

export const ASSIGNMENT_ROLES: Array<{ key: AssignmentRoleKey; label: string; blurb: string }> = [
  { key: 'lead', label: 'Lead', blurb: 'Runs it: dates, reminders, reviews' },
  { key: 'review', label: 'Review', blurb: 'Reviews work and answers questions' },
  { key: 'comment', label: 'Comment', blurb: 'Can see plans and comment' },
]

/** Who an assignment is for: its group, its learner, or the address it went to. */
export function assignedTo(assignment: AssignmentSummary): string {
  if (assignment.cohort) return assignment.cohort.name
  const person = assignment.user
  return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || person?.username || assignment.subject_email || 'One learner'
}

/**
 * The staff part of an invitation: permission switches (which also set where their Home starts),
 * the running assignments they join and in what role, and a note. Admins can do everything, so
 * an admin invitation only takes the note.
 */
export default function StaffSetupFields({ orgId, accessToken, admin, value, onChange }: {
  orgId: number
  accessToken: string
  admin: boolean
  value: StaffSetup
  // eslint-disable-next-line no-unused-vars
  onChange: (next: StaffSetup) => void
}) {
  const { data: catalog } = useSWR<{ permissions: StaffPermissionInfo[] }>(!admin && accessToken ? membershipKeys.staffPermissions(orgId) : null,
    (url: string) => swrFetcher(url, accessToken), { revalidateOnFocus: false })
  const { data: assignments } = useSWR(!admin && accessToken ? ['invite-assignments', orgId] : null, () => goalAdminApi.assignments(orgId, accessToken), { revalidateOnFocus: false })
  const permissions = catalog?.permissions || []
  const on = new Set(value.permissions ?? permissions.filter((item) => item.default).map((item) => item.key))
  const running = (assignments || []).filter((item) => item.status !== 'ended')
  const picked = new Set(value.assignments.map((item) => item.assignment_uuid))
  const addable = running.filter((item) => !picked.has(item.assignment_uuid))
  const byUuid = new Map(running.map((item) => [item.assignment_uuid, item]))

  const toggle = (key: StaffPermission, checked: boolean) => {
    const next = new Set(on)
    if (checked) next.add(key)
    else next.delete(key)
    onChange({ ...value, permissions: permissions.map((item) => item.key).filter((item) => next.has(item)) })
  }
  const setAssignments = (next: InviteAssignment[]) => onChange({ ...value, assignments: next })

  return <div className="space-y-5">
    {!admin && <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-800">What they can do</legend>
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {permissions.map((item) => <label key={item.key} className="flex cursor-pointer items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900">{PERMISSION_NAMES[item.key] || item.key}</span><span className="block text-xs text-gray-500">{item.label}</span></span>
          <Switch checked={on.has(item.key)} onCheckedChange={(checked) => toggle(item.key, checked)} aria-label={PERMISSION_NAMES[item.key] || item.key} />
        </label>)}
        {!catalog && <div className="h-40 animate-pulse bg-gray-50" />}
      </div>
    </fieldset>}

    {!admin && <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">Add to assignments <span className="font-normal text-gray-400">optional</span></p>
      {value.assignments.length > 0 && <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {value.assignments.map((item, index) => {
          const assignment = byUuid.get(item.assignment_uuid)
          return <div key={item.assignment_uuid} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{assignment?.template_title || 'Assignment'}</span><span className="block truncate text-xs text-gray-500">{assignment ? assignedTo(assignment) : ''}</span></span>
            <Select value={item.role_key} onValueChange={(role) => setAssignments(value.assignments.map((row, rowIndex) => rowIndex === index ? { ...row, role_key: role as AssignmentRoleKey } : row))}>
              <SelectTrigger className="h-9 w-32" aria-label="Their role"><SelectValue /></SelectTrigger>
              <SelectContent>{ASSIGNMENT_ROLES.map((role) => <SelectItem key={role.key} value={role.key} title={role.blurb}>{role.label}</SelectItem>)}</SelectContent>
            </Select>
            <button type="button" onClick={() => setAssignments(value.assignments.filter((_, rowIndex) => rowIndex !== index))} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Remove from this assignment"><X className="h-4 w-4" /></button>
          </div>
        })}
      </div>}
      {addable.length > 0
        ? <Select value="" onValueChange={(uuid) => setAssignments([...value.assignments, { assignment_uuid: uuid, role_key: 'review' }])}>
          <SelectTrigger className="h-10 justify-start gap-2 text-gray-600"><Plus className="h-4 w-4" />Add to an assignment</SelectTrigger>
          <SelectContent>{addable.map((item) => <SelectItem key={item.assignment_uuid} value={item.assignment_uuid}>{item.template_title} · {assignedTo(item)}</SelectItem>)}</SelectContent>
        </Select>
        : <p className="text-xs text-gray-500">{running.length ? 'They’re on every running assignment.' : 'No assignments are running yet. You can add them to one later.'}</p>}
    </div>}

    <label className="block space-y-2 text-sm font-medium text-gray-800">
      <span>Note <span className="font-normal text-gray-400">optional</span></span>
      <textarea value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} maxLength={1000} rows={3}
        placeholder="Say hello, or what you’d like them to start with. They’ll see it in the email and on Home."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
    </label>
  </div>
}
