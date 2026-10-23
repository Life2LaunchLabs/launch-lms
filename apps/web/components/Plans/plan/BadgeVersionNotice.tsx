'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { templatesApi, type OutdatedBadgeStep } from '@services/goals/templates'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'

/** Badge steps pinned to an older major version: compare, then move them on (accepting earlier awards or not). */
export default function BadgeVersionNotice({ orgId, token, editing, outdated }: { orgId: number; token?: string; editing: TemplateEditing; outdated: OutdatedBadgeStep[] }) {
  const [compareOpen, setCompareOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!outdated.length || !editing.template) return null
  const update = async (acceptPrevious: boolean) => {
    setBusy(true)
    try {
      await editing.replace(await templatesApi.updateBadgeVersions(orgId, editing.template!.template_uuid, acceptPrevious, token))
      toast.success(acceptPrevious ? 'Updated; earlier versions of the badge still count.' : 'Updated; learners need the new version of the badge.')
    } catch (error: any) { toast.error(error?.message || 'Could not update the badge steps.') } finally { setBusy(false) }
  }
  return <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
    <p className="text-xs font-bold text-amber-950">A badge has a newer major version.</p>
    <p className="mt-0.5 text-[11px] text-amber-800">Choose whether earlier awards still count for {outdated.map((item) => item.title).join(', ')}. Goals already handed out keep their version.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Modal isDialogOpen={compareOpen} onOpenChange={setCompareOpen} minWidth="md" dialogTitle="Compare badge versions" dialogDescription="What changed in each badge, and how many people hold an earlier version."
        dialogTrigger={<button type="button" className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950">Compare versions</button>}
        dialogContent={<div className="space-y-4">{outdated.map((item) => <section key={item.step_key} className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-black">{item.title} · {item.badge_name}</p><span className="text-xs font-bold text-amber-800">{item.earlier_version_holder_count} earlier-version holder{item.earlier_version_holder_count === 1 ? '' : 's'}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['previous', 'latest'] as const).map((side) => { const version = item.version_comparison[side]; return <div key={side} className="rounded-lg bg-muted p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{side === 'previous' ? 'Earlier' : 'New'} · v{version.semantic_version}</p><p className="mt-1 text-sm font-bold">{version.title}</p>{version.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{version.description}</p> : null}
          </div> })}</div>
        </section>)}</div>} />
      <button type="button" disabled={busy || editing.stale} onClick={() => void update(true)} className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-50">Earlier versions count</button>
      <button type="button" disabled={busy || editing.stale} onClick={() => void update(false)} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : null}Require the new version</button>
    </div>
  </div>
}
