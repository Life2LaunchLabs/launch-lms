'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore, BookCopy, Layers3, Loader2, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isTemplatesKey, templateKeys, templatesApi } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { cn } from '@/lib/utils'
import BadgeTemplatesSection from '@components/Goals/admin/versions/BadgeTemplatesSection'

const templatePage = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.templatePage(uuid, 'overview'))

/** Where a template stands: archived, never published, or its live version and whether the draft moved on. */
export function TemplateStatusChip({ template, className }: { template: Pick<GoalTemplate, 'status' | 'published_version' | 'has_unpublished_changes'>; className?: string }) {
  const [label, tone] = template.status === 'archived' ? ['Archived', 'bg-gray-100 text-gray-600']
    : !template.published_version ? ['Not published', 'bg-amber-100 text-amber-800']
      : template.has_unpublished_changes ? [`v${template.published_version} · changes`, 'bg-amber-100 text-amber-800']
        : [`v${template.published_version} live`, 'bg-green-100 text-green-700']
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase', tone, className)}>{label}</span>
}

/** The organization's goal templates: open one, start a new one (blank or from the library), archive. */
export default function TemplateList({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const [showArchived, setShowArchived] = React.useState(false)
  const key = orgId && token ? templateKeys.list(orgId, showArchived) : null
  const { data: templates, isLoading } = useSWR<GoalTemplate[]>(key, () => templatesApi.list(orgId, token, showArchived))
  const [busy, setBusy] = React.useState<string | null>(null)
  const toggleArchived = async (template: GoalTemplate) => {
    setBusy(template.template_uuid)
    try {
      if (template.status === 'archived') await templatesApi.unarchive(orgId, template.template_uuid, token)
      else await templatesApi.archive(orgId, template.template_uuid, token)
      await mutate(isTemplatesKey)
      toast.success(template.status === 'archived' ? 'Template restored.' : 'Template archived. Goals already handed out keep working.')
    } catch (error: any) { toast.error(error?.message || 'Could not change the template.') } finally { setBusy(null) }
  }
  return <div className="px-10 pb-10 pt-6"><section className="rounded-xl bg-card p-6 shadow-xs">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-bold text-foreground">Goal templates</h2><p className="mt-1 text-sm text-muted-foreground">Reusable stages and steps you hand out to learners as goals.</p></div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived</label>
        <NewTemplateModal orgslug={orgslug} orgId={orgId} token={token} />
      </div>
    </div>
    {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div> : templates?.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {templates.map((template) => <div key={template.template_uuid} className={cn('group relative flex w-full flex-col overflow-hidden rounded-xl bg-card nice-shadow transition-all duration-300 hover:scale-[1.01]', template.status === 'archived' && 'opacity-70')}>
        <Link href={templatePage(orgslug, template.template_uuid)} className="flex flex-1 flex-col">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted text-blue-500">{template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Layers3 size={42} strokeWidth={1.4} />}</div>
          <div className="flex flex-1 flex-col space-y-1.5 p-3">
            <h2 className="line-clamp-1 text-base font-bold leading-tight text-foreground">{template.title}</h2>
            <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-muted-foreground">{template.description || 'Stages and steps to hand out as goals.'}</p>
            <div className="flex items-center justify-between border-t border-border pt-1.5"><TemplateStatusChip template={template} /><span className="text-[10px] text-muted-foreground">{template.system_type ? 'System' : ''}</span></div>
          </div>
        </Link>
        {template.system_type ? null : <button type="button" disabled={busy === template.template_uuid} onClick={() => void toggleArchived(template)} title={template.status === 'archived' ? 'Restore' : 'Archive'} aria-label={`${template.status === 'archived' ? 'Restore' : 'Archive'} ${template.title}`}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-card/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100">
          {busy === template.template_uuid ? <Loader2 size={14} className="animate-spin" /> : template.status === 'archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>}
      </div>)}
    </div> : <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center"><div><Layers3 size={36} className="mx-auto mb-3 text-gray-300" /><p className="text-sm text-muted-foreground">Create a goal template to hand the same stages and steps to many learners.</p></div></div>}
  </section><BadgeTemplatesSection orgslug={orgslug} orgId={orgId} token={token} /></div>
}

function NewTemplateModal({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [query, setQuery] = React.useState('')
  const { data: library = [], isLoading } = useSWR(open && orgId && token ? ['goal-template-library', orgId, query] : null, () => templatesApi.library(orgId, query, token), { revalidateOnFocus: false })
  const run = async (make: () => Promise<{ template_uuid: string }>, failure: string) => {
    setSaving(true)
    try {
      const template = await make()
      await mutate(isTemplatesKey)
      setOpen(false)
      router.push(templatePage(orgslug, template.template_uuid))
    } catch (error: any) { toast.error(error?.message || failure) } finally { setSaving(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New goal template" dialogDescription="Start blank or copy a template from the global library."
    dialogTrigger={<Button variant="brand"><Plus className="h-4 w-4" />New template</Button>}
    dialogContent={<div className="space-y-6 p-2">
      <section className="space-y-3">
        <div><p className="text-sm font-black">Start from the global library</p><p className="text-xs text-muted-foreground">You&apos;ll get your own editable copy, activities included.</p></div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the library" aria-label="Search the template library" />
        {isLoading ? <Loader2 className="mx-auto animate-spin text-muted-foreground" /> : <div className="max-h-56 space-y-2 overflow-y-auto">
          {library.map((item) => <button key={item.template_uuid} type="button" disabled={saving} onClick={() => void run(() => templatesApi.copyFromLibrary(orgId, item.template_uuid, token), 'Could not copy the library template.')}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-blue-300 hover:bg-blue-50/30 disabled:opacity-50">
            <span><span className="block text-sm font-black">{item.title}</span><span className="line-clamp-1 text-xs text-muted-foreground">{item.description || `${item.step_count} steps · ${item.stage_count} stages`}</span></span><BookCopy size={16} />
          </button>)}
          {!library.length ? <p className="rounded-lg border border-dashed border-border py-5 text-center text-xs text-muted-foreground">No library templates match.</p> : null}
        </div>}
      </section>
      <section className="space-y-3 border-t border-border pt-5">
        <p className="text-sm font-black">Or start blank</p>
        <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Template name" aria-label="Template name" />
        <Button onClick={() => void run(() => templatesApi.create(orgId, { title: title.trim() }, token), 'Could not create the template.')} disabled={saving || !title.trim()} className="ml-auto flex">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create blank template</Button>
      </section>
    </div>} />
}
