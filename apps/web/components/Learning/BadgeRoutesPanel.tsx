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
import { getUriWithOrg, routePaths } from '@services/config/config'
import { eligibilityLabel, type EligibilityRule } from '@services/goals/versions'

/** The badge creator chooses which goal templates earn the badge and which one learners see first. */
export default function BadgeRoutesPanel({ badge, orgslug, readOnly = false }: { badge: any; orgslug: string; /** Show the routes without changing them (staff, or another organization's badge). */ readOnly?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, mutate, isLoading } = useSWR(token ? ['badge-routes', badge.badge_uuid, token] : null, () => badgeRoutesApi.list(badge.badge_uuid, token))
  const { data: templates = [] } = useSWR(token && !readOnly ? ['badge-route-goal-templates', badge.org_id, token] : null, () => templatesApi.list(Number(badge.org_id), token))
  const [saving, setSaving] = React.useState(false)
  const routes: any[] = data?.routes || []
  const save = async (next: { template_uuid: string; recommended: boolean }[]) => {
    setSaving(true)
    try { await mutate(await badgeRoutesApi.set(badge.badge_uuid, next, token), false) } catch (error: any) { toast.error(error?.message || 'Could not save the ways to earn this badge.') } finally { setSaving(false) }
  }
  const saveEligibility = async (routeUuid: string, rule: EligibilityRule, fromVersion: number | null) => {
    setSaving(true)
    try { await mutate(await badgeRoutesApi.setEligibility(badge.badge_uuid, routeUuid, rule, fromVersion, token), false) } catch (error: any) { toast.error(error?.message || 'Could not save which versions earn this badge.') } finally { setSaving(false) }
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
        {readOnly ? <span title={route.recommended ? 'Recommended' : undefined} className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} aria-hidden="true" /></span>
          : <button type="button" disabled={saving} onClick={() => save(current.map((item, i) => ({ ...item, recommended: i === index })))} aria-pressed={route.recommended} title="Recommended"
            className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground hover:bg-muted'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} /></button>}
        <div className="min-w-0 flex-1">
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.templatePage(route.template_uuid, 'overview'))} className="text-sm font-black hover:underline">{route.name}</Link>
          <p className="text-xs text-muted-foreground">{route.step_count} step{route.step_count === 1 ? '' : 's'}{route.activity_count ? ` · ${route.activity_count} activit${route.activity_count === 1 ? 'y' : 'ies'}` : ''}{route.recommended ? ' · Recommended' : ''}</p>
        </div>
        {/* On a phone the template's name keeps its line; which versions earn the badge goes under it. */}
        <div className="order-last w-full pl-11 sm:order-none sm:w-auto sm:pl-0 [&>select]:w-full sm:[&>select]:w-auto">
          {readOnly ? <span className="text-xs font-bold text-muted-foreground">{eligibilityLabel(route.eligible_versions?.rule || 'any', route.eligible_versions?.from_version ?? null)}</span>
            : <RouteEligibility route={route} disabled={saving} onChange={(rule, fromVersion) => void saveEligibility(route.route_uuid, rule, fromVersion)} />}
        </div>
        {readOnly ? null : <button type="button" disabled={saving} onClick={() => save(current.filter((_, i) => i !== index))} aria-label={`Remove ${route.name}`} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>}
      </div>)}
      {!routes.length ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {readOnly ? 'No ways to earn this badge yet.' : 'No ways to earn this badge yet. Add a goal template learners can follow to earn it.'}
      </div> : null}
      {available.length && !readOnly ? <label className="flex items-center gap-2 pt-2 text-xs font-bold">
        <Plus size={14} className="text-muted-foreground" />
        <select value="" disabled={saving} onChange={(event) => event.target.value && save([...current, { template_uuid: event.target.value, recommended: !current.length }])} className="h-9 flex-1 rounded-lg border border-border bg-background px-2">
          <option value="">Add a goal template…</option>
          {available.map((template: GoalTemplate) => <option key={template.template_uuid} value={template.template_uuid}>{template.title}</option>)}
        </select>
      </label> : null}
    </div>}
  </section>
}

type EligibilityProps = {
  route: any
  disabled: boolean
  // eslint-disable-next-line no-unused-vars
  onChange: (rule: EligibilityRule, fromVersion: number | null) => void
}

/** Which versions of the route's template earn the badge. Organizations running it decide when to move their assignments. */
function RouteEligibility({ route, disabled, onChange }: EligibilityProps) {
  const latest = Number(route.published_version || 0)
  const rule: EligibilityRule = route.eligible_versions?.rule || 'any'
  const value = rule === 'from' ? `from:${route.eligible_versions?.from_version}` : rule
  const pick = (next: string) => next.startsWith('from:') ? onChange('from', Number(next.slice(5))) : onChange(next as EligibilityRule, null)
  return <select aria-label={`Versions of ${route.name} that earn the badge`} value={value} disabled={disabled || !latest} onChange={(event) => pick(event.target.value)}
    title="Which versions of this template earn the badge" className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold">
    <option value="any">Every version earns it</option>
    <option value="latest">Only the newest version</option>
    {Array.from({ length: Math.max(latest - 1, 0) }, (_, i) => i + 2).map((number) => <option key={number} value={`from:${number}`}>Version {number} and later</option>)}
  </select>
}
