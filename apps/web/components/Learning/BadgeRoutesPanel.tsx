'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowRightLeft, Loader2, Plus, Star, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import { programsApi } from '@services/programs/programs'
import { getUriWithOrg } from '@services/config/config'

/** The badge creator chooses which plan templates earn the badge and which one learners see first. */
export default function BadgeRoutesPanel({ badge, orgslug }: { badge: any; orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, mutate, isLoading } = useSWR(token ? ['badge-routes', badge.badge_uuid, token] : null, () => badgeRoutesApi.list(badge.badge_uuid, token))
  const { data: templates = [] } = useSWR(token ? ['badge-route-templates', badge.org_id, token] : null, () => programsApi.list(Number(badge.org_id), token))
  const [saving, setSaving] = React.useState(false)
  const routes: any[] = data?.routes || []
  const save = async (next: { program_uuid: string; recommended: boolean }[]) => {
    setSaving(true)
    try { await mutate(await badgeRoutesApi.set(badge.badge_uuid, next, token), false) } catch (error: any) { toast.error(error?.message || 'Could not save the ways to earn this badge.') } finally { setSaving(false) }
  }
  const current = routes.map((route) => ({ program_uuid: route.program_uuid, recommended: route.recommended }))
  const convert = async () => {
    setSaving(true)
    try { await mutate(await badgeRoutesApi.convertPath(badge.badge_uuid, token), false); toast.success('The learning path is now a plan template and the recommended way to earn this badge.') } catch (error: any) { toast.error(error?.message || 'Could not convert the learning path.') } finally { setSaving(false) }
  }
  const available = (Array.isArray(templates) ? templates : templates?.items || []).filter((template: any) => !routes.some((route) => route.program_uuid === template.program_uuid))

  return <section className="mb-8 rounded-xl border border-border bg-card p-6 shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold">Ways to earn</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Plan templates learners can follow to earn this badge. Starting one gives the learner their own plan, offered by the issuer they choose. Finishing every step awards the badge.</p>
      </div>
      {saving ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : null}
    </div>
    {isLoading ? <Loader2 className="mt-6 animate-spin text-muted-foreground" /> : <div className="mt-5 space-y-2">
      {routes.map((route, index) => <div key={route.route_uuid} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <button type="button" disabled={saving} onClick={() => save(current.map((item, i) => ({ ...item, recommended: i === index })))} aria-pressed={route.recommended} title="Recommended"
          className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground hover:bg-muted'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} /></button>
        <div className="min-w-0 flex-1">
          <Link href={getUriWithOrg(orgslug, `/admin/plans/${route.program_uuid}/objectives`)} className="text-sm font-black hover:underline">{route.name}</Link>
          <p className="text-xs text-muted-foreground">{route.step_count} step{route.step_count === 1 ? '' : 's'}{route.activity_count ? ` · ${route.activity_count} activit${route.activity_count === 1 ? 'y' : 'ies'}` : ''}{route.recommended ? ' · Recommended' : ''}</p>
        </div>
        <button type="button" disabled={saving} onClick={() => save(current.filter((_, i) => i !== index))} aria-label={`Remove ${route.name}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
      </div>)}
      {!routes.length ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No ways to earn this badge yet. Add a plan template, or turn its learning path into one.
        <button type="button" disabled={saving} onClick={convert} className="ml-3 inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><ArrowRightLeft size={13} />Convert learning path</button>
      </div> : null}
      {available.length ? <label className="flex items-center gap-2 pt-2 text-xs font-bold">
        <Plus size={14} className="text-muted-foreground" />
        <select value="" disabled={saving} onChange={(event) => event.target.value && save([...current, { program_uuid: event.target.value, recommended: !current.length }])} className="h-9 flex-1 rounded-lg border border-border bg-background px-2">
          <option value="">Add a plan template…</option>
          {available.map((template: any) => <option key={template.program_uuid} value={template.program_uuid}>{template.name}</option>)}
        </select>
      </label> : null}
    </div>}
  </section>
}
