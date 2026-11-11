'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Copy, Link2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LearnerAccess } from '@services/goals/templateLearners'

/** The plan's Discover page on this organization's address, as a full link to send people. */
export function planShareUrl(orgslug: string, templateUuid: string, origin: string): string {
  // getUriWithOrg is already absolute on an organization's own host.
  return new URL(getUriWithOrg(orgslug, routePaths.org.discoverPlan(templateUuid)), origin).toString()
}

/** What someone opening the link can do, by who can start the plan here. */
export function shareNote(access: LearnerAccess | undefined, orgName: string): string {
  if (access === 'open') return `Anyone with the link can start it right away. People who aren’t in ${orgName} yet join it on the way.`
  if (access === 'request') return `People with the link ask to join, and your team accepts them. People who aren’t in ${orgName} yet join it when accepted.`
  return 'Invite only: people with the link see what it asks, but only people your team assigns can start it.'
}

/**
 * "Share": a link to the plan's Discover page, where people start it with this organization (joining it
 * on the way). Shown once a version is live in an organization that runs the plan.
 */
export default function PlanShare({ orgslug, orgName, templateUuid, access, onVisibility }: {
  orgslug: string; orgName: string; templateUuid: string; access?: LearnerAccess; onVisibility?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [href, setHref] = React.useState('')
  React.useEffect(() => { if (open) setHref(planShareUrl(orgslug, templateUuid, window.location.origin)) }, [open, orgslug, templateUuid])
  const copy = async () => {
    try { await navigator.clipboard.writeText(href); toast.success('Link copied') } catch { toast.error('Couldn’t copy. Select the link and copy it.') }
  }
  const invite = !access || access === 'invite'
  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid="plan-share" title="Copy a link people can start it from"
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted">
      <Link2 size={16} aria-hidden="true" /><span className="hidden sm:inline">Share</span><span className="sr-only sm:hidden">Share</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this plan</DialogTitle>
          <DialogDescription>Send people to the plan’s page. They start it with {orgName}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input readOnly value={href} aria-label="Link to the plan" onFocus={(event) => event.target.select()}
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-[13px]" />
          <button type="button" onClick={() => void copy()} disabled={!href}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">
            <Copy size={15} aria-hidden="true" />Copy link
          </button>
        </div>
        <p role="status" className={invite ? 'rounded-xl border-l-4 border-amber-500 bg-muted px-3 py-2.5 text-[13px] text-foreground' : 'text-[13px] text-muted-foreground'}>
          {shareNote(access, orgName)}
          {onVisibility ? <> <button type="button" onClick={() => { setOpen(false); onVisibility() }} className="font-semibold text-foreground underline underline-offset-2">
            {invite ? 'Open it to people' : 'Change who can find it'}</button></> : null}
        </p>
      </DialogContent>
    </Dialog>
  </>
}
