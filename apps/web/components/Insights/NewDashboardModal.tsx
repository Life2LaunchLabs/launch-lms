'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { SCOPE_LABELS, VISIBILITY_LABELS, insightKeys, insightsApi, type Scope, type Visibility } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import { ScopeGlyph, useInsightsContext } from './shared'

const SCOPES: Array<{ scope: Scope; detail: string }> = [
  { scope: 'org', detail: 'The whole organization' },
  { scope: 'plan', detail: 'Any one plan, picked when you open it' },
  { scope: 'group', detail: 'Any one group, picked when you open it' },
  { scope: 'learner', detail: 'Any one learner, picked when you open it' },
]
const VISIBILITY_DETAIL: Record<Visibility, string> = {
  me: 'Only you see it.',
  staff: 'Every staff member sees it, each with the learners their access allows. Needs See reports.',
  admins: "Your organization's admins see it.",
}

export function dashboardHref(orgslug: string, scope: Scope, uuid: string) {
  const admin = routePaths.org.admin
  return getUriWithOrg(orgslug, scope === 'org' ? admin.insights(uuid) : admin.insightsScope(scope, null, uuid))
}

/** New dashboard: what it's about, a template or blank, its name, and who sees it. */
export default function NewDashboardModal({ scope, onClose }: { scope: Scope | null; onClose: () => void }) {
  return <Modal isDialogOpen={Boolean(scope)} onOpenChange={(open) => { if (!open) onClose() }} minHeight="no-min" minWidth="md" dialogTitle="New dashboard"
    dialogDescription="Start from a template or a blank page. Templates are only a start: every card can be changed."
    dialogContent={scope ? <NewDashboardForm initialScope={scope} close={onClose} /> : null} />
}

function NewDashboardForm({ initialScope, close }: { initialScope: Scope; close: () => void }) {
  const router = useRouter()
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const [scope, setScope] = React.useState<Scope>(initialScope)
  const [template, setTemplate] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [visibility, setVisibility] = React.useState<Visibility>('me')
  const [saving, setSaving] = React.useState(false)
  const { data: library } = useSWR(ready ? insightKeys.library(orgId, scope) : null, () => insightsApi.library(orgId, scope, token), { revalidateOnFocus: false })
  const picked = library?.templates.find((item) => item.key === template)

  React.useEffect(() => { setTemplate(null) }, [scope])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const made = await insightsApi.create(orgId, { scope, template, visibility, title: title.trim() || picked?.title || undefined }, token)
      await mutate(insightKeys.dashboards(orgId))
      close()
      router.push(dashboardHref(orgslug, made.scope, made.dashboard_uuid))
    } catch (error: any) {
      toast.error(error?.message || "Couldn't make the dashboard")
    } finally {
      setSaving(false)
    }
  }

  const option = (on: boolean) => cn('flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
    on ? 'border-foreground bg-muted' : 'border-border hover:bg-muted')

  return <form onSubmit={create} className="space-y-5">
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">What is it about?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {SCOPES.map((item) => <button key={item.scope} type="button" onClick={() => setScope(item.scope)} aria-pressed={scope === item.scope} className={option(scope === item.scope)}>
          <ScopeGlyph scope={item.scope} /><span className="min-w-0"><b className="block text-[13.5px]">{SCOPE_LABELS[item.scope].one}</b>
            <span className="block text-[12px] leading-snug text-muted-foreground">{item.detail}</span></span>
        </button>)}
      </div>
    </fieldset>
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">Start from</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setTemplate(null)} aria-pressed={template === null} className={option(template === null)}>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border" aria-hidden="true"><Plus size={14} /></span>
          <span className="min-w-0"><b className="block text-[13.5px]">Blank</b><span className="block text-[12px] text-muted-foreground">Add cards one at a time.</span></span>
        </button>
        {library ? library.templates.map((item) => <button key={item.key} type="button" onClick={() => setTemplate(item.key)} aria-pressed={template === item.key} className={option(template === item.key)}>
          <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', template === item.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')} aria-hidden="true">
            {template === item.key ? <Check size={14} /> : <span className="text-[11px] font-bold">{item.cards.length}</span>}
          </span>
          <span className="min-w-0"><b className="block text-[13.5px]">{item.title}</b><span className="block text-[12px] leading-snug text-muted-foreground">{item.description}</span></span>
        </button>) : <span className="h-14 animate-pulse rounded-xl bg-muted" />}
      </div>
    </fieldset>
    <div className="space-y-1.5">
      <Label htmlFor="dashboard-title">Name</Label>
      <Input id="dashboard-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={picked?.title || 'Untitled dashboard'} />
    </div>
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-semibold">Who sees it</legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((key) => <button key={key} type="button" onClick={() => setVisibility(key)} aria-pressed={visibility === key}
          className={cn('h-8 rounded-full border px-3 text-[13px] font-semibold', visibility === key ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted')}>{VISIBILITY_LABELS[key]}</button>)}
      </div>
      <p className="text-[12px] text-muted-foreground">{VISIBILITY_DETAIL[visibility]}</p>
    </fieldset>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={close} className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">Cancel</button>
      <button type="submit" disabled={saving || !ready} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 size={15} className="animate-spin" /> : null}Make dashboard
      </button>
    </div>
  </form>
}
