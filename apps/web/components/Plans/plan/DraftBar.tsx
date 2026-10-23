'use client'

import React from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, MoreHorizontal, PartyPopper, Pencil, Rocket, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { isTemplatesKey, templateUrl, templatesApi, type DraftChanges } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import GoalAssignmentModal from '@components/Plans/editor/GoalAssignmentModal'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { plural, semverProblem, suggestSemver, versionLabel } from './planVersions'

type Props = { orgId: number; token?: string; editing: TemplateEditing; editMode: boolean; setEditMode: React.Dispatch<React.SetStateAction<boolean>>; canAssign: boolean }

export const draftChangesKey = (orgId: number, templateUuid: string, etag: string) => `${templateUrl(templateUuid, '/draft/changes')}?org_id=${orgId}&etag=${etag}`

export function changeSummary(changes?: DraftChanges | null, first = false) {
  if (first) return 'First version'
  if (!changes) return ''
  const { added, changed, removed, stages_changed } = changes.summary
  const parts = [added ? `+${plural(added, 'step')}` : '', changed ? `${changed} changed` : '', removed ? `${removed} removed` : ''].filter(Boolean)
  return parts.join(' · ') || (stages_changed ? 'Stage changes' : 'No step changes yet')
}

/**
 * The draft, kept apart from the live version. With no draft: "Edit" asks for a version number and a note.
 * While editing: Save goes back to the live view. With a saved draft: what it changes, Continue editing and Publish.
 */
export default function DraftBar({ orgId, token, editing, editMode, setEditMode, canAssign }: Props) {
  const template = editing.template!
  const draft = template.draft
  const live = template.live_version
  const [metaOpen, setMetaOpen] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const { data: changes } = useSWR(draft && token ? draftChangesKey(orgId, template.template_uuid, template.etag) : null, () => templatesApi.draftChanges(orgId, template.template_uuid, token))

  const discard = async () => {
    if (!window.confirm(`Throw away draft ${draft ? `v${draft.semver}` : ''}? The plan goes back to ${versionLabel(live)}.`)) return
    try {
      await editing.replace(await templatesApi.discardDraft(orgId, template.template_uuid, token))
      setEditMode(false)
      toast.success('Draft discarded.')
    } catch (error: any) { toast.error(error?.message || 'Could not discard the draft.') }
  }

  const meta = <DraftMetaModal open={metaOpen} setOpen={setMetaOpen} orgId={orgId} token={token} editing={editing} onStarted={() => setEditMode(true)} />
  const publish = <PublishModal open={publishOpen} setOpen={setPublishOpen} orgId={orgId} token={token} editing={editing} changes={changes} canAssign={canAssign} onPublished={() => setEditMode(false)} />

  // The modals stay mounted across the bar's states: publishing ends the draft, and the celebration follows.
  return <>{meta}{publish}{bar()}</>

  function bar() {
  if (editMode && draft) {
    return <Bar tone="edit" icon={<Pencil size={15} />}
      title={<>Editing draft v{draft.semver}{draft.note ? <span className="font-medium"> · {draft.note}</span> : null}</>}
      detail={editing.saving ? 'Saving…' : 'Changes save to the draft as you go.'}>
      <button type="button" onClick={() => setMetaOpen(true)} className="h-9 rounded-full px-3 text-xs font-bold text-amber-900 hover:bg-amber-100">Version details</button>
      <Button size="sm" className="rounded-full" onClick={() => { setEditMode(false); toast.success(`Draft v${draft.semver} saved.`) }} disabled={editing.saving}><Check />Save</Button>
    </Bar>
  }
  if (draft) {
    return <Bar tone="draft" icon={<Pencil size={15} />}
      title={<>Draft v{draft.semver}{draft.note ? <span className="font-medium"> · {draft.note}</span> : null}</>}
      detail={changeSummary(changes, !live && !(template.versions || []).length) || <Loader2 size={12} className="animate-spin" />}>
      <Button size="sm" variant="outline" className="rounded-full border-amber-300 bg-white text-amber-900" onClick={() => setPublishOpen(true)} disabled={editing.stale}><Rocket />Publish…</Button>
      <Button size="sm" className="rounded-full" onClick={() => setEditMode(true)}>Continue editing</Button>
      {live ? <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="More draft actions" className="flex h-9 w-9 items-center justify-center rounded-full text-amber-900 hover:bg-amber-100"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMetaOpen(true)}><Pencil />Version details</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void discard()} className="text-red-700"><Trash2 />Discard draft</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </Bar>
  }
  return <Bar tone="live" title={live ? <span className="font-medium">You’re viewing {versionLabel(live)}, the live version.</span> : <span className="font-medium">No live version. Start a draft to change this plan.</span>}>
    <Button size="sm" variant="outline" className="rounded-full" onClick={() => setMetaOpen(true)} disabled={editing.stale}><Pencil />Edit</Button>
  </Bar>
  }
}

function Bar({ tone, icon, title, detail, children }: { tone: 'live' | 'draft' | 'edit'; icon?: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; children: React.ReactNode }) {
  return <div data-testid="plan-draft-bar" className={cn('flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3',
    tone === 'live' ? 'border-border bg-card text-muted-foreground' : 'border-amber-200 bg-amber-50 text-amber-900')}>
    {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
    <div className="min-w-0 flex-1">
      <p className={cn('truncate text-sm', tone === 'live' ? '' : 'font-black')}>{title}</p>
      {detail ? <p className="text-xs">{detail}</p> : null}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
  </div>
}

/** Start a draft (version number + note), or change the open draft's. */
function DraftMetaModal({ open, setOpen, orgId, token, editing, onStarted }: { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; editing: TemplateEditing; onStarted: () => void }) {
  const template = editing.template!
  const versions = template.versions || []
  const draft = template.draft && !template.draft.implicit ? template.draft : null
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
      const next = draft || template.draft?.implicit
        ? await templatesApi.updateDraft(orgId, template.template_uuid, { semver, note }, token)
        : await templatesApi.startDraft(orgId, template.template_uuid, { semver, note }, token)
      await editing.replace(next)
      setOpen(false)
      if (!draft) onStarted()
    } catch (error: any) { toast.error(error?.message || 'Could not save the version.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle={draft ? 'Version details' : 'Start a new version'}
    dialogDescription={draft ? 'The number and note this draft will publish with.' : 'Edits go into a draft. Learners keep the live version until you publish.'}
    dialogContent={<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label className="block text-xs font-bold"><span className="mb-2 block">Version</span>
        <Input autoFocus value={semver} onChange={(event) => setSemver(event.target.value)} aria-invalid={!!problem} className="w-40 font-mono" />
        <span className={cn('mt-1.5 block font-medium', problem ? 'text-red-700' : 'text-muted-foreground')}>{problem || 'Bigger changes get a bigger first number.'}</span>
      </label>
      <label className="block text-xs font-bold"><span className="mb-2 block">What’s changing? (optional)</span>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="Add a mentor check-in" />
      </label>
      <Button type="submit" className="ml-auto flex" disabled={busy || !!problem}>{busy ? <Loader2 className="animate-spin" /> : <Pencil />}{draft ? 'Save' : 'Start editing'}</Button>
    </form>} />
}

/** Review the draft's changes and publish it as a locked version, live by default (active assignments move to it). */
function PublishModal({ open, setOpen, orgId, token, editing, changes, canAssign, onPublished }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; editing: TemplateEditing; changes?: DraftChanges; canAssign: boolean; onPublished: () => void
}) {
  const template = editing.template!
  const draft = template.draft
  const [makeLive, setMakeLive] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ semver: string; live: boolean; moved: number } | null>(null)
  const { data: preview } = useSWR(open && template.live_version && token ? ['live-preview', orgId, template.template_uuid] : null, () => templatesApi.livePreview(orgId, template.template_uuid, token))
  React.useEffect(() => { if (open) { setMakeLive(true); setDone(null) } }, [open])
  const publish = async () => {
    setBusy(true)
    try {
      const result = await templatesApi.publish(orgId, template.template_uuid, { make_live: makeLive }, token)
      await editing.replace(result)
      await globalMutate(isTemplatesKey)
      onPublished()
      setDone({ semver: result.versions?.[0]?.semver || draft?.semver || '', live: makeLive, moved: result.moved?.plans || 0 })
    } catch (error: any) { toast.error(error?.message || 'Could not publish the version.') } finally { setBusy(false) }
  }
  if (done) {
    return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogContent={<div className="px-2 py-6 text-center" data-testid="plan-published">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><PartyPopper size={26} /></span>
      <h2 className="mt-4 text-2xl font-black">v{done.semver} is {done.live ? 'live' : 'published'}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{done.live
        ? done.moved ? `${plural(done.moved, 'learner plan')} moved to it. Steps they already started stay as they were.` : 'New assignments get this version.'
        : 'It’s locked and in the version list. Make it live whenever you’re ready.'}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
        {done.live && canAssign ? <GoalAssignmentModal initialTemplateUuid={template.template_uuid} trigger={<Button>Assign it</Button>} /> : null}
      </div>
    </div>} />
  }
  if (!draft) return null
  const listed = (changes?.stages || []).flatMap((stage) => stage.steps.map((step) => ({ ...step, stage: stage.title })))
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle={`Publish v${draft.semver}`}
    dialogDescription="Published versions are locked. To change it later, start a new draft."
    dialogContent={<div className="space-y-5">
      {draft.note ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{draft.note}</p> : null}
      <section>
        <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">Changes{changes?.base?.semver ? ` since v${changes.base.semver}` : ''}</h3>
        {!changes ? <Loader2 className="mt-2 animate-spin text-muted-foreground" /> : listed.length ? <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">{listed.map((step) => <li key={`${step.stage}:${step.step_key}`} className="flex items-center gap-2 text-sm">
          <span className={cn('w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-black uppercase', step.change === 'added' ? 'bg-emerald-100 text-emerald-800' : step.change === 'removed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900')}>{step.change}</span>
          <span className="min-w-0 truncate">{step.title || 'Untitled step'}</span><span className="shrink-0 text-xs text-muted-foreground">{step.stage}</span>
        </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{changeSummary(changes, !template.live_version)}</p>}
      </section>
      <label className="flex items-start gap-3 rounded-xl border border-border p-3">
        <Checkbox checked={makeLive} onCheckedChange={(value) => setMakeLive(value === true)} aria-label="Make it the live version" className="mt-0.5" />
        <span className="text-sm"><span className="block font-bold">Make it the live version</span>
          <span className="text-xs text-muted-foreground">{template.live_version
            ? preview?.open_plans ? `${plural(preview.open_plans, 'learner plan')} in ${plural(preview.assignments, 'assignment')} move to it. Steps they already started stay as they were.` : 'New assignments get this version.'
            : 'You can assign it as soon as it’s live.'}</span></span>
      </label>
      <Button className="ml-auto flex" onClick={() => void publish()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Rocket />}Publish v{draft.semver}</Button>
    </div>} />
}
