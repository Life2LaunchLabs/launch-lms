'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { Archive, ArchiveRestore, BookCopy, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { getDefaultOrg } from '@services/config/config'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import type { StepOrder } from '@services/goals/types'
import TemplateRoles from './TemplateRoles'
import type { TemplateEditing } from './useTemplate'

const STEP_ORDERS: Array<{ value: StepOrder; label: string; hint: string }> = [
  { value: 'any', label: 'Any order', hint: 'Learners can start every step any time.' },
  { value: 'in_order', label: 'In order', hint: 'Each step opens when the one before it is done.' },
  { value: 'by_stage', label: 'Stage by stage', hint: 'A stage opens when the one before it is done.' },
]

/** Instructions for staff, when steps open, roles, the global library and archiving. */
export default function TemplateSettings({ orgslug, orgId, token, editing }: { orgslug: string; orgId: number; token?: string; editing: TemplateEditing }) {
  const template = editing.template
  const [instructions, setInstructions] = React.useState(template?.document.template.instructions || '')
  const [busy, setBusy] = React.useState<'library' | 'archive' | null>(null)
  React.useEffect(() => setInstructions(template?.document.template.instructions || ''), [template?.document.template.instructions])
  if (!template) return null
  const stepOrder = template.document.template.step_order || 'any'
  const archived = template.status === 'archived'
  const setMeta = (patch: { instructions?: string; step_order?: StepOrder }, done?: string) => editing.save((document) => ({ ...document, template: { ...document.template, ...patch } }), done)
  const publishToLibrary = async () => {
    setBusy('library')
    try { await editing.replace(await templatesApi.publishToLibrary(orgId, template.template_uuid, token)); toast.success('Published to the global library.') }
    catch (error: any) { toast.error(error?.message || 'Could not publish to the global library.') } finally { setBusy(null) }
  }
  const toggleArchived = async () => {
    setBusy('archive')
    try {
      const next = archived ? await templatesApi.unarchive(orgId, template.template_uuid, token) : await templatesApi.archive(orgId, template.template_uuid, token)
      await editing.replace({ status: next.status })
      await mutate(isTemplatesKey)
      toast.success(archived ? 'Template restored.' : 'Template archived. Goals already handed out keep working.')
    } catch (error: any) { toast.error(error?.message || 'Could not change the template.') } finally { setBusy(null) }
  }
  return <div className="px-10 pb-10 pt-6"><div className="max-w-3xl space-y-6">
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <h2 className="text-lg font-bold">Instructions for staff</h2><p className="mt-1 text-sm text-muted-foreground">Shown to staff when they hand this template out, and used as the welcome message to start from.</p>
      <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={6} aria-label="Instructions for staff" className="mt-5 w-full rounded-lg border border-border p-3 text-sm" />
      <button type="button" onClick={() => void setMeta({ instructions }, 'Instructions saved.')} disabled={editing.saving || editing.stale} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{editing.saving ? <Loader2 size={15} className="animate-spin" /> : null}Save instructions</button>
    </section>
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <h2 className="flex items-center gap-2 text-lg font-bold">When steps open{editing.saving ? <Loader2 size={15} className="animate-spin text-muted-foreground" /> : null}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Copied onto goals handed out from this template. Steps that aren&apos;t open yet show learners why.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="When steps open">
        {STEP_ORDERS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={stepOrder === option.value} disabled={editing.saving || editing.stale} onClick={() => option.value !== stepOrder && void setMeta({ step_order: option.value })}
          className={`rounded-lg border p-3 text-left transition ${stepOrder === option.value ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/40'}`}>
          <span className="block text-sm font-black">{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
        </button>)}
      </div>
    </section>
    <TemplateRoles editing={editing} />
    {orgslug === getDefaultOrg() && !template.system_type ? <section className="rounded-xl border border-blue-200 bg-card p-6 shadow-xs">
      <h2 className="text-lg font-bold">Global template library</h2><p className="mt-1 text-sm text-muted-foreground">Share a snapshot of the draft that any organization can copy. Later edits stay private until you share again.</p>
      <Button variant="brand" className="mt-5" onClick={() => void publishToLibrary()} disabled={busy !== null}>{busy === 'library' ? <Loader2 className="animate-spin" /> : <BookCopy />}{template.published_to_library ? 'Update library copy' : 'Publish to library'}</Button>
    </section> : null}
    {template.system_type ? null : <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <h2 className="text-lg font-bold">{archived ? 'Archived' : 'Archive template'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{archived ? 'It can’t be handed out while archived. Goals already handed out keep working.' : 'Hide it from the list and stop handing it out. Goals already handed out keep working.'}</p>
      <Button variant="outline" className="mt-5" onClick={() => void toggleArchived()} disabled={busy !== null}>{busy === 'archive' ? <Loader2 className="animate-spin" /> : archived ? <ArchiveRestore /> : <Archive />}{archived ? 'Restore template' : 'Archive template'}</Button>
    </section>}
  </div></div>
}
