'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus, Star, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import { templatesApi } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { getUriWithOrg } from '@services/config/config'

/** The badge creator chooses which goal templates earn the badge and which one learners see first. */
export default function BadgeRoutesPanel({ badge, orgslug }: { badge: any; orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, mutate, isLoading } = useSWR(token ? ['badge-routes', badge.badge_uuid, token] : null, () => badgeRoutesApi.list(badge.badge_uuid, token))
  const { data: templates = [] } = useSWR(token ? ['badge-route-goal-templates', badge.org_id, token] : null, () => templatesApi.list(Number(badge.org_id), token))
  const [saving, setSaving] = React.useState(false)
  const routes: any[] = data?.routes || []
  const save = async (next: { template_uuid: string; recommended: boolean }[]) => {
    setSaving(true)
    try { await mutate(await badgeRoutesApi.set(badge.badge_uuid, next, token), false) } catch (error: any) { toast.error(error?.message || 'Could not save the ways to earn this badge.') } finally { setSaving(false) }
  }
  const current = routes.map((route) => ({ template_uuid: route.template_uuid, recommended: route.recommended }))
  const available = (Array.isArray(templates) ? templates : []).filter((template: GoalTemplate) => !template.system_type && template.status !== 'archived' && !routes.some((route) => route.template_uuid === template.template_uuid))

  return <section className="mb-8 rounded-xl border border-border bg-card p-6 shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold">Ways to earn</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Goal templates learners can follow to earn this badge. Starting one gives the learner their own goal, offered by the issuer they choose. Finishing every step awards the badge.</p>
      </div>
      {saving ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : null}
    </div>
    {isLoading ? <Loader2 className="mt-6 animate-spin text-muted-foreground" /> : <div className="mt-5 space-y-2">
      {routes.map((route, index) => <div key={route.route_uuid} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <button type="button" disabled={saving} onClick={() => save(current.map((item, i) => ({ ...item, recommended: i === index })))} aria-pressed={route.recommended} title="Recommended"
          className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground hover:bg-muted'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} /></button>
        <div className="min-w-0 flex-1">
          <Link href={getUriWithOrg(orgslug, `/admin/plans/${encodeURIComponent(route.template_uuid)}`)} className="text-sm font-black hover:underline">{route.name}</Link>
          <p className="text-xs text-muted-foreground">{route.step_count} step{route.step_count === 1 ? '' : 's'}{route.activity_count ? ` · ${route.activity_count} activit${route.activity_count === 1 ? 'y' : 'ies'}` : ''}{route.recommended ? ' · Recommended' : ''}</p>
        </div>
        <button type="button" disabled={saving} onClick={() => save(current.filter((_, i) => i !== index))} aria-label={`Remove ${route.name}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
      </div>)}
      {!routes.length ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No ways to earn this badge yet. Add a goal template learners can follow to earn it.
      </div> : null}
      {available.length ? <label className="flex items-center gap-2 pt-2 text-xs font-bold">
        <Plus size={14} className="text-muted-foreground" />
        <select value="" disabled={saving} onChange={(event) => event.target.value && save([...current, { template_uuid: event.target.value, recommended: !current.length }])} className="h-9 flex-1 rounded-lg border border-border bg-background px-2">
          <option value="">Add a goal template…</option>
          {available.map((template: GoalTemplate) => <option key={template.template_uuid} value={template.template_uuid}>{template.title}</option>)}
        </select>
      </label> : null}
    </div>}
  </section>
}
