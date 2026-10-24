'use client'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { routePaths } from '@services/config/config'

export const assignmentHref = (assignment: { assignment_uuid: string }) => routePaths.org.admin.planAssignment(assignment.assignment_uuid)

/** The signed-in staff member: their token and org, and whether they run the organization (pause, end and re-date assignments). */
export function useStaff() {
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { id?: number } } }
  const org = useOrg() as { id?: number } | null
  const { rights } = useAdminStatus()
  return {
    token: session?.data?.tokens?.access_token,
    orgId: Number(org?.id),
    viewerId: session?.data?.user?.id,
    admin: rights?.organizations?.action_update === true,
  }
}

export function shortDay(value?: string | null) {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

/** An assignment's dates as one line: Sep 8 – Jan 4, From Sep 8, Until Jan 4, or Self-paced. */
export function datesLine(assignment: { start_date?: string | null; due_date?: string | null }) {
  if (assignment.start_date && assignment.due_date) return `${shortDay(assignment.start_date)} – ${shortDay(assignment.due_date)}`
  if (assignment.start_date) return `From ${shortDay(assignment.start_date)}`
  return assignment.due_date ? `Until ${shortDay(assignment.due_date)}` : 'Self-paced'
}
