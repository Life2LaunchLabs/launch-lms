'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ChevronRight, Loader2, Plus, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import { templatesApi } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { eligibilityLabel, type EligibilityRule } from '@services/goals/versions'
import { OfferedBy } from '@components/Learning/PlanAccessList'

type OrgRef = { id: number; name: string; slug: string }
/** Who owns a route's plan and who is approved on it (pending requests are counted only for the owner's admins). */
type PlanIssuers = { owner_org: OrgRef | null; approved: OrgRef[]; requested: number }

/**
 * Ways to earn: a stack of cards, one per plan that earns the badge. Who may issue the badge is who is
 * approved on one of these plans, so each card previews its authorized issuers and links to the plan's
 * Publish tab, where its owner manages them. The badge creator picks the plans and the recommended one.
 */
export default function BadgeRoutesPanel({ badge, orgslug, readOnly = false }: { badge: any; orgslug: string; /** Show the routes without changing them (staff, or another organization's badge). */ readOnly?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number((useOrg() as { id?: number } | null)?.id)
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
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Plans learners follow to earn this badge. Organizations authorized on a plan issue the badge through it, so a plan meant for trusted partners is one you authorize only trusted partners on. Finishing every step awards the badge.</p>
      </div>
      {saving ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : null}
    </div>
    {isLoading ? <Loader2 className="mt-6 animate-spin text-muted-foreground" /> : <div className="mt-5 space-y-3">
      {routes.map((route, index) => <article key={route.route_uuid} className="rounded-xl border border-border bg-background" data-testid="badge-route-card">
        <div className="flex flex-wrap items-center gap-3 p-4">
          {readOnly ? <span title={route.recommended ? 'Recommended' : undefined} className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} aria-hidden="true" /></span>
            : <button type="button" disabled={saving} onClick={() => save(current.map((item, i) => ({ ...item, recommended: i === index })))} aria-pressed={route.recommended} title="Recommended"
              className={route.recommended ? 'rounded-full bg-amber-100 p-2 text-amber-700' : 'rounded-full p-2 text-muted-foreground hover:bg-muted'}><Star size={15} fill={route.recommended ? 'currentColor' : 'none'} /></button>}
          <div className="min-w-0 flex-1">
            <Link href={getUriWithOrg(orgslug, routePaths.org.admin.templatePage(route.template_uuid, 'overview'))} className="text-sm font-black hover:underline">{route.name}</Link>
            <p className="text-xs text-muted-foreground">{route.step_count} step{route.step_count === 1 ? '' : 's'}{route.activity_count ? ` · ${route.activity_count} activit${route.activity_count === 1 ? 'y' : 'ies'}` : ''}{route.recommended ? ' · Recommended' : ''}</p>
            {/* Who lets learners start this plan is set on each organization's plan Settings. */}
            <OfferedBy offers={route.issuers || []} className="mt-1" />
          </div>
          {/* On a phone the template's name keeps its line; which versions earn the badge goes under it. */}
          <div className="order-last w-full pl-11 sm:order-none sm:w-auto sm:pl-0 [&>select]:w-full sm:[&>select]:w-auto">
            {readOnly ? <span className="text-xs font-bold text-muted-foreground">{eligibilityLabel(route.eligible_versions?.rule || 'any', route.eligible_versions?.from_version ?? null)}</span>
              : <RouteEligibility route={route} disabled={saving} onChange={(rule, fromVersion) => void saveEligibility(route.route_uuid, rule, fromVersion)} />}
          </div>
          {readOnly ? null : <button type="button" disabled={saving} onClick={() => save(current.filter((_, i) => i !== index))} aria-label={`Remove ${route.name}`} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>}
        </div>
        <RouteIssuers route={route} orgslug={orgslug} orgId={orgId} />
      </article>)}
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

/** A card's footer: who may issue the badge through this plan, and where its owner manages them. */
function RouteIssuers({ route, orgslug, orgId }: { route: { template_uuid: string; name: string; plan_issuers?: PlanIssuers }; orgslug: string; orgId: number }) {
  const features = useFeatures()
  const issuers = route.plan_issuers
  if (!issuers) return null
  const owner = issuers.owner_org
  const manageable = Boolean(owner && owner.id === orgId)
  // The plan's Publish tab is where its owner manages them (shown to organizations that may publish).
  const linked = manageable && (features.has('plan_publishing') || features.has('badge_publishing'))
  const shown = issuers.approved.slice(0, 3)
  const more = issuers.approved.length - shown.length
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-muted/40 px-4 py-3 text-xs" data-testid="badge-route-issuers">
    <ShieldCheck size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1 text-muted-foreground">
      {issuers.approved.length ? <>Authorized issuers: <span className="font-semibold text-foreground">{shown.map((org) => org.name).join(', ')}</span>{more > 0 ? ` and ${more} more` : ''}</>
        : manageable ? 'Only your organization issues the badge through this plan.' : `Only ${owner?.name || 'its owner'} issues the badge through this plan.`}
      {manageable && issuers.requested ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">{issuers.requested} request{issuers.requested === 1 ? '' : 's'} waiting</span> : null}
      {!manageable && owner ? <span className="block">Plan owned by <span className="font-semibold text-foreground">{owner.name}</span>, who manages who may issue through it.</span> : null}
    </span>
    {linked ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.templatePage(route.template_uuid, 'publish'))} aria-label={`Authorized issuers for ${route.name}`}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 font-bold hover:bg-muted">Authorized issuers<ChevronRight size={13} aria-hidden="true" /></Link> : null}
  </div>
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
