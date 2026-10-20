'use client'

import React from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { needsVersionDecision, type AssignmentVersionStatus } from '@services/goals/versions'
import { cn } from '@/lib/utils'
import VersionReviewModal from './VersionReviewModal'

type Assignment = AssignmentVersionStatus & { assignment_uuid: string; status?: string }

/**
 * Tells an assignment's admins when its template has a newer version, or when its version no longer
 * earns the assignment's badge, and opens the review to apply it. Renders nothing when there's nothing to decide.
 * Drop it anywhere an assignment is shown (it takes any assignment summary from the API).
 */
export default function AssignmentVersionBanner({ orgId, token, assignment, compact = false, className, onApplied }: {
  orgId: number
  token?: string
  assignment: Assignment
  compact?: boolean
  className?: string
  onApplied?: () => void | Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  if (!needsVersionDecision(assignment)) return null
  const ineligible = assignment.version_eligible === false
  const badge = assignment.badge?.name || 'the badge'
  const message = ineligible
    ? `Version ${assignment.version} no longer earns ${badge}.${assignment.update_available ? ` Version ${assignment.latest_version} does.` : ''}`
    : `Version ${assignment.latest_version} of this template is out. You're on version ${assignment.version}.`
  const Icon = ineligible ? AlertTriangle : Sparkles
  return <div className={cn('flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs', ineligible ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900', className)} role="status">
    <Icon size={14} className="shrink-0" />
    <span className="min-w-0 flex-[1_1_12rem] font-semibold">{message}{compact ? '' : ' Nothing changes for learners until you apply it.'}</span>
    {assignment.update_available ? <button type="button" onClick={() => setOpen(true)} className="min-h-10 shrink-0 rounded-md bg-white/80 px-2.5 py-1 font-black text-foreground shadow-xs hover:bg-white md:min-h-0">Review changes</button> : null}
    {open ? <VersionReviewModal orgId={orgId} token={token} assignmentUuid={assignment.assignment_uuid} open={open} onOpenChange={setOpen} onApplied={onApplied} /> : null}
  </div>
}
