'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, Award, Check, ChevronDown, ClipboardCheck, Clock, Eye, GalleryVerticalEnd, Globe, GlobeLock, Handshake, Image as ImageIcon, Info, Loader2, Pencil, Plus, Settings, Trash2, X } from 'lucide-react'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { deleteLearningBadge, getLearningResponses, gradeLearningResponse, updateLearningBadge } from '@services/learning/learning'
import { approveIssuerAuthorization, getIssuerAuthorizations, inviteIssuerOrg, rejectIssuerAuthorization, revokeIssuerAuthorization } from '@services/learning/marketplace'
import CertificatePreview from '@components/Learning/BadgeCertificatePreview'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'

type BadgeStatus = 'draft' | 'coming_soon' | 'published'

const tabs = [
  { key: 'learning-path', label: 'Learning Path', icon: GalleryVerticalEnd },
  { key: 'grading', label: 'Grading', icon: ClipboardCheck },
  { key: 'issuers', label: 'Issuers', icon: Handshake },
  { key: 'about', label: 'About', icon: Info },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'certification', label: 'Certification', icon: Award },
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
  const [badge, setBadge] = React.useState(initialBadge)
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null)
  const [draftName, setDraftName] = React.useState(initialBadge.name || '')
  const [draftDescription, setDraftDescription] = React.useState(initialBadge.description || '')
  const [savingField, setSavingField] = React.useState<'name' | 'description' | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [updatingStatus, setUpdatingStatus] = React.useState(false)
  const [updatingVisibility, setUpdatingVisibility] = React.useState(false)
  const normalizedSubpage = getActiveSubpage(activeSubpage)

  const patchBadge = async (patch: Record<string, any>, successMessage?: string) => {
    const nextBadge = await updateLearningBadge(badge.badge_uuid, patch, accessToken)
    setBadge(nextBadge)
    if (successMessage) toast.success(successMessage)
    return nextBadge
  }

  const saveField = async (field: 'name' | 'description') => {
    if (savingField) return
    const value = field === 'name' ? draftName.trim() : draftDescription.trim()
    if (field === 'name' && value.length < 3) {
      toast.error('Badge title must be at least 3 characters.')
      return
    }
    setSavingField(field)
    try {
      await patchBadge(field === 'name' ? { name: value } : { description: value }, field === 'name' ? 'Title updated.' : 'Description updated.')
      setEditingField(null)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update badge.')
    } finally {
      setSavingField(null)
    }
  }

  const updateStatus = async (status: BadgeStatus) => {
    if (updatingStatus) return
    if ((badge.status || 'draft') === status) return
    setUpdatingStatus(true)
    try {
      await patchBadge({ status }, 'Badge status updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const updateVisibility = async (isPublic: boolean) => {
    if (updatingVisibility || badge.public === isPublic) return
    setUpdatingVisibility(true)
    try {
      await patchBadge({ public: isPublic }, 'Access updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visibility.')
    } finally {
      setUpdatingVisibility(false)
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
  const currentStatus: BadgeStatus = getBadgeStatus(badge)
  const imageUrl = badge.thumbnail_image

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
          <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {imageUrl ? (
              <SafeImage src={imageUrl} alt="Badge thumbnail" className={`h-full w-full object-cover ${isUploading ? 'animate-pulse' : ''}`} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lime-500">
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
                disabled={isUploading}
                onSelect={handleThumbnailSelect}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <EditableHeaderField
              field="name"
              isEditing={editingField === 'name'}
              value={draftName}
              onChange={setDraftName}
              onEdit={() => setEditingField('name')}
              onSave={() => saveField('name')}
              isSaving={savingField === 'name'}
            />
            <EditableHeaderField
              field="description"
              isEditing={editingField === 'description'}
              value={draftDescription}
              onChange={setDraftDescription}
              onEdit={() => setEditingField('description')}
              onSave={() => saveField('description')}
              isSaving={savingField === 'description'}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pb-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 bg-card" disabled={updatingStatus}>
                {updatingStatus ? <Loader2 className="animate-spin" /> : <StatusIcon status={currentStatus} />}
                <span>{getStatusLabel(currentStatus)}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => updateStatus('draft')}>
                <GlobeLock className="h-4 w-4" />
                Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus('coming_soon')}>
                <Clock className="h-4 w-4" />
                Coming soon
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus('published')}>
                <Globe className="h-4 w-4" />
                Published
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="inline-flex overflow-hidden rounded-md border border-border bg-card">
            <Button
              type="button"
              variant={badge.public === true ? 'default' : 'ghost'}
              className={`h-10 rounded-none gap-2 px-3 ${badge.public === true ? '' : 'text-muted-foreground'}`}
              disabled={updatingVisibility}
              onClick={() => updateVisibility(true)}
              title="Public badges appear in learner badge lists."
            >
              {updatingVisibility && badge.public !== true ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Public
            </Button>
            <Button
              type="button"
              variant={badge.public === false ? 'default' : 'ghost'}
              className={`h-10 rounded-none gap-2 px-3 ${badge.public === false ? '' : 'text-muted-foreground'}`}
              disabled={updatingVisibility}
              onClick={() => updateVisibility(false)}
              title="Private badges are visible only within this org."
            >
              {updatingVisibility && badge.public !== false ? <Loader2 className="h-4 w-4 animate-spin" /> : <GlobeLock className="h-4 w-4" />}
              Private
            </Button>
          </div>
          <Button asChild variant="outline" className="gap-2 bg-card">
            <Link href={publicBadgeHref} target="_blank">
              <Eye className="h-4 w-4" />
              Preview
            </Link>
          </Button>
        </div>

        <div className="flex space-x-3 text-sm font-black">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = normalizedSubpage === tab.key
            return (
              <Link key={tab.key} href={getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/${tab.key}`)} replace>
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
        {normalizedSubpage === 'learning-path' ? children : null}
        {normalizedSubpage === 'grading' ? <BadgeGradingPanel badge={badge} /> : null}
        {normalizedSubpage === 'issuers' ? <BadgeIssuersPanel badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'about' ? <BadgeAboutPanel badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'settings' ? <BadgeSettingsPanel orgslug={orgslug} badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'certification' ? <BadgeCertificationPanel badge={badge} onPatch={patchBadge} /> : null}
      </motion.div>
    </div>
  )
}

function BadgeGradingPanel({ badge }: { badge: any }) {
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
        <h2 className="text-lg font-bold text-foreground">About</h2>
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

function BadgeSettingsPanel({ orgslug, badge, onPatch }: { orgslug: string; badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
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
          <SettingRow title="Direct conferral" description="Allow authorized admins to issue this badge without path completion." disabled={savingKey === 'direct_conferral_enabled'} checked={badge.direct_conferral_enabled === true} onChange={(value) => toggle('direct_conferral_enabled', value, 'Conferral setting updated.')} />
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

const certificationTypes = [
  { value: 'completion', label: 'Course Completion' },
  { value: 'achievement', label: 'Achievement Based' },
  { value: 'assessment', label: 'Assessment Based' },
  { value: 'participation', label: 'Participation' },
  { value: 'mastery', label: 'Skill Mastery' },
  { value: 'professional', label: 'Professional Development' },
  { value: 'continuing', label: 'Continuing Education' },
  { value: 'workshop', label: 'Workshop Attendance' },
  { value: 'specialization', label: 'Specialization' },
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
    certification_type: metadata.certification_type || 'completion',
    badge_theme: metadata.badge_theme || metadata.certificate_pattern || 'professional',
    badge_criteria_text: metadata.badge_criteria_text || badge.criteria || 'Complete all required activities in this badge learning path.',
    criteria_url: metadata.criteria_url || metadata.badge_criteria_url || '',
    badge_image_url: metadata.badge_image_url || badge.thumbnail_image || '',
    badge_support_url: metadata.badge_support_url || '',
    issuer_name: metadata.issuer_name || '',
    evidence_label: metadata.evidence_label || 'Learning path completion',
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    const nextMetadata = badge.badge_metadata || {}
    setValues({
      badge_name: nextMetadata.badge_name || nextMetadata.certification_name || badge.name || '',
      badge_description: nextMetadata.badge_description || nextMetadata.certification_description || badge.description || '',
      certification_type: nextMetadata.certification_type || 'completion',
      badge_theme: nextMetadata.badge_theme || nextMetadata.certificate_pattern || 'professional',
      badge_criteria_text: nextMetadata.badge_criteria_text || badge.criteria || 'Complete all required activities in this badge learning path.',
      criteria_url: nextMetadata.criteria_url || nextMetadata.badge_criteria_url || '',
      badge_image_url: nextMetadata.badge_image_url || badge.thumbnail_image || '',
      badge_support_url: nextMetadata.badge_support_url || '',
      issuer_name: nextMetadata.issuer_name || '',
      evidence_label: nextMetadata.evidence_label || 'Learning path completion',
    })
  }, [badge])

  const updateValue = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    if (!values.badge_name.trim()) {
      toast.error('Badge name is required.')
      return
    }
    if (!values.badge_description.trim()) {
      toast.error('Badge description is required.')
      return
    }
    if (!values.badge_criteria_text.trim() && !values.criteria_url.trim()) {
      toast.error('Criteria text or criteria URL is required.')
      return
    }
    setSaving(true)
    try {
      await onPatch({
        criteria: values.badge_criteria_text,
        badge_metadata: {
          ...(badge.badge_metadata || {}),
          badge_name: values.badge_name,
          badge_description: values.badge_description,
          certification_name: values.badge_name,
          certification_description: values.badge_description,
          certification_type: values.certification_type,
          badge_theme: values.badge_theme,
          certificate_pattern: values.badge_theme,
          badge_criteria_text: values.badge_criteria_text,
          criteria_url: values.criteria_url,
          badge_criteria_url: values.criteria_url,
          badge_image_url: values.badge_image_url,
          badge_support_url: values.badge_support_url,
          issuer_name: values.issuer_name,
          evidence_label: values.evidence_label,
        },
      }, 'Certification settings updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update certification settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <div className="max-w-6xl space-y-6">
        <section className="rounded-xl bg-card p-6 shadow-xs">
          <h2 className="text-lg font-bold text-foreground">Preview</h2>
          <div className="mt-5">
            <CertificatePreview
              certificationName={values.badge_name}
              certificationDescription={values.badge_description}
              certificationType={values.certification_type}
              certificatePattern={values.badge_theme}
              certificateInstructor={values.issuer_name}
              certificateId="award_preview"
              awardedDate={new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              badgeImageUrl={values.badge_image_url || badge.thumbnail_image}
            />
          </div>
        </section>

        <section className="rounded-xl bg-card p-6 shadow-xs">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-foreground">Certificate Setup</h2>
            <p className="text-sm text-muted-foreground">Configure the certificate and Open Badge metadata issued when a learner completes this path.</p>
          </div>

          <div className="mt-6 space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <TextInput label="Badge name" value={values.badge_name} onChange={(value) => updateValue('badge_name', value)} maxLength={100} />
              <SelectInput label="Badge type" value={values.certification_type} onChange={(value) => updateValue('certification_type', value)} options={certificationTypes} />
            </div>

            <TextAreaInput label="Badge description" value={values.badge_description} onChange={(value) => updateValue('badge_description', value)} rows={4} maxLength={500} />

            <div className="grid gap-5 md:grid-cols-2">
              <TextAreaInput label="Criteria text" value={values.badge_criteria_text} onChange={(value) => updateValue('badge_criteria_text', value)} rows={5} />
              <div className="space-y-5">
                <SelectInput label="Certificate presentation" value={values.badge_theme} onChange={(value) => updateValue('badge_theme', value)} options={certificatePatterns} />
                <TextInput label="Criteria URL" value={values.criteria_url} onChange={(value) => updateValue('criteria_url', value)} placeholder="https://example.com/badge-criteria" />
                <div className="space-y-2">
                  <TextInput label="Badge image URL" value={values.badge_image_url} onChange={(value) => updateValue('badge_image_url', value)} placeholder="Optional override for the badge image" />
                  <ImageMediaPicker
                    owner={{ type: 'org', id: Number(org.id) }}
                    title="Choose badge image"
                    buttonText="Choose badge image"
                    onSelect={(url) => updateValue('badge_image_url', url)}
                  />
                </div>
                <TextInput label="Support URL" value={values.badge_support_url} onChange={(value) => updateValue('badge_support_url', value)} placeholder="Optional issuer support or help page" />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <TextInput label="Issuer display name" value={values.issuer_name} onChange={(value) => updateValue('issuer_name', value)} placeholder="Defaults to the organization issuer" />
              <TextInput label="Evidence label" value={values.evidence_label} onChange={(value) => updateValue('evidence_label', value)} placeholder="Learning path completion" />
            </div>

            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save certification
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
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

function StatusIcon({ status }: { status: BadgeStatus }) {
  if (status === 'published') return <Globe className="h-4 w-4 text-green-700" />
  if (status === 'coming_soon') return <Clock className="h-4 w-4 text-orange-700" />
  return <GlobeLock className="h-4 w-4 text-yellow-700" />
}

function getBadgeStatus(badge: any): BadgeStatus {
  const status = badge?.status
  if (status === 'published' || status === 'coming_soon' || status === 'draft') return status
  return 'draft'
}

function getStatusLabel(status: BadgeStatus) {
  if (status === 'published') return 'Published'
  if (status === 'coming_soon') return 'Coming soon'
  return 'Draft'
}

function getActiveSubpage(subpage: string) {
  if (subpage === 'content') return 'learning-path'
  if (subpage === 'general' || subpage === 'seo') return 'about'
  if (subpage === 'access' || subpage === 'contributors') return 'settings'
  return tabs.some((tab) => tab.key === subpage) ? subpage : 'learning-path'
}

function countWords(value: string) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}
