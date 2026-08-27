'use client'

import React from 'react'
import { Award, Check, ClipboardCheck, Handshake, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { ActivityAggregateGradeForm } from '@components/Admin/Programs/CohortProgramAdmin'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getLearningResponses, gradeLearningResponse } from '@services/learning/learning'
import {
  acceptIssuerInvite,
  browseMarketplaceBadges,
  createIssuerLearnerLink,
  decideIssuerLearnerRequest,
  deleteIssuerLearnerLink,
  getIssuerAuthorizations,
  getIssuerLearnerLinks,
  requestIssuerAuthorization,
  revokeIssuerAuthorization,
  updateIssuerAuthorization,
} from '@services/learning/marketplace'
import AdminBadgesHome from '@components/Learning/AdminBadgesHome'
import { BADGE_ADMIN_PAGES } from '@components/Admin/adminFeaturePages'

const statusStyles: Record<string, string> = {
  queued: 'bg-violet-100 text-violet-800',
  requested: 'bg-amber-100 text-amber-800',
  invited: 'bg-blue-100 text-blue-800',
  approved: 'bg-lime-100 text-lime-800',
  rejected: 'bg-red-100 text-red-700',
  revoked: 'bg-gray-200 text-gray-600',
  package_denied: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  queued: 'Waiting for package approval',
  package_denied: 'Package request denied',
}

type BadgeAdminTab = 'collections' | 'marketplace'

export default function IssuingAdminShell({
  orgId,
  orgslug,
  collections,
  initialTab = 'collections',
}: {
  orgId: number
  orgslug: string
  collections: any[]
  initialTab?: BadgeAdminTab
}) {
  const [activeTab, setActiveTab] = React.useState<BadgeAdminTab>(initialTab)

  const selectTab = (tab: BadgeAdminTab) => {
    setActiveTab(tab)
    const url = tab === 'collections' ? '/admin/badges' : `/admin/badges?tab=${tab}`
    window.history.replaceState(null, '', url)
  }

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <AdminFeatureHeader
        feature="Badges"
        activeTab={activeTab}
        tabs={BADGE_ADMIN_PAGES.map((tab) => {
          const Icon = tab.icon
          return {
            id: tab.id,
            label: tab.label,
            icon: <Icon size={16} />,
            onClick: () => selectTab(tab.id as BadgeAdminTab),
          }
        })}
      />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }} className="overflow-x-hidden">
        {activeTab === 'collections' ? <AdminBadgesHome orgslug={orgslug} orgId={orgId} collections={collections} /> : null}
        {activeTab === 'marketplace' ? <MarketplaceBrowsePanel orgId={orgId} /> : null}
      </motion.div>
    </div>
  )
}

function MarketplaceBrowsePanel({ orgId }: { orgId: number }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [items, setItems] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [actingOn, setActingOn] = React.useState('')

  const load = React.useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const response = await browseMarketplaceBadges(orgId, q, accessToken)
      const data = response?.success ? response.data : response
      setItems(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load the marketplace.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, orgId])

  React.useEffect(() => {
    void load()
  }, [load])

  const request = async (item: any) => {
    setActingOn(item.badge.badge_uuid)
    try {
      const authorization = await requestIssuerAuthorization({ badge_uuid: item.badge.badge_uuid, issuer_org_id: orgId }, accessToken)
      toast.success(
        authorization?.status === 'queued'
          ? 'Request queued. We’ll send it when your issuing package is approved.'
          : 'Authorization requested.'
      )
      await load(query)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to request authorization.')
    } finally {
      setActingOn('')
    }
  }

  const accept = async (item: any) => {
    setActingOn(item.badge.badge_uuid)
    try {
      await acceptIssuerInvite(item.authorization.authorization_uuid, accessToken)
      toast.success('Invite accepted — your organization can now issue this badge.')
      await load(query)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to accept invite.')
    } finally {
      setActingOn('')
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Badge marketplace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Badges other organizations have published for external issuing.</p>
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void load(query)
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search badges"
              className="h-10 w-64 rounded-lg border border-border px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-black"
            />
            <Button type="submit" variant="outline" disabled={loading} className="gap-2 bg-card">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </form>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length ? items.map((item) => {
            const authorization = item.authorization
            const badge = item.badge
            const canRequest = item.issuing_access === 'active' || item.issuing_access === 'pending'
            const requestLabel = item.issuing_access === 'pending' ? 'Queue request' : 'Request to issue'
            return (
              <article key={badge.badge_uuid} className="flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {badge.thumbnail_image ? (
                      <SafeImage src={badge.thumbnail_image} alt={badge.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lime-500"><Award size={24} strokeWidth={1.5} /></div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{badge.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      by {item.creator_org?.name || 'Unknown organization'}
                      {badge.description ? ` · ${badge.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.is_own_badge ? (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">Your badge</span>
                  ) : authorization ? (
                    <>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[authorization.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[authorization.status] || authorization.status}
                      </span>
                      {authorization.status === 'invited' ? (
                        <Button size="sm" onClick={() => void accept(item)} disabled={actingOn === badge.badge_uuid} className="gap-1">
                          <Check className="h-4 w-4" /> Accept invite
                        </Button>
                      ) : null}
                      {authorization.status === 'rejected' || authorization.status === 'revoked' || authorization.status === 'package_denied' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void request(item)}
                          disabled={!canRequest || actingOn === badge.badge_uuid}
                          title={canRequest ? undefined : 'Request the Badge Issuing package to continue'}
                          className="gap-1 bg-card"
                        >
                          <Plus className="h-4 w-4" /> {item.issuing_access === 'pending' ? 'Queue again' : 'Request again'}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void request(item)}
                      disabled={!canRequest || actingOn === badge.badge_uuid}
                      title={canRequest ? undefined : 'Request the Badge Issuing package to continue'}
                      className="gap-1"
                    >
                      {actingOn === badge.badge_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {canRequest ? requestLabel : 'Issuing package required'}
                    </Button>
                  )}
                </div>
              </article>
            )
          }) : (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No marketplace badges found</p>
              <p className="mt-1 text-xs text-muted-foreground">Badges published by other organizations will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function IssuingAuthorizationsPanel({ orgId }: { orgId: number }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [authorizations, setAuthorizations] = React.useState<any[]>([])
  const [links, setLinks] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actingOn, setActingOn] = React.useState('')
  const [linkDrafts, setLinkDrafts] = React.useState<Record<string, string>>({})

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

  const toggleOpenToAll = async (authorization: any, value: boolean) => {
    setActingOn(authorization.authorization_uuid)
    try {
      await updateIssuerAuthorization(authorization.authorization_uuid, { open_to_all: value }, accessToken)
      toast.success(value ? 'Now open to all learners.' : 'Restricted to invited learners.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update authorization.')
    } finally {
      setActingOn('')
    }
  }

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
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-card p-6 shadow-xs">
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
          ) : authorizations.length ? authorizations.map((authorization) => {
            const authorizationLinks = links.filter((link) => link.authorization_id === authorization.id && link.status === 'accepted')
            return (
              <article key={authorization.authorization_uuid} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{authorization.badge?.name || 'Badge'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">by {authorization.creator_org?.name || 'Unknown organization'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[authorization.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[authorization.status] || authorization.status}
                    </span>
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
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">Open to all learners</p>
                        <p className="mt-1 text-xs text-muted-foreground">When off, only learners you add below can pick your organization for this badge.</p>
                      </div>
                      <Switch checked={authorization.open_to_all === true} disabled={actingOn === authorization.authorization_uuid} onCheckedChange={(value) => void toggleOpenToAll(authorization, value)} />
                    </div>

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

export function OrgGradingQueuePanel({ orgId }: { orgId: number }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [responses, setResponses] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState('')
  const [active, setActive] = React.useState<any>(null)
  const [feedback, setFeedback] = React.useState('')
  const [questionScores, setQuestionScores] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getLearningResponses({ org_id: orgId, grading_status: 'all' }, accessToken)
      setResponses(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load responses.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, orgId])

  React.useEffect(() => {
    void load()
  }, [load])

  const reviewGroups = React.useMemo(() => buildOrgReviewGroups(responses), [responses])
  const openReview = (review: any) => {
    const next: Record<string, string> = {}
    ;(review.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: any) => { if (result?.grading_status === 'pending') next[`${attempt.attempt_uuid}:${id}`] = '' }))
    setQuestionScores(next)
    setFeedback('')
    setActive(review)
  }
  const saveGrade = async (questionFeedback: Record<string, string>) => {
    if (!active || Object.values(questionScores).some((value) => value === '')) return
    setSaving(active.review_id)
    try {
      await Promise.all((active.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => {
        const scores = Object.fromEntries(Object.entries(questionScores).filter(([key]) => key.startsWith(`${attempt.attempt_uuid}:`)).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), Number(value)]))
        const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: any) => sum + (result.grading_status === 'pending' ? Number(scores[id] || 0) : Number(result.score || 0)), 0)
        const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([key, value]) => key.startsWith(`${attempt.attempt_uuid}:`) && value.trim()).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), value.trim()]))
        return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: scores, question_feedback: notes, feedback }, accessToken)
      }))
      toast.success('Activity graded.')
      await load()
      setActive(null)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save grade.')
    } finally {
      setSaving('')
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Grading queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pending submissions your organization is responsible for grading — including badges you issue for other creators.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 bg-card">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : reviewGroups.length ? reviewGroups.map((review) => {
            const learner = review.user
              ? [review.user.first_name, review.user.last_name].filter(Boolean).join(' ') || review.user.username || review.user.email
              : 'Guest learner'
            return <button key={review.review_id} type="button" onClick={() => openReview(review)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-4 text-left transition hover:border-blue-300"><div><p className="text-sm font-bold text-foreground">{review.badge?.name ? `${review.badge.name} · ` : ''}{review.activity?.title || 'Activity submission'}</p><p className="mt-1 text-xs text-muted-foreground">{learner} · {new Date(review.submitted_at).toLocaleString()}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{review.pending_question_count} to grade</span></button>
          }) : (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No pending responses</p>
              <p className="mt-1 text-xs text-muted-foreground">Submissions from learners working with your organization will appear here.</p>
            </div>
          )}
        </div>
      </section>
      <Modal isDialogOpen={Boolean(active)} onOpenChange={(open) => !open && setActive(null)} minWidth="lg" dialogTitle={active?.activity?.title || 'Grade activity'} dialogDescription={active?.badge?.name || ''} dialogContent={active ? <ActivityAggregateGradeForm review={active} scores={questionScores} setScores={setQuestionScores} feedback={feedback} setFeedback={setFeedback} saving={saving === active.review_id} onConfirm={(notes: Record<string, string>) => void saveGrade(notes)} /> : <div />} />
    </div>
  )
}

function buildOrgReviewGroups(responses: any[]) {
  const groups = new Map<string, any[]>()
  for (const response of responses) {
    const key = `${response.run?.run_uuid || response.run_id}:${response.activity?.id || response.page?.activity_id}`
    groups.set(key, [...(groups.get(key) || []), response])
  }
  return Array.from(groups.entries()).flatMap(([key, history]) => {
    history.sort((left, right) => new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime())
    const latestByPage = new Map<number, any>()
    for (const attempt of history) latestByPage.set(attempt.page_id, attempt)
    const latest = Array.from(latestByPage.values())
    const pending = latest.filter((attempt) => attempt.result?.grading_status === 'pending')
    if (!pending.length) return []
    const pendingQuestions = pending.flatMap((attempt) => Object.values(attempt.result?.questions || {}).filter((result: any) => result?.grading_status === 'pending')) as any[]
    const autoScore = latest.reduce((sum, attempt) => sum + (attempt.result?.grading_status === 'graded' ? Number(attempt.score || 0) : Object.values(attempt.result?.questions || {}).reduce((questionSum: number, result: any) => questionSum + (result?.grading_status === 'graded' ? Number(result.score || 0) : 0), 0)), 0)
    const maxScore = latest.reduce((sum, attempt) => sum + Number(attempt.result?.max_score || 0), 0)
    const pendingMax = pendingQuestions.reduce((sum, result) => sum + Number(result.max_score ?? result.points ?? 0), 0)
    const current = latest[0]
    return [{ review_id: key, attempts: latest, attempt_history: history, auto_score: autoScore, max_score: maxScore, pending_max_score: pendingMax, pending_question_count: pendingQuestions.length, minimum_score_percent: Number(current.activity?.settings?.grading?.minimum_score_percent ?? 70), submitted_at: pending.reduce((value, item) => new Date(item.submitted_at).getTime() > new Date(value).getTime() ? item.submitted_at : value, pending[0].submitted_at), user: current.user, badge: current.badge, activity: current.activity }]
  })
}
