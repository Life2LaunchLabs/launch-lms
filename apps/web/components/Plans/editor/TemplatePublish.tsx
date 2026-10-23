'use client'

import React from 'react'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, Plus, ShieldCheck, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { Features } from '@components/Hooks/useFeatures'
import TemplateMarketplaceListing from '@components/Plans/requests/TemplateMarketplaceListing'
import { StatusPill } from '@components/Plans/requests/BadgeIssuing'
import type { TemplateDetail } from '@services/goals/templates'
import { isMarketplaceKey, MARKETPLACE_KEY, templateMarketplaceApi, type TemplateAuthorization, type TemplateUsageMetrics } from '@services/learning/marketplace'

/** The Publish tab shows for a template the organization owns (not a system one) once it may publish plans or badges. */
export function showsPublishTab(template: TemplateDetail, owned: boolean, readOnly: boolean, features: Pick<Features, 'has'>) {
  return owned && !readOnly && !template.system_type && (features.has('plan_publishing') || features.has('badge_publishing'))
}

const ORDER: Record<string, number> = { requested: 0, approved: 1, rejected: 2, revoked: 3 }

/**
 * Template › Publish: who else may run this plan, and so issue the badges it earns. The marketplace
 * listing, the stack of authorized organizations (requests on top), and quick usage across them.
 */
export default function TemplatePublish({ orgId, token, template, bare = false }: { orgId: number; token?: string; template: TemplateDetail; /** No page padding, inside the plan's visibility dialog. */ bare?: boolean }) {
  const { mutate } = useSWRConfig()
  const ready = Boolean(orgId && token)
  const authorizationsKey = ready ? [MARKETPLACE_KEY, 'template-authorizations', orgId, template.template_uuid, token] : null
  const { data: authorizations, mutate: reload } = useSWR(authorizationsKey, () => templateMarketplaceApi.authorizations(orgId, 'creator', token, 'all', template.template_uuid))
  const { data: metrics } = useSWR(ready ? [MARKETPLACE_KEY, 'template-metrics', orgId, template.template_uuid, token] : null, () => templateMarketplaceApi.metrics(orgId, template.template_uuid, token))
  const [busy, setBusy] = React.useState('')
  const [slug, setSlug] = React.useState('')

  const refresh = async () => { await reload(); await mutate(isMarketplaceKey) }
  const act = async (item: TemplateAuthorization, action: 'approve' | 'reject' | 'revoke', done: string) => {
    setBusy(item.authorization_uuid)
    try {
      await templateMarketplaceApi[action](item.authorization_uuid, token)
      toast.success(done)
      await refresh()
    } catch (error: any) { toast.error(error?.message || 'Could not update the organization.') } finally { setBusy('') }
  }
  const invite = async () => {
    const value = slug.trim()
    if (!value) return
    setBusy('invite')
    try {
      const added = await templateMarketplaceApi.invite(orgId, template.template_uuid, value, token)
      toast.success(`${added.issuer_org?.name || value} can run this plan.`)
      setSlug('')
      await refresh()
    } catch (error: any) { toast.error(error?.message || 'Could not authorize that organization.') } finally { setBusy('') }
  }
  const rows = [...(authorizations || [])].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))

  return <div className={bare ? '' : 'px-4 pb-10 pt-6 sm:px-6 lg:px-10'}><div className={bare ? 'space-y-6' : 'mx-auto max-w-5xl space-y-6'}>
    <UsageMetrics metrics={metrics} />
    <TemplateMarketplaceListing orgId={orgId} token={token} template={template} />
    <section aria-labelledby="template-authorized-title" className="rounded-xl border border-border bg-card p-6 shadow-xs" data-testid="template-authorized-orgs">
      <h2 id="template-authorized-title" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} />Authorized organizations</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Organizations you authorize run this plan with their own learners, and issue the badges it earns. For a plan meant for trusted partners only, authorize only them.</p>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void invite() }}>
        <label className="block flex-1 text-xs font-bold uppercase text-muted-foreground">
          Authorize an organization by slug
          <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="org-slug" className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm normal-case text-foreground outline-none focus:ring-2 focus:ring-black" />
        </label>
        <Button type="submit" disabled={busy === 'invite' || !slug.trim()} className="gap-2">{busy === 'invite' ? <Loader2 className="animate-spin" /> : <Plus />}Authorize</Button>
      </form>
      <div className="mt-5 space-y-2">
        {!authorizations ? <Loader2 className="animate-spin text-muted-foreground" /> : rows.length ? rows.map((item) => <article key={item.authorization_uuid}
          className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center ${item.status === 'requested' ? 'border-amber-200 bg-amber-50/60' : 'border-border'}`} data-testid="template-authorized-org">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{item.issuer_org?.name || 'Organization'}</p>
            <p className="text-xs text-muted-foreground">{[item.issuer_org?.slug, item.learner_count !== undefined && item.status === 'approved' ? `${item.learner_count} learner plan${item.learner_count === 1 ? '' : 's'}` : null, item.message ? `“${item.message}”` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusPill status={item.status} />
            {item.status === 'requested' ? <>
              <Button size="sm" variant="outline" disabled={busy === item.authorization_uuid} onClick={() => void act(item, 'reject', 'Request declined.')}><X />Decline</Button>
              <Button size="sm" disabled={busy === item.authorization_uuid} onClick={() => void act(item, 'approve', 'Organization authorized.')}><Check />Approve</Button>
            </> : null}
            {item.status === 'approved' ? <Button size="sm" variant="outline" className="text-red-700" disabled={busy === item.authorization_uuid} onClick={() => void act(item, 'revoke', 'Authorization revoked. Their running assignments stop issuing new plans.')}>Revoke</Button> : null}
          </div>
        </article>) : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Only your organization runs this plan. List it in the marketplace or authorize an organization above.</p>}
      </div>
    </section>
  </div></div>
}

function UsageMetrics({ metrics }: { metrics?: TemplateUsageMetrics }) {
  const stats: [string, number | undefined][] = [
    ['Authorized orgs', metrics?.authorized_orgs], ['Orgs running it', metrics?.orgs_running], ['Assignments', metrics?.assignments],
    ['Active learners', metrics?.active_learners], ['Completions', metrics?.completions], ['Badges earned', metrics?.badges_earned],
  ]
  return <section aria-label="Usage" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="template-usage-metrics">
    {stats.map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value ?? '–'}</p>
    </div>)}
  </section>
}
