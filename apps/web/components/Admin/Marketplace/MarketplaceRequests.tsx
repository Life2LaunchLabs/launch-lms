'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Check, Medal } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  getCreatorIssuanceMetrics,
  isMarketplaceKey,
  MARKETPLACE_KEY,
  templateMarketplaceApi,
  type MarketplaceOrg,
  type PlanBadge,
  type TemplateAuthorization,
} from '@services/learning/marketplace'
import { cn } from '@/lib/utils'
import { IssuedBadgesPanel, StatusPill } from './BadgeIssuing'

/** A plan request or permission. A plan that earns badges is how an organization issues them. */
type Row = {
  key: string
  org: MarketplaceOrg | null
  title: string
  href?: string
  status: string
  message?: string
  detail: string
  badges: PlanBadge[]
  authorizationUuid: string
}

function planRow(item: TemplateAuthorization, side: 'creator' | 'issuer', orgslug: string, awards?: number): Row {
  const mode = item.template?.mode === 'open' ? 'open: copy and edit' : item.template?.mode === 'locked' ? 'locked: run as-is' : 'run as-is'
  // The owner manages who runs its plan on the plan's Publish tab; the issuer opens the plan (or its copy).
  const href = side === 'issuer' && item.status === 'approved' && item.template
    ? getUriWithOrg(orgslug, routePaths.org.admin.templatePage(item.copied_template_uuid || item.template.template_uuid, 'overview'))
    : side === 'creator' && item.template ? getUriWithOrg(orgslug, routePaths.org.admin.templatePage(item.template.template_uuid, 'publish')) : undefined
  const counts = [
    side === 'creator' && item.learner_count !== undefined ? `${item.learner_count} learner plan${item.learner_count === 1 ? '' : 's'}` : '',
    awards ? `${awards} badge${awards === 1 ? '' : 's'} awarded` : '',
    item.copied_template_uuid ? 'copied into your templates' : '',
  ].filter(Boolean)
  return {
    key: item.authorization_uuid, org: side === 'creator' ? item.issuer_org : item.creator_org, title: item.template?.title || 'Plan', href,
    status: item.status, message: item.message, authorizationUuid: item.authorization_uuid, badges: item.badges || [],
    detail: [`Plan (${mode})`, ...counts].join(' · '),
  }
}

/**
 * Requests: who's asking to run your plans, what you asked for, what you run from other orgs and who
 * runs yours. Approval on a plan that earns a badge is permission to issue that badge. Admins only.
 */
export default function MarketplaceRequests() {
  const { orgId, token, admin } = useStaff()
  const org = useOrg() as { slug?: string } | null
  const orgslug = org?.slug || ''
  const ready = Boolean(admin && orgId && token)
  const key = (name: string) => (ready ? [MARKETPLACE_KEY, name, orgId, token] : null)
  const { data: creatorPlans = [] } = useSWR(key('template-auth-creator'), () => templateMarketplaceApi.authorizations(orgId, 'creator', token))
  const { data: issuerPlans = [] } = useSWR(key('template-auth-issuer'), () => templateMarketplaceApi.authorizations(orgId, 'issuer', token))
  const { data: metrics } = useSWR(key('creator-metrics'), async () => { const response: any = await getCreatorIssuanceMetrics(orgId, token); return response?.success ? response.data : null })
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = React.useState('')

  if (!admin) return <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">Only admins see and answer marketplace requests.</p>

  // Badges an issuer awarded, summed over the badges a plan earns.
  const awardsBy = (item: TemplateAuthorization) => (item.badges || []).reduce((total, badge) => {
    const entry = (metrics?.badges || []).find((row: any) => row.badge?.badge_uuid === badge.badge_uuid)
    return total + (entry?.by_issuer?.find((row: any) => row.org?.id === item.issuer_org?.id)?.awards ?? 0)
  }, 0)
  const act = async (row: Row, action: 'approve' | 'reject' | 'revoke', done: string) => {
    setBusy(row.key)
    try {
      if (action === 'approve') await templateMarketplaceApi.approve(row.authorizationUuid, token)
      if (action === 'reject') await templateMarketplaceApi.reject(row.authorizationUuid, token)
      if (action === 'revoke') await templateMarketplaceApi.revoke(row.authorizationUuid, token)
      toast.success(done)
      await mutate(isMarketplaceKey)
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the request.')
    } finally {
      setBusy('')
    }
  }

  const incoming = creatorPlans.filter((item) => item.status === 'requested').map((item) => planRow(item, 'creator', orgslug))
  const outgoing = issuerPlans.filter((item) => item.status === 'requested').map((item) => planRow(item, 'issuer', orgslug))
  const added = issuerPlans.filter((item) => item.status === 'approved').map((item) => planRow(item, 'issuer', orgslug))
  const running = creatorPlans.filter((item) => item.status === 'approved').map((item) => planRow(item, 'creator', orgslug, awardsBy(item)))
  const button = (row: Row, label: React.ReactNode, action: 'approve' | 'reject' | 'revoke', done: string, primary = false) =>
    <button type="button" disabled={busy === row.key} onClick={() => void act(row, action, done)}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50', primary ? 'bg-black text-white hover:bg-black/85' : 'border border-gray-200 bg-white hover:bg-gray-50')}>{label}</button>

  return <div className="space-y-8">
    <p className="max-w-[70ch] text-sm text-gray-600">Requests to run plans, in both directions, and who runs what. Running a plan that earns a badge is how an organization issues that badge.</p>
    <Section title="Asking to run yours" count={incoming.length} empty="Nobody is asking right now." testId="marketplace-incoming">
      {incoming.map((row) => <RequestRow key={row.key} row={row} lead={<><b>{row.org?.name || 'An organization'}</b> wants to run </>}>
        {button(row, 'Decline', 'reject', 'Request declined.')}
        {button(row, <><Check size={14} />Approve</>, 'approve', 'Request approved.', true)}
      </RequestRow>)}
    </Section>
    <Section title="Your requests" count={outgoing.length} empty={<>You haven&apos;t asked for anything. <Link className="font-semibold underline" href={getUriWithOrg(orgslug, routePaths.org.admin.marketplace())}>Browse the marketplace</Link></>}>
      {outgoing.map((row) => <RequestRow key={row.key} row={row} lead={<>You asked <b>{row.org?.name || 'the creator'}</b> to run </>}>
        <StatusPill status={row.status} />
        {button(row, 'Withdraw', 'revoke', 'Request withdrawn.')}
      </RequestRow>)}
    </Section>
    <Section title="Added from other orgs" count={added.length} empty="Nothing added from other orgs yet.">
      {added.map((row) => <RequestRow key={row.key} row={row} lead={<>From <b>{row.org?.name || 'another org'}</b>: </>}>
        {button(row, row.badges.length ? 'Leave plan' : 'Stop using', 'revoke', row.badges.length ? 'You left the plan and no longer issue its badges through it.' : 'You no longer use this template.')}
      </RequestRow>)}
    </Section>
    <IssuedBadgesPanel orgId={orgId} />
    <Section title="Orgs running yours" count={running.length} empty="No other org runs your plans yet.">
      {running.map((row) => <RequestRow key={row.key} row={row} lead={<><b>{row.org?.name || 'An organization'}</b> runs </>}>
        {button(row, 'Revoke', 'revoke', 'Permission revoked.')}
      </RequestRow>)}
    </Section>
  </div>
}

function Section({ title, count, empty, testId, children }: { title: string; count: number; empty: React.ReactNode; testId?: string; children: React.ReactNode }) {
  return <section aria-label={title} data-testid={testId}>
    <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{title} · {count}</h2>
    <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
      {count ? children : <p className="px-4 py-6 text-center text-sm text-gray-500">{empty}</p>}
    </div>
  </section>
}

function RequestRow({ row, lead, children }: { row: Row; lead: React.ReactNode; children: React.ReactNode }) {
  const initials = (row.org?.name || '?').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center" data-testid="marketplace-request-row">
    <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-xs font-bold text-gray-700 sm:inline-grid">{initials}</span>
    <div className="min-w-0 flex-1 text-sm">
      {lead}{row.href ? <Link className="font-semibold underline-offset-2 hover:underline" href={row.href}>{row.title}</Link> : <b>{row.title}</b>}
      {row.badges.length ? <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-amber-800">{row.badges.map((badge) => <span key={badge.route_uuid} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5"><Medal size={12} />Earns {badge.name}</span>)}</p> : null}
      <p className="text-xs text-gray-500">{row.detail}{row.message ? ` · “${row.message}”` : ''}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
}
