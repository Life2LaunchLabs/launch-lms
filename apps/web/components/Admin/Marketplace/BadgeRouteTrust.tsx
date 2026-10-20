'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Handshake, X } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import { getIssuerAuthorizations, type MarketplaceOrg } from '@services/learning/marketplace'

type Route = { route_uuid: string; name: string; trusted_only?: boolean; partners?: MarketplaceOrg[] }

/**
 * Under a badge's ways to earn it: which routes only trusted partners may run (say, a direct
 * issuance plan that shortcuts the activities), and which issuers are approved for each. Other
 * routes stay open to every organization authorized to issue the badge. Owners edit; others read.
 */
type Props = {
  badge: { badge_uuid: string; org_id: number }
  routes: Route[]
  // eslint-disable-next-line no-unused-vars
  onSaved: (next: any) => void
}

export default function BadgeRouteTrust({ badge, routes, onSaved }: Props) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const org = useOrg() as { id?: number } | null
  const owner = Number(org?.id) === Number(badge.org_id)
  const { data: issuers = [] } = useSWR(owner && token ? ['marketplace', 'badge-issuers', badge.badge_uuid, token] : null, async () => {
    const response: any = await getIssuerAuthorizations(badge.org_id, 'creator', token, badge.badge_uuid, 'approved')
    const data = response?.success ? response.data : []
    return (Array.isArray(data) ? data : []).map((item: any) => item.issuer_org).filter(Boolean) as MarketplaceOrg[]
  })
  const [saving, setSaving] = React.useState('')
  if (!routes.length) return null
  const save = async (route: Route, trustedOnly: boolean, partnerIds: number[]) => {
    setSaving(route.route_uuid)
    try { onSaved(await badgeRoutesApi.setTrust(badge.badge_uuid, route.route_uuid, trustedOnly, partnerIds, token)) } catch (error: any) { toast.error(error?.message || 'Could not save who may run this route.') } finally { setSaving('') }
  }
  return <div className="mt-6 border-t border-border pt-5" data-testid="badge-route-trust">
    <h3 className="flex items-center gap-2 text-sm font-bold"><Handshake size={16} />Trusted partners</h3>
    <p className="mt-1 max-w-xl text-xs text-muted-foreground">Make a way to earn it trusted-partners only, for example a direct issuance plan that skips the activities. Only the issuers you approve here can run it; the other routes stay open to every authorized issuer.</p>
    <div className="mt-3 space-y-2">
      {routes.map((route) => {
        const partners = route.partners || []
        const partnerIds = partners.map((partner) => partner.id)
        const candidates = issuers.filter((issuer) => !partnerIds.includes(issuer.id))
        const busy = saving === route.route_uuid
        return <div key={route.route_uuid} className="rounded-lg border border-border p-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 font-semibold">{route.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              Trusted partners only
              <input type="checkbox" role="switch" checked={Boolean(route.trusted_only)} disabled={!owner || busy} onChange={(event) => void save(route, event.target.checked, partnerIds)} aria-label={`Only trusted partners run ${route.name}`} className="h-4 w-4" />
            </span>
          </label>
          {route.trusted_only ? <div className="mt-2 flex flex-wrap items-center gap-2">
            {partners.map((partner) => <span key={partner.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
              {partner.name}
              {owner ? <button type="button" disabled={busy} onClick={() => void save(route, true, partnerIds.filter((id) => id !== partner.id))} aria-label={`Remove ${partner.name}`} className="text-muted-foreground hover:text-red-600"><X size={12} /></button> : null}
            </span>)}
            {!partners.length ? <span className="text-xs text-muted-foreground">No partners yet: only you run this route.</span> : null}
            {owner && candidates.length ? <select value="" disabled={busy} onChange={(event) => event.target.value && void save(route, true, [...partnerIds, Number(event.target.value)])} aria-label={`Approve a partner for ${route.name}`} className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="">Approve a partner…</option>
              {candidates.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}
            </select> : null}
          </div> : null}
        </div>
      })}
    </div>
  </div>
}
