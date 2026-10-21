'use client'

import React from 'react'
import Link from 'next/link'
import { Check, Handshake, Loader2, Plus, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import IssuerRouteOffers from '@components/Learning/IssuerRouteOffers'
import { AccessChip } from '@components/Learning/PlanAccessList'
import { Button } from '@components/ui/button'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createIssuerLearnerLink,
  decideIssuerLearnerRequest,
  deleteIssuerLearnerLink,
  getIssuedBadges,
  getIssuerLearnerLinks,
  templateMarketplaceApi,
  type BadgePlanOption,
  type IssuedBadge,
  type RunPlan,
} from '@services/learning/marketplace'

// Badge issuing in the marketplace. Permission to issue a badge is approval on one of its plans:
// an organization asks for a specific plan (Browse), and stops by leaving it (Requests › Badges you issue).

export const statusStyles: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-lime-100 text-lime-800',
  rejected: 'bg-red-100 text-red-700',
  revoked: 'bg-gray-200 text-gray-600',
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

const learnerName = (link: any) => link.user ? ([link.user.first_name, link.user.last_name].filter(Boolean).join(' ') || link.user.username || link.user.email) : `User ${link.user_id}`

/** A marketplace badge's plans: ask to run one (and so to issue the badge through it). Staff see where things stand; admins ask. */
export function BadgeMarketplaceActions({ item, orgId, admin, onChange }: { item: any; orgId: number; admin: boolean; onChange: () => void }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [acting, setActing] = React.useState('')
  const plans: BadgePlanOption[] = item.plans || []

  const ask = async (plan: BadgePlanOption) => {
    setActing(plan.template_uuid)
    try {
      const result = await templateMarketplaceApi.request({ template_uuid: plan.template_uuid, issuer_org_id: orgId }, accessToken)
      toast.success(result.status === 'approved' ? `Approved: you issue ${item.badge.name} through ${plan.title}.` : `Asked ${item.creator_org?.name || 'the creator'} to run ${plan.title}.`)
      onChange()
    } catch (error: any) {
      toast.error(error?.message || 'Could not send the request.')
    } finally {
      setActing('')
    }
  }

  if (item.is_own_badge) return <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">Your badge</span>
  if (!plans.length) return <span className="text-xs text-gray-500">No plan earns it yet</span>
  return <div className="w-full space-y-1.5" data-testid="badge-plan-options">
    <p className="text-xs font-semibold text-gray-600">{item.issuing ? 'You issue this badge. Its plans:' : 'Pick a plan to run; approval lets you issue the badge through it.'}</p>
    {plans.map((plan) => {
      const status = plan.authorization?.status
      return <div key={plan.route_uuid} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate">{plan.title}{plan.recommended ? <Star className="ml-1 inline h-3 w-3 text-amber-500" aria-label="Recommended" /> : null}</span>
        {status === 'approved' || status === 'requested' ? <StatusPill status={status} />
          : admin ? <Button size="sm" variant="outline" onClick={() => void ask(plan)} disabled={Boolean(acting)} className="h-7 gap-1 bg-card px-2.5 text-xs">
            {acting === plan.template_uuid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {status ? 'Ask again' : 'Ask to run'}
          </Button> : status ? <StatusPill status={status} /> : null}
      </div>
    })}
  </div>
}

/** Other organizations' badges this one issues: the plans it runs for each (leave one to stop), routes offered, supported learners and their requests. */
export function IssuedBadgesPanel({ orgId }: { orgId: number }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const orgslug = (useOrg() as { slug?: string } | null)?.slug || ''
  const [badges, setBadges] = React.useState<IssuedBadge[]>([])
  const [links, setLinks] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actingOn, setActingOn] = React.useState('')
  const [linkDrafts, setLinkDrafts] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [issued, linkResponse] = await Promise.all([getIssuedBadges(orgId, accessToken), getIssuerLearnerLinks(orgId, accessToken)])
      const linkData = linkResponse?.success ? linkResponse.data : linkResponse
      setBadges(Array.isArray(issued) ? issued : [])
      setLinks(Array.isArray(linkData) ? linkData : [])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load the badges you issue.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, orgId])

  React.useEffect(() => {
    void load()
  }, [load])

  const act = async (key: string, action: () => Promise<any>, done: string, fail: string) => {
    setActingOn(key)
    try {
      await action()
      toast.success(done)
      await load()
    } catch (error: any) {
      toast.error(error?.message || fail)
    } finally {
      setActingOn('')
    }
  }

  const leave = (item: IssuedBadge, plan: RunPlan) => {
    if (!plan.authorization_uuid) return
    if (!confirm(`Leave “${plan.title}”? Your organization stops issuing ${item.badge.name} through it. Credentials already issued stay valid.`)) return
    void act(plan.authorization_uuid, () => templateMarketplaceApi.revoke(plan.authorization_uuid!, accessToken), 'You left the plan.', 'Could not leave the plan.')
  }

  const addLink = (badgeUuid: string) => {
    const draft = (linkDrafts[badgeUuid] || '').trim()
    const userId = Number(draft)
    if (!draft || Number.isNaN(userId)) {
      toast.error('Enter the learner\'s user ID.')
      return
    }
    void act(badgeUuid, async () => {
      await createIssuerLearnerLink({ badge_uuid: badgeUuid, issuer_org_id: orgId, user_id: userId }, accessToken)
      setLinkDrafts((current) => ({ ...current, [badgeUuid]: '' }))
    }, 'Learner added.', 'Failed to add learner.')
  }

  const requests = links.filter((link) => link.status === 'requested')
  return (
    <section className="rounded-xl bg-card p-4 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Badges you issue</h2>
          <p className="mt-1 text-sm text-muted-foreground">Other organizations’ badges you issue through plans they approved you on.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 bg-card">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {requests.length ? (
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-800">Learner requests</p>
          <div className="mt-3 space-y-2">
            {requests.map((link) => (
              <div key={link.link_uuid} className="flex flex-col gap-3 rounded-lg bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-bold text-foreground">{learnerName(link)}</p><p className="text-xs text-muted-foreground">{link.badge?.name || 'Badge'}{link.message ? ` · ${link.message}` : ''}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void act(link.link_uuid, () => decideIssuerLearnerRequest(link.link_uuid, 'reject', {}, accessToken), 'Request declined.', 'Failed to update learner request.')} disabled={actingOn === link.link_uuid}>Decline</Button>
                  <Button size="sm" onClick={() => void act(link.link_uuid, () => decideIssuerLearnerRequest(link.link_uuid, 'accept', {}, accessToken), 'Learner accepted and assigned to you.', 'Failed to update learner request.')} disabled={actingOn === link.link_uuid}><Check className="mr-1 h-4 w-4" /> Accept</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : badges.length ? badges.map((item) => {
          const badgeUuid = item.badge.badge_uuid
          const supported = links.filter((link) => link.badge?.badge_uuid === badgeUuid && link.status === 'accepted')
          return (
            <article key={badgeUuid} className="rounded-xl border border-border p-4" data-testid="issued-badge">
              <p className="text-sm font-bold text-foreground">{item.badge.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">by {item.creator_org?.name || 'Unknown organization'}</p>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {item.plans.map((plan) => <li key={plan.route_uuid} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Link className="min-w-0 flex-1 truncate font-semibold hover:underline" href={getUriWithOrg(orgslug, routePaths.org.admin.templatePage(plan.template_uuid, 'settings'))}>{plan.title}</Link>
                  <AccessChip access={plan.access} />
                  {plan.authorization_uuid ? <Button size="sm" variant="outline" onClick={() => leave(item, plan)} disabled={actingOn === plan.authorization_uuid} className="h-7 bg-card px-2.5 text-xs text-red-700">Leave plan</Button> : null}
                </li>)}
              </ul>
              <div className="mt-4 rounded-lg bg-muted p-4">
                <IssuerRouteOffers badgeUuid={badgeUuid} issuerOrgId={orgId} />
                <p className="text-xs font-bold uppercase text-muted-foreground">Supported learners ({supported.length})</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {supported.map((link) => (
                    <span key={link.link_uuid} className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-xs">
                      {learnerName(link)}
                      <button type="button" onClick={() => void act(link.link_uuid, () => deleteIssuerLearnerLink(link.link_uuid, accessToken), 'Learner removed.', 'Failed to remove learner.')} disabled={actingOn === link.link_uuid} className="text-muted-foreground hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={linkDrafts[badgeUuid] || ''}
                    onChange={(event) => setLinkDrafts((current) => ({ ...current, [badgeUuid]: event.target.value }))}
                    placeholder="Learner user ID"
                    className="h-9 w-48 rounded-lg border border-border px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-black"
                  />
                  <Button size="sm" variant="outline" onClick={() => addLink(badgeUuid)} disabled={actingOn === badgeUuid} className="gap-1 bg-card"><Plus className="h-4 w-4" /> Add learner</Button>
                </div>
              </div>
            </article>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <p className="text-sm font-semibold text-muted-foreground">You don’t issue other organizations’ badges yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Browse the marketplace and ask to run one of a badge’s plans.</p>
          </div>
        )}
      </div>
    </section>
  )
}
