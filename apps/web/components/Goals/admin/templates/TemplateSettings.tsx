'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import TemplateLearnersCard from './TemplateLearnersCard'
import TemplateRoles from './TemplateRoles'
import type { TemplateEditing } from './useTemplate'

/**
 * Instructions for staff, roles, who can start it, and archiving. Sharing with other organizations is the Publish tab.
 * On another organization's template this organization runs (``runOnly``), only who can start it: that setting is its own.
 */
export default function TemplateSettings({ orgId, token, editing, runOnly = false }: { orgId: number; token?: string; editing: TemplateEditing; runOnly?: boolean }) {
  const template = editing.template
  const [instructions, setInstructions] = React.useState(template?.document.template.instructions || '')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setInstructions(template?.document.template.instructions || ''), [template?.document.template.instructions])
  if (!template) return null
  if (runOnly) return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl space-y-6"><TemplateLearnersCard orgId={orgId} templateUuid={template.template_uuid} token={token} /></div></div>
  const archived = template.status === 'archived'
  const setMeta = (patch: { instructions?: string }, done?: string) => editing.save((document) => ({ ...document, template: { ...document.template, ...patch } }), done)
  const toggleArchived = async () => {
    setBusy(true)
    try {
      const next = archived ? await templatesApi.unarchive(orgId, template.template_uuid, token) : await templatesApi.archive(orgId, template.template_uuid, token)
      await editing.replace({ status: next.status })
      await mutate(isTemplatesKey)
      toast.success(archived ? 'Template restored.' : 'Template archived. Goals already handed out keep working.')
    } catch (error: any) { toast.error(error?.message || 'Could not change the template.') } finally { setBusy(false) }
  }
  return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl space-y-6">
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <h2 className="text-lg font-bold">Instructions for staff</h2><p className="mt-1 text-sm text-muted-foreground">Shown to staff when they hand this template out, and used as the welcome message to start from.</p>
      <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={6} aria-label="Instructions for staff" className="mt-5 w-full rounded-lg border border-border p-3 text-sm" />
      <button type="button" onClick={() => void setMeta({ instructions }, 'Instructions saved.')} disabled={editing.saving || editing.stale} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{editing.saving ? <Loader2 size={15} className="animate-spin" /> : null}Save instructions</button>
    </section>
    <TemplateRoles editing={editing} />
    {template.system_type ? null : <TemplateLearnersCard orgId={orgId} templateUuid={template.template_uuid} token={token} />}
    {template.system_type ? null : <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <h2 className="text-lg font-bold">{archived ? 'Archived' : 'Archive template'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{archived ? 'It can’t be handed out while archived. Goals already handed out keep working.' : 'Hide it from the list and stop handing it out. Goals already handed out keep working.'}</p>
      <Button variant="outline" className="mt-5" onClick={() => void toggleArchived()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : archived ? <ArchiveRestore /> : <Archive />}{archived ? 'Restore template' : 'Archive template'}</Button>
    </section>}
  </div></div>
}
