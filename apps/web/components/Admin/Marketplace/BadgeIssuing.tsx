'use client'

import React from 'react'
import { Check, Handshake, Loader2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import IssuerRouteOffers from '@components/Learning/IssuerRouteOffers'
import { Button } from '@components/ui/button'
import PlanAccessList from '@components/Learning/PlanAccessList'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  acceptIssuerInvite,
  createIssuerLearnerLink,
  decideIssuerLearnerRequest,
  deleteIssuerLearnerLink,
  getIssuerAuthorizations,
  getIssuerLearnerLinks,
  requestIssuerAuthorization,
  revokeIssuerAuthorization,
} from '@services/learning/marketplace'

// Badge issuing in the marketplace: the request flow on a badge card (Browse), and the badges this
// organization issues for their creators (Requests › Added from other orgs). Moved here from the
// Badges page's old marketplace tabs (IssuingAdminShell).

export const statusStyles: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  invited: 'bg-blue-100 text-blue-800',
  approved: 'bg-lime-100 text-lime-800',
  rejected: 'bg-red-100 text-red-700',
  revoked: 'bg-gray-200 text-gray-600',
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

/** A marketplace badge's request flow: request to issue, accept an invite, or ask again. Admins only. */
export function BadgeMarketplaceActions({ item, orgId, onChange }: { item: any; orgId: number; onChange: () => void }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [acting, setActing] = React.useState(false)
  const badge = item.badge
  const authorization = item.authorization

  const request = async () => {
    setActing(true)
    try {
      await requestIssuerAuthorization({ badge_uuid: badge.badge_uuid, issuer_org_id: orgId }, accessToken)
      toast.success('Authorization requested.')
      onChange()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to request authorization.')
    } finally {
      setActing(false)
    }
  }

  const accept = async () => {
    setActing(true)
    try {
      await acceptIssuerInvite(authorization.authorization_uuid, accessToken)
      toast.success('Invite accepted — your organization can now issue this badge.')
      onChange()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to accept invite.')
    } finally {
      setActing(false)
    }
  }

  if (item.is_own_badge) return <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">Your badge</span>
  if (authorization) {
    return <div className="flex flex-wrap items-center justify-end gap-2">
      <StatusPill status={authorization.status} />
      {authorization.status === 'invited' ? <Button size="sm" onClick={() => void accept()} disabled={acting} className="gap-1"><Check className="h-4 w-4" /> Accept invite</Button> : null}
      {authorization.status === 'rejected' || authorization.status === 'revoked' ? (
        <Button size="sm" variant="outline" onClick={() => void request()} disabled={acting} className="gap-1 bg-card">
          <Plus className="h-4 w-4" /> Request again
        </Button>
      ) : null}
    </div>
  }
  return <Button size="sm" onClick={() => void request()} disabled={acting} className="gap-1">
    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
    Request to issue
  </Button>
}

/** The badges this organization issues for their creators: learner access, routes offered, supported learners, learner requests. */
export function IssuingAuthorizationsPanel({ orgId, statuses }: { orgId: number; statuses?: string[] }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [authorizations, setAuthorizations] = React.useState<any[]>([])
  const [links, setLinks] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actingOn, setActingOn] = React.useState('')
  const [linkDrafts, setLinkDrafts] = React.useState<Record<string, string>>({})
  const shown = statuses ? authorizations.filter((authorization) => statuses.includes(authorization.status)) : authorizations

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [authResponse, linkResponse] = await Promise.all([
        getIssuerAuthorizations(orgId, 'issuer', accessToken),
        getIssuerLearnerLinks(orgId, accessToken),
      ])
      const authData = authResponse?.success ? authResponse.data : authResponse
      const linkData = linkResponse?.success ? linkResponse.data : linkResponse
      setAuthorizations(Array.isArray(authData) ? authData : [])
      setLinks(Array.isArray(linkData) ? linkData : [])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load issuing authorizations.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, orgId])

  React.useEffect(() => {
    void load()
  }, [load])

  // Who can start is set on each plan the organization runs (Plans › template › Settings).
  const orgslug = (useOrg() as { slug?: string } | null)?.slug || ''

  const act = async (authorization: any, action: 'accept' | 'revoke') => {
    setActingOn(authorization.authorization_uuid)
    try {
      if (action === 'accept') await acceptIssuerInvite(authorization.authorization_uuid, accessToken)
      if (action === 'revoke') await revokeIssuerAuthorization(authorization.authorization_uuid, accessToken)
      toast.success('Authorization updated.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update authorization.')
    } finally {
      setActingOn('')
    }
  }

  const addLink = async (authorization: any) => {
    const draft = (linkDrafts[authorization.authorization_uuid] || '').trim()
    const userId = Number(draft)
    if (!draft || Number.isNaN(userId)) {
      toast.error('Enter the learner\'s user ID.')
      return
    }
    setActingOn(authorization.authorization_uuid)
    try {
      await createIssuerLearnerLink({ badge_uuid: authorization.badge?.badge_uuid, issuer_org_id: orgId, user_id: userId }, accessToken)
      toast.success('Learner added.')
      setLinkDrafts((current) => ({ ...current, [authorization.authorization_uuid]: '' }))
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add learner.')
    } finally {
      setActingOn('')
    }
  }

  const removeLink = async (link: any) => {
    setActingOn(link.link_uuid)
    try {
      await deleteIssuerLearnerLink(link.link_uuid, accessToken)
      toast.success('Learner removed.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove learner.')
    } finally {
      setActingOn('')
    }
  }

  const decideRequest = async (link: any, decision: 'accept' | 'reject') => {
    setActingOn(link.link_uuid)
    try {
      await decideIssuerLearnerRequest(link.link_uuid, decision, {}, accessToken)
      toast.success(decision === 'accept' ? 'Learner accepted and assigned to you.' : 'Request declined.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update learner request.')
    } finally {
      setActingOn('')
    }
  }

  return (
    <div>
      <section className="rounded-xl bg-card p-4 shadow-xs sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Your issuing authorizations</h2>
            <p className="mt-1 text-sm text-muted-foreground">Badges your organization can deliver, grade, and issue.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 bg-card">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {links.some((link) => link.status === 'requested') ? (
          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-blue-800">Learner requests</p>
            <div className="mt-3 space-y-2">
              {links.filter((link) => link.status === 'requested').map((link) => (
                <div key={link.link_uuid} className="flex flex-col gap-3 rounded-lg bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-bold text-foreground">{link.user ? ([link.user.first_name, link.user.last_name].filter(Boolean).join(' ') || link.user.username || link.user.email) : `User ${link.user_id}`}</p><p className="text-xs text-muted-foreground">{link.badge?.name || 'Badge'}{link.message ? ` · ${link.message}` : ''}</p></div>
                  <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void decideRequest(link, 'reject')} disabled={actingOn === link.link_uuid}>Decline</Button><Button size="sm" onClick={() => void decideRequest(link, 'accept')} disabled={actingOn === link.link_uuid}><Check className="mr-1 h-4 w-4" /> Accept</Button></div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : shown.length ? shown.map((authorization) => {
            const authorizationLinks = links.filter((link) => link.authorization_id === authorization.id && link.status === 'accepted')
            return (
              <article key={authorization.authorization_uuid} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{authorization.badge?.name || 'Badge'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">by {authorization.creator_org?.name || 'Unknown organization'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={authorization.status} />
                    {authorization.status === 'invited' ? (
                      <Button size="sm" onClick={() => void act(authorization, 'accept')} disabled={actingOn === authorization.authorization_uuid} className="gap-1">
                        <Check className="h-4 w-4" /> Accept
                      </Button>
                    ) : null}
                    {authorization.status === 'approved' ? (
                      <Button size="sm" variant="outline" onClick={() => void act(authorization, 'revoke')} disabled={actingOn === authorization.authorization_uuid} className="gap-1 bg-card text-red-700">
                        <Trash2 className="h-4 w-4" /> End
                      </Button>
                    ) : null}
                    {authorization.status === 'queued' ? (
                      <Button size="sm" variant="outline" onClick={() => void act(authorization, 'revoke')} disabled={actingOn === authorization.authorization_uuid} className="gap-1 bg-card text-red-700">
                        <Trash2 className="h-4 w-4" /> Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>

                {authorization.status === 'queued' ? (
                  <div className="mt-4 rounded-lg bg-violet-50 p-4 text-sm text-violet-900">
                    <p className="font-bold">Request queued</p>
                    <p className="mt-1 text-xs text-violet-700">We’ll send this authorization request automatically when your issuing package is approved.</p>
                  </div>
                ) : null}
                {authorization.status === 'package_denied' ? (
                  <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900">
                    <p className="font-bold">Issuing package request denied</p>
                    <p className="mt-1 text-xs text-red-700">This authorization request was not sent to the badge creator.</p>
                  </div>
                ) : null}

                {authorization.status === 'approved' ? (
                  <div className="mt-4 rounded-lg bg-muted p-4">
                    <PlanAccessList plans={authorization.plans || []} orgslug={orgslug} /><IssuerRouteOffers badgeUuid={authorization.badge?.badge_uuid} issuerOrgId={orgId} />

                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase text-muted-foreground">Supported learners ({authorizationLinks.length})</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {authorizationLinks.map((link) => (
                          <span key={link.link_uuid} className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-xs">
                            {link.user ? ([link.user.first_name, link.user.last_name].filter(Boolean).join(' ') || link.user.username || link.user.email) : `User ${link.user_id}`}
                            <button type="button" onClick={() => void removeLink(link)} disabled={actingOn === link.link_uuid} className="text-muted-foreground hover:text-red-600">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          value={linkDrafts[authorization.authorization_uuid] || ''}
                          onChange={(event) => setLinkDrafts((current) => ({ ...current, [authorization.authorization_uuid]: event.target.value }))}
                          placeholder="Learner user ID"
                          className="h-9 w-48 rounded-lg border border-border px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-black"
                        />
                        <Button size="sm" variant="outline" onClick={() => void addLink(authorization)} disabled={actingOn === authorization.authorization_uuid} className="gap-1 bg-card">
                          <Plus className="h-4 w-4" /> Add learner
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          }) : (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No issuing authorizations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Browse the marketplace and request authorization to issue a badge.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
