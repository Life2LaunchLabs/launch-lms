'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Pencil } from 'lucide-react'
import { Input } from '@components/ui/input'
import { templateUrl, templatesApi, type DraftChanges } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import PlanDialog from './PlanDialog'
import PublishFlow from './PublishFlow'
import { plural, semverProblem, suggestSemver, versionLabel } from './planVersions'

type Props = {
  orgId: number
  token?: string
  editing: TemplateEditing
  canAssign: boolean
  onVisibility?: (() => void) | null
}

const draftChangesKey = (orgId: number, templateUuid: string, etag: string) => `${templateUrl(templateUuid, '/draft/changes')}?org_id=${orgId}&etag=${etag}`

function changeSummary(changes?: DraftChanges | null, first = false) {
  if (first) return 'First version'
  if (!changes) return ''
  const { added, changed, removed, stages_changed } = changes.summary
  const parts = [added ? `+${plural(added, 'step')}` : '', changed ? `${changed} changed` : '', removed ? `${removed} removed` : ''].filter(Boolean)
  return parts.join(' · ') || (stages_changed ? 'Stage changes' : 'No changes yet')
}

/**
 * Your editing work, kept apart from the live version. There's no Edit step: the first change starts
 * a draft under the next version number, and the bar then shows what it changes, its version (the
 * pencil changes it), Discard and Publish….
 */
export default function DraftBar({ orgId, token, editing, canAssign, onVisibility }: Props) {
  const template = editing.template!
  const draft = template.draft
  const live = template.live_version
  const first = !live && !(template.versions || []).length
  const [metaOpen, setMetaOpen] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const { data: changes } = useSWR(draft && token ? draftChangesKey(orgId, template.template_uuid, template.etag) : null, () => templatesApi.draftChanges(orgId, template.template_uuid, token))

  const discard = async () => {
    if (!window.confirm(`Throw away draft ${draft ? `v${draft.semver}` : ''}? The plan goes back to ${versionLabel(live)}.`)) return
    try {
      await editing.replace(await templatesApi.discardDraft(orgId, template.template_uuid, token))
      toast.success('Draft discarded.')
    } catch (error: any) { toast.error(error?.message || 'Could not discard the draft.') }
  }

  const draftName = draft ? `v${draft.semver}${draft.note ? ` · ${draft.note}` : ''}` : ''
  const learnersSee = live ? ` · learners still see ${versionLabel(live)}` : ''
  const bar = draft
    ? <Bar tone="editing" detail={editing.saving ? 'Saving…' : <>{changeSummary(changes, first) || <Loader2 size={12} className="inline animate-spin" />}{learnersSee}</>}
      title={<>Draft <button type="button" onClick={() => setMetaOpen(true)} title="Version number and note" className="inline-flex max-w-full items-center gap-1 rounded-md px-1 hover:bg-brand/10"><span className="truncate">{draftName}</span><Pencil size={12} aria-hidden="true" /></button></>}>
      {live ? <button type="button" className={smallGhostClass} onClick={() => void discard()} disabled={editing.saving}>Discard</button> : null}
      <button type="button" className={smallPrimaryClass} onClick={() => setPublishOpen(true)} disabled={editing.stale || editing.saving}>Publish…</button>
    </Bar>
    : <Bar tone="idle" title={<>{live ? `You’re viewing ${versionLabel(live)}, the live version.` : 'Nothing published yet.'} Changes go into a draft until you publish.</>} />
  // The dialogs stay mounted across the bar's states: publishing ends the draft, and the celebration follows.
  return <>
    {bar}
    {draft ? <DraftMetaModal open={metaOpen} setOpen={setMetaOpen} orgId={orgId} token={token} editing={editing} /> : null}
    <PublishFlow open={publishOpen} setOpen={setPublishOpen} orgId={orgId} token={token} editing={editing} changes={changes} canAssign={canAssign} onVisibility={onVisibility} />
  </>
}

function Bar({ tone, title, detail, children }: { tone: 'idle' | 'editing'; title: React.ReactNode; detail?: React.ReactNode; children?: React.ReactNode }) {
  return <div data-testid="plan-draft-bar" className={cn('mt-[18px] flex flex-wrap items-center gap-2.5 rounded-[14px]',
    tone === 'idle' ? 'border border-border py-2 pl-3.5 pr-2' : 'py-2.5 pl-3.5 pr-2.5',
    tone === 'editing' && 'bg-brand-soft text-brand-ink shadow-[inset_0_0_0_1.5px_hsl(var(--brand)/.4)]')}>
    {tone === 'idle' ? null : <Pencil size={18} className="shrink-0" aria-hidden="true" />}
    <div className={cn('min-w-[200px] flex-1 text-[13.5px]', tone === 'idle' ? 'text-muted-foreground' : 'text-foreground')}>
      {tone === 'idle' ? title : <b className="text-brand-ink">{title}</b>}
      {detail ? <small className="mt-px block text-[12.5px] text-muted-foreground">{detail}</small> : null}
    </div>
    {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
  </div>
}

/** The open draft's version number and note. */
function DraftMetaModal({ open, setOpen, orgId, token, editing }: { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; editing: TemplateEditing }) {
  const template = editing.template!
  const versions = template.versions || []
  const [semver, setSemver] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setSemver(template.draft?.semver || suggestSemver(versions))
    setNote(template.draft?.note || '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const problem = semverProblem(semver, versions)
  const submit = async () => {
    if (problem) return
    setBusy(true)
    try {
      await editing.replace(await templatesApi.updateDraft(orgId, template.template_uuid, { semver, note }, token))
      setOpen(false)
    } catch (error: any) { toast.error(error?.message || 'Could not save the version.') } finally { setBusy(false) }
  }
  return <PlanDialog open={open} onOpenChange={setOpen} title="Version details"
    footer={<><button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Cancel</button>
      <button type="submit" form="plan-draft-meta" className={smallPrimaryClass + ' h-10 px-4 text-sm'} disabled={busy || !!problem}>{busy ? <Loader2 className="animate-spin" /> : null}Save</button></>}>
    <form id="plan-draft-meta" className="flex flex-col gap-3.5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-sm text-muted-foreground">The number and note this draft will publish with. Learners keep the live version until you publish.</p>
      <div className="grid gap-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">Version<Input autoFocus value={semver} onChange={(event) => setSemver(event.target.value)} aria-invalid={!!problem} className="font-mono" autoComplete="off" /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">Note<Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="What’s changing?" autoComplete="off" /></label>
      </div>
      <p className={cn('text-[12.5px]', problem ? 'text-red-600' : 'text-muted-foreground')}>{problem || 'You can change these until you publish. Bigger changes get a bigger first number.'}</p>
    </form>
  </PlanDialog>
}
