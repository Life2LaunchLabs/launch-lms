'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, Award, BarChart3, Check, ClipboardCheck, Eye, GalleryVerticalEnd, Handshake, Image as ImageIcon, Loader2, Megaphone, Pencil, Plus, Settings, Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { deleteLearningBadge, getLearningResponses, gradeLearningResponse, updateLearningBadge } from '@services/learning/learning'
import { approveIssuerAuthorization, getIssuerAuthorizations, inviteIssuerOrg, rejectIssuerAuthorization, revokeIssuerAuthorization } from '@services/learning/marketplace'
import CertificatePreview from '@components/Learning/BadgeCertificatePreview'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import BadgeVersionToolbar from '@components/Learning/BadgeVersionToolbar'

const tabs = [
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'learning-path', label: 'Learning Path', icon: GalleryVerticalEnd },
  { key: 'definition', label: 'Definition', icon: Award },
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'issuers', label: 'Issuers', icon: Handshake },
  { key: 'settings', label: 'Settings', icon: Settings },
]

function cleanBadgeId(value: string) {
  return String(value || '').replace(/^badge_/, '')
}

export default function AdminBadgeShell({
  orgslug,
  badge: initialBadge,
  activeSubpage,
  children,
}: {
  orgslug: string
  badge: any
  activeSubpage: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const org = useOrg() as any
  const canEdit = Number(org?.id) === Number(initialBadge.org_id)
  const [badge, setBadge] = React.useState(initialBadge)
  const [editingField, setEditingField] = React.useState<'name' | null>(null)
  const [draftName, setDraftName] = React.useState(initialBadge.name || '')
  const [savingField, setSavingField] = React.useState<'name' | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const normalizedSubpage = getActiveSubpage(activeSubpage)

  React.useEffect(() => {
    setBadge(initialBadge)
    setDraftName(initialBadge.name || '')
    setEditingField(null)
  }, [initialBadge])

  const patchBadge = async (patch: Record<string, any>, successMessage?: string) => {
    const nextBadge = await updateLearningBadge(badge.badge_uuid, patch, accessToken, badge.selected_version?.version_uuid)
    setBadge(nextBadge)
    if (successMessage) toast.success(successMessage)
    return nextBadge
  }

  const saveName = async () => {
    if (savingField) return
    const value = draftName.trim()
    if (value.length < 3) {
      toast.error('Badge title must be at least 3 characters.')
      return
    }
    setSavingField('name')
    try {
      await patchBadge({ name: value }, 'Title updated.')
      setEditingField(null)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update badge.')
    } finally {
      setSavingField(null)
    }
  }

  const handleThumbnailSelect = async (url: string) => {
    setIsUploading(true)
    try {
      const nextBadge = await patchBadge({ thumbnail_image: url }, 'Thumbnail image updated.')
      setBadge(nextBadge)
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update image.')
    } finally {
      setIsUploading(false)
    }
  }

  const publicBadgeHref = getUriWithOrg(orgslug, `/badges/${cleanBadgeId(badge.badge_uuid)}`)
  const imageUrl = badge.thumbnail_image
  const isDraft = badge.selected_version?.state === 'draft'

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 text-sm tracking-tight nice-shadow">
        <div className="pb-4 pt-6">
          <Breadcrumbs items={[
            { label: 'Badges', href: '/admin/badges' },
            { label: badge.name },
          ]} />
        </div>

        <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
          <div className="group relative mx-auto h-40 w-40 shrink-0 overflow-visible md:mx-0 md:h-44 md:w-44">
            {imageUrl ? (
              <BadgeThumbnailImage src={imageUrl} alt={`${badge.name} badge`} imageClassName={isUploading ? 'animate-pulse' : ''} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-lime-500">
                <Award size={42} strokeWidth={1.5} />
              </div>
            )}

            <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
              <ImageMediaPicker
                owner={{ type: 'org', id: Number(org?.id || badge.org_id) }}
                title="Choose badge thumbnail"
                buttonText=""
                buttonSize="icon"
                buttonVariant="secondary"
                className="h-8 w-8 shadow-md"
                disabled={isUploading || !isDraft || !canEdit}
                onSelect={handleThumbnailSelect}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 text-center md:text-left">
            <EditableHeaderField
              field="name"
              isEditing={editingField === 'name'}
              value={draftName}
              onChange={setDraftName}
              onEdit={() => isDraft && canEdit && setEditingField('name')}
              onSave={saveName}
              isSaving={savingField === 'name'}
            />
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {getBadgeDateLine(badge)}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {canEdit ? <BadgeVersionToolbar badge={badge} /> : null}
              <Button asChild variant="outline" className="gap-2 bg-card">
                <Link href={publicBadgeHref} target="_blank">
                  <Eye className="h-4 w-4" />
                  Preview
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex space-x-3 text-sm font-black">
          {tabs.filter((tab) => canEdit || !['issuers', 'settings'].includes(tab.key)).map((tab) => {
            const Icon = tab.icon
            const isActive = normalizedSubpage === tab.key
            return (
              <Link key={tab.key} href={`${getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/${tab.key}`)}?version=${badge.selected_version?.version_uuid || ''}`} replace>
                <div className={`flex w-fit cursor-pointer space-x-4 border-black py-2 text-center transition-all ease-linear ${isActive ? 'border-b-4' : 'opacity-50 hover:opacity-75'}`}>
                  <div className="mx-2 flex items-center space-x-2.5">
                    <Icon size={16} />
                    <div>{tab.label}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }} className="overflow-x-hidden">
        {normalizedSubpage === 'analytics' ? <BadgeAnalyticsPanel badge={badge} canEdit={canEdit} /> : null}
        {normalizedSubpage === 'learning-path' ? children : null}
        {normalizedSubpage === 'issuers' && canEdit ? <BadgeIssuersPanel badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'marketing' ? <fieldset disabled={!isDraft || !canEdit}><BadgeAboutPanel badge={badge} onPatch={patchBadge} /></fieldset> : null}
        {normalizedSubpage === 'settings' && canEdit ? <BadgeSettingsPanel orgslug={orgslug} badge={badge} onPatch={patchBadge} isDraft={isDraft} /> : null}
        {normalizedSubpage === 'definition' ? <fieldset disabled={!isDraft || !canEdit}><BadgeCertificationPanel badge={badge} onPatch={patchBadge} /></fieldset> : null}
      </motion.div>
    </div>
  )
}

function BadgeAnalyticsPanel({ badge, canEdit }: { badge: any; canEdit: boolean }) {
  const metadata = badge.badge_metadata || {}
  return (
    <div className="px-10 pb-10 pt-6">
      <section className="max-w-4xl rounded-xl bg-card p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Badge analytics</h2>
            <p className="mt-1 text-sm text-muted-foreground">A quick view of this badge and how it is available to learners.</p>
          </div>
          {!canEdit ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Authorized issuer</span> : null}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AnalyticsStat label="Status" value={badge.status === 'published' ? 'Published' : 'Draft'} />
          <AnalyticsStat label="Visibility" value={badge.public ? 'Public' : 'Restricted'} />
          <AnalyticsStat label="Direct issuance" value={badge.direct_conferral_enabled ? 'Enabled' : 'Disabled'} />
          <AnalyticsStat label="Estimated time" value={metadata.estimated_time_label || metadata.estimated_time || 'Not set'} />
        </div>
      </section>
    </div>
  )
}

function AnalyticsStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-sm font-bold text-foreground">{value}</p></div>
}

export function BadgeGradingPanel({ badge }: { badge: any }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [responses, setResponses] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState('')
  const [drafts, setDrafts] = React.useState<Record<string, { score: string; feedback: string }>>({})

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getLearningResponses({
        org_id: badge.org_id,
        badge_uuid: badge.badge_uuid,
        grading_status: 'pending',
      }, accessToken)
      setResponses(Array.isArray(data) ? data : [])
      setDrafts((current) => {
        const next = { ...current }
        ;(Array.isArray(data) ? data : []).forEach((item: any) => {
          if (!next[item.attempt_uuid]) next[item.attempt_uuid] = { score: '', feedback: '' }
        })
        return next
      })
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load responses.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, badge.badge_uuid, badge.org_id])

  React.useEffect(() => {
    void load()
  }, [load])

  const saveGrade = async (response: any) => {
    const draft = drafts[response.attempt_uuid] || { score: '', feedback: '' }
    const maxScore = Number(response.result?.max_score ?? response.page?.scoring?.points ?? 1)
    const score = Math.max(0, Math.min(maxScore, Number(draft.score || 0)))
    setSaving(response.attempt_uuid)
    try {
      await gradeLearningResponse(response.attempt_uuid, { score, feedback: draft.feedback }, accessToken)
      toast.success('Response graded.')
      await load()
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
            <h2 className="text-lg font-bold text-foreground">Manual grading</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pending text responses that block final badge award.</p>
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
          ) : responses.length ? responses.map((response) => {
            const draft = drafts[response.attempt_uuid] || { score: '', feedback: '' }
            const inputs = response.result?.inputs || response.answer?.inputs || {}
            const maxScore = Number(response.result?.max_score ?? response.page?.scoring?.points ?? 1)
            const learner = response.user
              ? [response.user.first_name, response.user.last_name].filter(Boolean).join(' ') || response.user.username || response.user.email
              : 'Guest learner'

            return (
              <article key={response.attempt_uuid} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{response.page?.title || 'Text response'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{learner} · {new Date(response.submitted_at).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Pending</span>
                </div>

                <div className="mt-4 space-y-3">
                  {Object.entries(inputs).map(([inputId, value]: any) => (
                    <div key={inputId} className="rounded-lg bg-muted p-3">
                      <p className="text-xs font-bold uppercase text-muted-foreground">{inputId} · {value?.word_count ?? countWords(value?.text)} words</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{value?.text || 'No response text.'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
                  <label className="block text-xs font-bold uppercase text-muted-foreground">
                    Score / {maxScore}
                    <input
                      type="number"
                      min={0}
                      max={maxScore}
                      value={draft.score}
                      onChange={(event) => setDrafts((current) => ({ ...current, [response.attempt_uuid]: { ...draft, score: event.target.value } }))}
                      className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm normal-case text-foreground outline-none focus:ring-2 focus:ring-black"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase text-muted-foreground">
                    Feedback
                    <input
                      value={draft.feedback}
                      onChange={(event) => setDrafts((current) => ({ ...current, [response.attempt_uuid]: { ...draft, feedback: event.target.value } }))}
                      className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm normal-case text-foreground outline-none focus:ring-2 focus:ring-black"
                    />
                  </label>
                  <Button onClick={() => saveGrade(response)} disabled={saving === response.attempt_uuid || draft.score === ''} className="gap-2">
                    {saving === response.attempt_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save grade
                  </Button>
                </div>
              </article>
            )
          }) : (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No pending responses</p>
              <p className="mt-1 text-xs text-muted-foreground">Manual text submissions will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const authorizationStatusStyles: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  invited: 'bg-blue-100 text-blue-800',
  approved: 'bg-lime-100 text-lime-800',
  rejected: 'bg-red-100 text-red-700',
  revoked: 'bg-gray-200 text-gray-600',
}

function BadgeIssuersPanel({ badge, onPatch }: { badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [authorizations, setAuthorizations] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingListing, setSavingListing] = React.useState(false)
  const [actingOn, setActingOn] = React.useState('')
  const [inviteSlug, setInviteSlug] = React.useState('')
  const [inviting, setInviting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getIssuerAuthorizations(badge.org_id, 'creator', accessToken, badge.badge_uuid)
      setAuthorizations(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load issuer authorizations.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, badge.badge_uuid, badge.org_id])

  React.useEffect(() => {
    void load()
  }, [load])

  const toggleListing = async (value: boolean) => {
    setSavingListing(true)
    try {
      await onPatch({ marketplace_listed: value }, value ? 'Badge listed in the marketplace.' : 'Badge removed from the marketplace.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update marketplace listing.')
    } finally {
      setSavingListing(false)
    }
  }

  const act = async (authorization: any, action: 'approve' | 'reject' | 'revoke') => {
    setActingOn(authorization.authorization_uuid)
    try {
      if (action === 'approve') await approveIssuerAuthorization(authorization.authorization_uuid, accessToken)
      if (action === 'reject') await rejectIssuerAuthorization(authorization.authorization_uuid, accessToken)
      if (action === 'revoke') await revokeIssuerAuthorization(authorization.authorization_uuid, accessToken)
      toast.success('Authorization updated.')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update authorization.')
    } finally {
      setActingOn('')
    }
  }

  const sendInvite = async () => {
    const slug = inviteSlug.trim()
    if (!slug) return
    setInviting(true)
    try {
      await inviteIssuerOrg({ badge_uuid: badge.badge_uuid, issuer_org_slug: slug }, accessToken)
      toast.success(`Invite sent to ${slug}.`)
      setInviteSlug('')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send invite.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="max-w-4xl rounded-xl bg-card p-6 shadow-xs">
        <h2 className="text-lg font-bold text-foreground">Marketplace</h2>
        <div className="mt-4 divide-y divide-border">
          <SettingRow
            title="List in badge marketplace"
            description="Other organizations can discover this badge and request authorization to issue it to their learners."
            disabled={savingListing}
            checked={badge.marketplace_listed === true}
            onChange={(value) => void toggleListing(value)}
          />
        </div>
      </section>

      <section className="mt-6 max-w-4xl rounded-xl bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Issuing organizations</h2>
            <p className="mt-1 text-sm text-muted-foreground">Orgs authorized to deliver, grade, and issue this badge to their own learners.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 bg-card">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <label className="block flex-1 text-xs font-bold uppercase text-muted-foreground">
            Invite an organization by slug
            <input
              value={inviteSlug}
              onChange={(event) => setInviteSlug(event.target.value)}
              placeholder="org-slug"
              className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm normal-case text-foreground outline-none focus:ring-2 focus:ring-black"
            />
          </label>
          <Button onClick={() => void sendInvite()} disabled={inviting || !inviteSlug.trim()} className="gap-2">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Invite
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          <article className="flex flex-col gap-3 rounded-xl border border-lime-200 bg-lime-50/40 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{org?.name || 'Your organization'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Badge creator · automatically authorized to issue</p>
            </div>
            <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-bold text-lime-800">Authorized</span>
          </article>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : authorizations.length ? authorizations.map((authorization) => (
            <article key={authorization.authorization_uuid} className="flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{authorization.issuer_org?.name || 'Organization'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {authorization.issuer_org?.slug}
                  {authorization.message ? ` · “${authorization.message}”` : ''}
                  {authorization.status === 'approved' ? (authorization.open_to_all ? ' · open to all learners' : ' · invited learners only') : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${authorizationStatusStyles[authorization.status] || 'bg-gray-100 text-gray-600'}`}>
                  {authorization.status}
                </span>
                {authorization.status === 'requested' ? (
                  <>
                    <Button size="sm" onClick={() => void act(authorization, 'approve')} disabled={actingOn === authorization.authorization_uuid} className="gap-1">
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void act(authorization, 'reject')} disabled={actingOn === authorization.authorization_uuid} className="gap-1 bg-card">
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </>
                ) : null}
                {authorization.status === 'approved' || authorization.status === 'invited' ? (
                  <Button size="sm" variant="outline" onClick={() => void act(authorization, 'revoke')} disabled={actingOn === authorization.authorization_uuid} className="gap-1 bg-card text-red-700">
                    <Trash2 className="h-4 w-4" /> Revoke
                  </Button>
                ) : null}
              </div>
            </article>
          )) : (
            <div className="rounded-xl border border-dashed border-border py-12 text-center">
              <p className="text-sm font-semibold text-muted-foreground">No issuing organizations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">List this badge in the marketplace or invite an organization to get started.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function BadgeAboutPanel({ badge, onPatch }: { badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const metadata = badge.badge_metadata || {}
  const [about, setAbout] = React.useState(badge.about || '')
  const [criteria, setCriteria] = React.useState(badge.criteria || '')
  const [overviewSubtitle, setOverviewSubtitle] = React.useState(metadata.overview_subtitle || '')
  const [estimatedTimeLabel, setEstimatedTimeLabel] = React.useState(metadata.estimated_time_label || metadata.estimated_time || '')
  const [trustLine, setTrustLine] = React.useState(metadata.trust_line || '')
  const [overviewCards, setOverviewCards] = React.useState<any[]>(
    Array.isArray(metadata.overview_cards)
      ? metadata.overview_cards.map((card: any) => ({
          title: String(card?.title || ''),
          body: String(card?.body || ''),
          media_url: String(card?.media_url || ''),
          image_side: card?.image_side === 'right' ? 'right' : 'left',
        }))
      : []
  )
  const [saving, setSaving] = React.useState(false)

  const patchCard = (index: number, patch: Record<string, any>) => {
    setOverviewCards((cards) => cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...patch } : card))
  }

  const addCard = () => {
    setOverviewCards((cards) => [...cards, { title: '', body: '', media_url: '', image_side: 'left' }])
  }

  const deleteCard = (index: number) => {
    setOverviewCards((cards) => cards.filter((_, cardIndex) => cardIndex !== index))
  }

  const moveCard = (index: number, direction: -1 | 1) => {
    setOverviewCards((cards) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= cards.length) return cards
      const next = [...cards]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const metadataRest = { ...(badge.badge_metadata || {}) }
      delete metadataRest.overview_eyebrow
      delete metadataRest.skill_label
      delete metadataRest.earned_count_label
      delete metadataRest.earned_count
      const cleanedCards = overviewCards
        .map((card: any) => ({
          title: String(card?.title || '').trim(),
          body: String(card?.body || '').trim(),
          media_url: String(card?.media_url || '').trim(),
          image_side: card?.image_side === 'right' ? 'right' : 'left',
        }))
        .filter((card: any) => card.title || card.body || card.media_url)
      await onPatch({
        about,
        criteria,
        badge_metadata: {
          ...metadataRest,
          overview_subtitle: overviewSubtitle,
          estimated_time_label: estimatedTimeLabel,
          trust_line: trustLine,
          overview_cards: cleanedCards,
        },
      }, 'Badge details updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update badge details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="max-w-4xl rounded-xl bg-card p-6 shadow-xs">
        <h2 className="text-lg font-bold text-foreground">Marketing</h2>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estimated time</span>
              <input value={estimatedTimeLabel} onChange={(event) => setEstimatedTimeLabel(event.target.value)} placeholder="~2 hrs" className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-black" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Trust line</span>
              <input value={trustLine} onChange={(event) => setTrustLine(event.target.value)} placeholder="100% free - start anytime - no pressure" className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-black" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Overview subtitle</span>
            <textarea value={overviewSubtitle} onChange={(event) => setOverviewSubtitle(event.target.value)} rows={3} placeholder="Short sell copy shown beside the badge." className="mt-2 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Badge overview</span>
            <textarea value={about} onChange={(event) => setAbout(event.target.value)} rows={7} className="mt-2 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Criteria</span>
            <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">About cards</h3>
              <Button type="button" variant="outline" onClick={addCard} className="gap-2 bg-card">
                <Plus className="h-4 w-4" />
                Add card
              </Button>
            </div>
            <div className="space-y-4">
              {overviewCards.length ? overviewCards.map((card: any, index: number) => (
                <article key={index} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Card {index + 1}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="icon" variant="ghost" onClick={() => moveCard(index, -1)} disabled={index === 0} title="Move card up">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => moveCard(index, 1)} disabled={index === overviewCards.length - 1} title="Move card down">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => patchCard(index, { image_side: card.image_side === 'right' ? 'left' : 'right' })} title="Switch image side">
                        <ArrowLeftRight className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => deleteCard(index)} title="Delete card" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className={`grid gap-4 md:items-start ${card.image_side === 'right' ? 'md:grid-cols-[1fr_160px]' : 'md:grid-cols-[160px_1fr]'}`}>
                    <div className={`space-y-2 ${card.image_side === 'right' ? 'md:order-2' : ''}`}>
                      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-muted-foreground">
                        {card.media_url ? <img src={card.media_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8" />}
                      </div>
                      <div className="flex gap-2">
                        <input value={card.media_url} onChange={(event) => patchCard(index, { media_url: event.target.value })} placeholder="Image URL" className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-black" />
                        <ImageMediaPicker
                          owner={{ type: 'org', id: Number(org.id) }}
                          title="Choose card image"
                          buttonText="Choose"
                          onSelect={(url) => patchCard(index, { media_url: url })}
                        />
                      </div>
                    </div>
                    <div className={`space-y-3 ${card.image_side === 'right' ? 'md:order-1' : ''}`}>
                      <input value={card.title} onChange={(event) => patchCard(index, { title: event.target.value })} placeholder="Card title" className="h-10 w-full rounded-lg border border-border px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-black" />
                      <textarea value={card.body} onChange={(event) => patchCard(index, { body: event.target.value })} rows={5} placeholder="Card text" className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm font-semibold text-muted-foreground">
                  No about cards yet.
                </div>
              )}
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </section>
    </div>
  )
}

function BadgeSettingsPanel({ orgslug, badge, onPatch, isDraft }: { orgslug: string; badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any>; isDraft: boolean }) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [savingKey, setSavingKey] = React.useState('')
  const [deleting, setDeleting] = React.useState(false)

  const toggle = async (key: string, value: boolean, message: string) => {
    setSavingKey(key)
    try {
      await onPatch({ [key]: value }, message)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update setting.')
    } finally {
      setSavingKey('')
    }
  }

  const removeBadge = async () => {
    if (deleting) return
    if (!confirm(`Delete "${badge.name}"?`)) return
    setDeleting(true)
    try {
      await deleteLearningBadge(badge.badge_uuid, accessToken)
      toast.success('Badge deleted')
      router.push(getUriWithOrg(orgslug, '/admin/badges'))
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete badge.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="max-w-4xl rounded-xl bg-card p-6 shadow-xs">
        <h2 className="text-lg font-bold text-foreground">Settings</h2>
        <div className="mt-4 divide-y divide-border">
          <SettingRow title="Public visibility" description="Show this badge in public badge listings. Private badges remain available only within this organization." disabled={savingKey === 'public'} checked={badge.public === true} onChange={(value) => toggle('public', value, value ? 'Badge is now public.' : 'Badge is now private.')} />
          <SettingRow title="Direct issuance" description={isDraft ? "Allow authorized admins to create an OpenBadgeCredential without learning-path completion." : "Create a draft version to change direct issuance."} disabled={!isDraft || savingKey === 'direct_conferral_enabled'} checked={badge.direct_conferral_enabled === true} onChange={(value) => toggle('direct_conferral_enabled', value, 'Direct issuance setting updated.')} />
        </div>
      </section>
      <section className="mt-6 max-w-4xl rounded-xl border border-red-100 bg-card p-6 shadow-xs">
        <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Delete badge</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">This permanently deletes the badge, learning path, activities, pages, learner runs, and awards for this badge.</p>
          </div>
          <button onClick={removeBadge} disabled={deleting} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </section>
    </div>
  )
}

const achievementTypes = [
  { value: 'Achievement', label: 'Achievement' },
  { value: 'Badge', label: 'Badge' },
  { value: 'Award', label: 'Award' },
  { value: 'Assessment', label: 'Assessment' },
  { value: 'Certificate', label: 'Certificate' },
  { value: 'CertificateOfCompletion', label: 'Certificate of completion' },
  { value: 'Certification', label: 'Professional certification' },
  { value: 'Competency', label: 'Competency' },
  { value: 'Course', label: 'Course completion' },
]

const certificatePatterns = [
  { value: 'royal', label: 'Royal' },
  { value: 'tech', label: 'Tech' },
  { value: 'nature', label: 'Nature' },
  { value: 'geometric', label: 'Geometric' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'waves', label: 'Waves' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'professional', label: 'Professional' },
  { value: 'academic', label: 'Academic' },
  { value: 'modern', label: 'Modern' },
]

function BadgeCertificationPanel({ badge, onPatch }: { badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
  const org = useOrg() as any
  const metadata = badge.badge_metadata || {}
  const [values, setValues] = React.useState({
    badge_name: metadata.badge_name || metadata.certification_name || badge.name || '',
    badge_description: metadata.badge_description || metadata.certification_description || badge.description || '',
    achievement_type: metadata.achievement_type || getLegacyAchievementType(metadata.certification_type),
    badge_theme: metadata.badge_theme || metadata.certificate_pattern || 'professional',
    badge_criteria_text: metadata.badge_criteria_text || badge.criteria || 'Meet the criteria described for this Achievement.',
    criteria_url: metadata.criteria_url || metadata.badge_criteria_url || '',
    badge_image_url: metadata.badge_image_url || badge.thumbnail_image || '',
    issuer_name: metadata.issuer_name || '',
  })
  const [saving, setSaving] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)

  React.useEffect(() => {
    const nextMetadata = badge.badge_metadata || {}
    setValues({
      badge_name: nextMetadata.badge_name || nextMetadata.certification_name || badge.name || '',
      badge_description: nextMetadata.badge_description || nextMetadata.certification_description || badge.description || '',
      achievement_type: nextMetadata.achievement_type || getLegacyAchievementType(nextMetadata.certification_type),
      badge_theme: nextMetadata.badge_theme || nextMetadata.certificate_pattern || 'professional',
      badge_criteria_text: nextMetadata.badge_criteria_text || badge.criteria || 'Meet the criteria described for this Achievement.',
      criteria_url: nextMetadata.criteria_url || nextMetadata.badge_criteria_url || '',
      badge_image_url: nextMetadata.badge_image_url || badge.thumbnail_image || '',
      issuer_name: nextMetadata.issuer_name || '',
    })
  }, [badge])

  const updateValue = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    if (!values.badge_name.trim()) {
      toast.error('Achievement name is required.')
      return
    }
    if (!values.badge_description.trim()) {
      toast.error('Achievement description is required.')
      return
    }
    if (!values.badge_criteria_text.trim() && !values.criteria_url.trim()) {
      toast.error('A Criteria narrative or Criteria ID is required.')
      return
    }
    setSaving(true)
    try {
      await onPatch({
        name: values.badge_name,
        description: values.badge_description,
        criteria: values.badge_criteria_text,
        thumbnail_image: values.badge_image_url,
        badge_metadata: {
          ...(badge.badge_metadata || {}),
          badge_name: values.badge_name,
          badge_description: values.badge_description,
          certification_name: values.badge_name,
          certification_description: values.badge_description,
          achievement_type: values.achievement_type,
          certification_type: getCertificateType(values.achievement_type),
          badge_theme: values.badge_theme,
          certificate_pattern: values.badge_theme,
          badge_criteria_text: values.badge_criteria_text,
          criteria_url: values.criteria_url,
          badge_criteria_url: values.criteria_url,
          badge_image_url: values.badge_image_url,
          issuer_name: values.issuer_name,
        },
      }, 'Achievement updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update the Achievement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <div className="grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="order-2 space-y-6 lg:order-1">
          <section className="rounded-xl bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-foreground">Definition</h2>
              <p className="text-sm text-muted-foreground">Define the reusable Open Badges Achievement embedded in every OpenBadgeCredential issued for it.</p>
            </div>

            <div className="mt-6 space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <TextInput label="Achievement name" value={values.badge_name} onChange={(value) => updateValue('badge_name', value)} maxLength={100} />
                <SelectInput label="Achievement type" value={values.achievement_type} onChange={(value) => updateValue('achievement_type', value)} options={achievementTypes} />
              </div>

              <TextAreaInput label="Achievement description" value={values.badge_description} onChange={(value) => updateValue('badge_description', value)} rows={4} maxLength={500} />
              <TextAreaInput label="Criteria narrative" value={values.badge_criteria_text} onChange={(value) => updateValue('badge_criteria_text', value)} rows={5} />

              <TextInput label="Criteria ID (URL)" value={values.criteria_url} onChange={(value) => updateValue('criteria_url', value)} placeholder="Optional public criteria page" />

              <div className="space-y-2">
                <TextInput label="Achievement image URL" value={values.badge_image_url} onChange={(value) => updateValue('badge_image_url', value)} placeholder="Image representing the Achievement" />
                <ImageMediaPicker
                  owner={{ type: 'org', id: Number(org.id) }}
                  title="Choose Achievement image"
                  buttonText="Choose Achievement image"
                  onSelect={(url) => updateValue('badge_image_url', url)}
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <h3 className="text-sm font-bold text-foreground">Issuance routes in Launch LMS</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Learning-path completion and direct issuance both create an OpenBadgeCredential for this same Achievement. Evidence is attached to the individual credential at issuance.</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-foreground">Certificate presentation</h2>
              <p className="text-sm text-muted-foreground">Customize a Launch LMS presentation of the credential. The certificate is not part of the Achievement definition and does not change issuance.</p>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <SelectInput label="Certificate theme" value={values.badge_theme} onChange={(value) => updateValue('badge_theme', value)} options={certificatePatterns} />
              <div>
                <TextInput label="Certificate issuer label" value={values.issuer_name} onChange={(value) => updateValue('issuer_name', value)} placeholder="Defaults to the organization issuer" />
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Visual override only. The verifiable credential uses the organization that actually issues each award.</p>
              </div>
            </div>
          </section>

          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Achievement
          </Button>
        </div>

        <aside className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-6">
          <div className="rounded-xl bg-card p-4 shadow-xs">
            <h2 className="text-sm font-bold text-foreground">Certificate preview</h2>
            <Modal
              isDialogOpen={previewOpen}
              onOpenChange={setPreviewOpen}
              minWidth="lg"
              minHeight="no-min"
              dialogTitle="Certificate preview"
              dialogDescription="A Launch LMS certificate is one presentation of an issued OpenBadgeCredential."
              dialogContent={
                <CertificatePreview
                  certificationName={values.badge_name}
                  certificationDescription={values.badge_description}
                  certificationType={getCertificateType(values.achievement_type)}
                  certificatePattern={values.badge_theme}
                  certificateInstructor={values.issuer_name}
                  certificateId="award_preview"
                  awardedDate={getPreviewAwardDate()}
                  badgeImageUrl={values.badge_image_url || badge.thumbnail_image}
                />
              }
              dialogTrigger={
                <button type="button" className="group mt-3 block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  <CertificatePreview
                    certificationName={values.badge_name}
                    certificationDescription={values.badge_description}
                    certificationType={getCertificateType(values.achievement_type)}
                    certificatePattern={values.badge_theme}
                    certificateInstructor={values.issuer_name}
                    certificateId="award_preview"
                    awardedDate={getPreviewAwardDate()}
                    badgeImageUrl={values.badge_image_url || badge.thumbnail_image}
                  />
                  <span className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground transition group-hover:text-foreground">
                    <Eye className="h-3.5 w-3.5" /> Open preview
                  </span>
                </button>
              }
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-bold text-foreground">OpenBadgeCredential fields</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
              <li><span className="font-semibold text-foreground">credentialSubject</span> · recipient identity</li>
              <li><span className="font-semibold text-foreground">issuer</span> · issuing organization</li>
              <li><span className="font-semibold text-foreground">id / validFrom</span> · credential ID and date</li>
              <li><span className="font-semibold text-foreground">evidence</span> · recipient-specific evidence</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function getLegacyAchievementType(value?: string) {
  if (value === 'assessment') return 'Assessment'
  if (value === 'mastery') return 'Competency'
  if (value === 'professional' || value === 'continuing' || value === 'specialization') return 'Certification'
  if (value === 'achievement') return 'Achievement'
  if (value === 'participation' || value === 'workshop') return 'Badge'
  return 'CertificateOfCompletion'
}

function getCertificateType(value: string) {
  if (value === 'Assessment') return 'assessment'
  if (value === 'Competency') return 'mastery'
  if (value === 'Certification' || value === 'Certificate') return 'professional'
  if (value === 'Achievement' || value === 'Award' || value === 'Badge') return 'achievement'
  return 'completion'
}

function getPreviewAwardDate() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
    </label>
  )
}

function TextAreaInput({
  label,
  value,
  onChange,
  rows,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
  maxLength?: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
    </label>
  )
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-black"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function SettingRow({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className={`flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function EditableHeaderField({
  field,
  isEditing,
  value,
  onChange,
  onEdit,
  onSave,
  isSaving,
}: {
  field: 'name' | 'description'
  isEditing: boolean
  value: string
  onChange: (value: string) => void
  onEdit: () => void
  onSave: () => void
  isSaving: boolean
}) {
  const isTitle = field === 'name'

  return (
    <div className={`group flex min-w-0 items-start gap-2 ${isTitle ? 'mb-2' : ''}`}>
      {isEditing ? (
        isTitle ? (
          <input autoFocus value={value} maxLength={100} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-bold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-black" />
        ) : (
          <textarea autoFocus value={value} maxLength={1000} onChange={(event) => onChange(event.target.value)} rows={2} placeholder="Describe this badge..." className="min-w-0 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground outline-none focus:ring-2 focus:ring-black" />
        )
      ) : isTitle ? (
        <h1 className="min-w-0 break-words text-4xl font-bold tracking-tight text-foreground">{value}</h1>
      ) : (
        <p className="min-w-0 break-words text-sm font-medium text-muted-foreground">{value || 'No description yet.'}</p>
      )}

      <Button type="button" size="icon" variant={isEditing ? 'default' : 'ghost'} disabled={isSaving} className={`mt-1 h-7 w-7 shrink-0 ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity group-hover:opacity-100'}`} onClick={isEditing ? onSave : onEdit} title={isEditing ? 'Save' : 'Edit'}>
        {isSaving ? <Loader2 className="animate-spin" /> : isEditing ? <Check /> : <Pencil />}
      </Button>
    </div>
  )
}

function formatBadgeDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getBadgeDateLine(badge: any) {
  const created = formatBadgeDate(badge?.creation_date)
  const updated = formatBadgeDate(badge?.update_date)
  if (created && updated && created !== updated) return `Created on ${created} · Updated on ${updated}`
  if (created) return `Created on ${created}`
  if (updated) return `Updated on ${updated}`
  return 'Badge details'
}

function getActiveSubpage(subpage: string) {
  if (subpage === 'content') return 'learning-path'
  if (subpage === 'general' || subpage === 'seo' || subpage === 'about') return 'marketing'
  if (subpage === 'certification' || subpage === 'achievement') return 'definition'
  if (subpage === 'access' || subpage === 'contributors') return 'settings'
  return tabs.some((tab) => tab.key === subpage) ? subpage : 'analytics'
}

function countWords(value: string) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}
