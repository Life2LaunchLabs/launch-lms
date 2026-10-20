'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Check } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templatesApi } from '@services/goals/templates'
import {
  acceptIssuerInvite,
  approveIssuerAuthorization,
  getCreatorIssuanceMetrics,
  getIssuerAuthorizations,
  isMarketplaceKey,
  MARKETPLACE_KEY,
  rejectIssuerAuthorization,
  revokeIssuerAuthorization,
  templateMarketplaceApi,
  type MarketplaceOrg,
  type TemplateAuthorization,
} from '@services/learning/marketplace'
import { cn } from '@/lib/utils'
import { IssuingAuthorizationsPanel, StatusPill } from './BadgeIssuing'

const listOf = (response: any): any[] => {
  const data = response?.success !== undefined ? response.data : response
  return Array.isArray(data) ? data : []
}

/** A request or permission row, for templates and badges alike. */
type Row = {
  key: string
  kind: 'template' | 'badge'
  org: MarketplaceOrg | null
  title: string
  href?: string
  status: string
  message?: string
  detail?: string
  authorizationUuid: string
}

function templateRow(item: TemplateAuthorization, side: 'creator' | 'issuer', orgslug: string): Row {
  const mode = item.template?.mode === 'open' ? 'open: copy and edit' : 'locked: run as-is'
  const href = side === 'issuer' && item.status === 'approved' && item.template
    ? getUriWithOrg(orgslug, routePaths.org.admin.templatePage(item.copied_template_uuid || item.template.template_uuid, 'overview'))
    : side === 'creator' && item.template ? getUriWithOrg(orgslug, routePaths.org.admin.templatePage(item.template.template_uuid, 'settings')) : undefined
  return {
    key: `t:${item.authorization_uuid}`, kind: 'template', org: side === 'creator' ? item.issuer_org : item.creator_org, title: item.template?.title || 'Template', href,
    status: item.status, message: item.message, authorizationUuid: item.authorization_uuid,
    detail: side === 'creator' && item.learner_count !== undefined ? `Template (${mode}) · ${item.learner_count} learner plan${item.learner_count === 1 ? '' : 's'}` : `Template (${mode})${item.copied_template_uuid ? ' · copied into your templates' : ''}`,
  }
}

function badgeRow(item: any, side: 'creator' | 'issuer', awards?: number): Row {
  return {
    key: `b:${item.authorization_uuid}`, kind: 'badge', org: side === 'creator' ? item.issuer_org : item.creator_org, title: item.badge?.name || 'Badge',
    status: item.status, message: item.message || '', authorizationUuid: item.authorization_uuid,
    detail: `Badge${awards !== undefined ? ` · ${awards} awarded` : ''}`,
  }
}

/**
 * Requests: who's asking to use your templates and badges, what you asked for, what you added
 * from other orgs and who runs yours. Admins only; templates and badges side by side.
 */
export default function MarketplaceRequests() {
  const { orgId, token, admin } = useStaff()
  const org = useOrg() as { slug?: string } | null
  const orgslug = org?.slug || ''
  const ready = Boolean(admin && orgId && token)
  const key = (name: string) => (ready ? [MARKETPLACE_KEY, name, orgId, token] : null)
  const { data: creatorTemplates = [] } = useSWR(key('template-auth-creator'), () => templateMarketplaceApi.authorizations(orgId, 'creator', token))
  const { data: issuerTemplates = [] } = useSWR(key('template-auth-issuer'), () => templateMarketplaceApi.authorizations(orgId, 'issuer', token))
  const { data: creatorBadges = [] } = useSWR(key('badge-auth-creator'), async () => listOf(await getIssuerAuthorizations(orgId, 'creator', token)))
  const { data: issuerBadges = [] } = useSWR(key('badge-auth-issuer'), async () => listOf(await getIssuerAuthorizations(orgId, 'issuer', token)))
  const { data: metrics } = useSWR(key('creator-metrics'), async () => { const response: any = await getCreatorIssuanceMetrics(orgId, token); return response?.success ? response.data : null })
  const { data: badgeRoutes = [] } = useSWR(key('badge-routes'), () => templatesApi.badgeRoutes(orgId, token).catch(() => []))
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = React.useState('')

  if (!admin) return <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">Only admins see and answer marketplace requests.</p>

  const awardsBy = (badgeUuid?: string, issuerId?: number) => {
    const badge = (metrics?.badges || []).find((entry: any) => entry.badge?.badge_uuid === badgeUuid)
    return badge?.by_issuer?.find((entry: any) => entry.org?.id === issuerId)?.awards ?? 0
  }
  const act = async (row: Row, action: 'approve' | 'reject' | 'revoke' | 'accept', done: string) => {
    setBusy(row.key)
    try {
      if (row.kind === 'template') {
        if (action === 'approve') await templateMarketplaceApi.approve(row.authorizationUuid, token)
        if (action === 'reject') await templateMarketplaceApi.reject(row.authorizationUuid, token)
        if (action === 'revoke') await templateMarketplaceApi.revoke(row.authorizationUuid, token)
      } else {
        if (action === 'approve') await approveIssuerAuthorization(row.authorizationUuid, token)
        if (action === 'reject') await rejectIssuerAuthorization(row.authorizationUuid, token)
        if (action === 'revoke') await revokeIssuerAuthorization(row.authorizationUuid, token)
        if (action === 'accept') await acceptIssuerInvite(row.authorizationUuid, token)
      }
      toast.success(done)
      await mutate(isMarketplaceKey)
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the request.')
    } finally {
      setBusy('')
    }
  }

  const incoming = [
    ...creatorTemplates.filter((item) => item.status === 'requested').map((item) => templateRow(item, 'creator', orgslug)),
    ...creatorBadges.filter((item) => item.status === 'requested').map((item) => badgeRow(item, 'creator')),
  ]
  const outgoing = [
    ...issuerTemplates.filter((item) => item.status === 'requested').map((item) => templateRow(item, 'issuer', orgslug)),
    ...issuerBadges.filter((item) => ['requested', 'queued', 'invited'].includes(item.status)).map((item) => badgeRow(item, 'issuer')),
  ]
  const added = issuerTemplates.filter((item) => item.status === 'approved').map((item) => templateRow(item, 'issuer', orgslug))
  const running = [
    ...creatorTemplates.filter((item) => item.status === 'approved').map((item) => templateRow(item, 'creator', orgslug)),
    ...creatorBadges.filter((item) => item.status === 'approved').map((item) => badgeRow(item, 'creator', awardsBy(item.badge?.badge_uuid, item.issuer_org?.id))),
  ]
  const button = (row: Row, label: React.ReactNode, action: 'approve' | 'reject' | 'revoke' | 'accept', done: string, primary = false) =>
    <button type="button" disabled={busy === row.key} onClick={() => void act(row, action, done)}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50', primary ? 'bg-black text-white hover:bg-black/85' : 'border border-gray-200 bg-white hover:bg-gray-50')}>{label}</button>

  return <div className="space-y-8">
    <p className="max-w-[70ch] text-sm text-gray-600">Requests to use templates and badges, in both directions, and who uses what.</p>
    <Section title="Asking to use yours" count={incoming.length} empty="Nobody is asking right now." testId="marketplace-incoming">
      {incoming.map((row) => <RequestRow key={row.key} row={row} lead={<><b>{row.org?.name || 'An organization'}</b> wants to {row.kind === 'badge' ? 'issue' : 'use'} </>}>
        {button(row, 'Decline', 'reject', 'Request declined.')}
        {button(row, <><Check size={14} />Approve</>, 'approve', 'Request approved.', true)}
      </RequestRow>)}
    </Section>
    <Section title="Your requests" count={outgoing.length} empty={<>You haven&apos;t asked for anything. <Link className="font-semibold underline" href={getUriWithOrg(orgslug, routePaths.org.admin.marketplace())}>Browse the marketplace</Link></>}>
      {outgoing.map((row) => <RequestRow key={row.key} row={row} lead={<>You asked <b>{row.org?.name || 'the creator'}</b> {row.status === 'invited' ? 'and were invited ' : ''}to {row.kind === 'badge' ? 'issue' : 'use'} </>}>
        <StatusPill status={row.status === 'requested' ? 'requested' : row.status} />
        {row.status === 'invited' ? button(row, <><Check size={14} />Accept</>, 'accept', 'Invite accepted.', true) : button(row, 'Withdraw', 'revoke', 'Request withdrawn.')}
      </RequestRow>)}
    </Section>
    <Section title="Added from other orgs" count={added.length + badgeRoutes.length} empty="Nothing added from other orgs yet.">
      {added.map((row) => <RequestRow key={row.key} row={row} lead={<>From <b>{row.org?.name || 'another org'}</b>: </>}>
        {button(row, 'Stop using', 'revoke', 'You no longer use this template.')}
      </RequestRow>)}
      {badgeRoutes.map((route) => <div key={route.route_uuid} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm">From <b>{route.badge.owner_org?.name || 'another org'}</b>: <Link className="font-semibold underline-offset-2 hover:underline" href={getUriWithOrg(orgslug, routePaths.org.admin.templatePage(route.template.template_uuid, 'overview'))}>{route.template.title}</Link>
          <p className="text-xs text-gray-500">Earns {route.badge.name} · {route.assignments.length} assignment{route.assignments.length === 1 ? '' : 's'}</p></div>
      </div>)}
    </Section>
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Badges you issue for their creators</h3>
      <IssuingAuthorizationsPanel orgId={orgId} statuses={['approved']} />
    </div>
    <Section title="Orgs using yours" count={running.length} empty="No other org uses your templates or badges yet.">
      {running.map((row) => <RequestRow key={row.key} row={row} lead={<><b>{row.org?.name || 'An organization'}</b> {row.kind === 'badge' ? 'issues' : 'uses'} </>}>
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
      <p className="text-xs text-gray-500">{row.detail}{row.message ? ` · “${row.message}”` : ''}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
}
