'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Award, Check, ChevronDown, ClipboardCheck, Eye, GalleryVerticalEnd, Globe, GlobeLock, Image as ImageIcon, Info, Loader2, Pencil, Settings, Trash2, UploadCloud } from 'lucide-react'
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
import { getUriWithOrg } from '@services/config/config'
import { deleteLearningBadge, getLearningResponses, gradeLearningResponse, updateLearningBadge, updateLearningBadgeThumbnail } from '@services/learning/learning'
import CertificatePreview from '@components/Dashboard/Pages/Course/EditCourseCertification/CertificatePreview'

type BadgeStatus = 'published' | 'unpublished'

const MAX_FILE_SIZE = 8_000_000
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const

const tabs = [
  { key: 'learning-path', label: 'Learning Path', icon: GalleryVerticalEnd },
  { key: 'grading', label: 'Grading', icon: ClipboardCheck },
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
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const [badge, setBadge] = React.useState(initialBadge)
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null)
  const [draftName, setDraftName] = React.useState(initialBadge.name || '')
  const [draftDescription, setDraftDescription] = React.useState(initialBadge.description || '')
  const [savingField, setSavingField] = React.useState<'name' | 'description' | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadPreview, setUploadPreview] = React.useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = React.useState(false)
  const [updatingVisibility, setUpdatingVisibility] = React.useState(false)
  const normalizedSubpage = getActiveSubpage(activeSubpage)

  React.useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    }
  }, [uploadPreview])

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
    const published = status === 'published'
    if (badge.published === published) return
    setUpdatingStatus(true)
    try {
      await patchBadge({ published }, 'Badge status updated.')
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

  const validateImageFile = (file: File) => {
    if (!VALID_IMAGE_MIME_TYPES.includes(file.type as any)) {
      toast.error('Only JPG and PNG images are allowed.')
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 8MB.')
      return false
    }
    return true
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!accessToken) {
      toast.error('Please sign in to upload a badge image.')
      event.target.value = ''
      return
    }
    if (!validateImageFile(file)) {
      event.target.value = ''
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(previewUrl)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('thumbnail', file)
      const nextBadge = await updateLearningBadgeThumbnail(badge.badge_uuid, formData, accessToken)
      setBadge(nextBadge)
      toast.success('Thumbnail image updated.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload image.')
    } finally {
      setUploadPreview(null)
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const publicBadgeHref = getUriWithOrg(orgslug, `/badges/${cleanBadgeId(badge.badge_uuid)}`)
  const currentStatus: BadgeStatus = badge.published ? 'published' : 'unpublished'
  const imageUrl = uploadPreview || badge.thumbnail_image

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
          <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
            {imageUrl ? (
              <SafeImage src={imageUrl} alt="Badge thumbnail" className={`h-full w-full object-cover ${isUploading ? 'animate-pulse' : ''}`} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lime-500">
                <Award size={42} strokeWidth={1.5} />
              </div>
            )}

            <input ref={imageInputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={handleFileChange} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  disabled={isUploading}
                  className="absolute right-2 top-2 z-20 h-8 w-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                  title="Upload thumbnail media"
                >
                  {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                  Upload image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <Button variant="outline" className="gap-2 bg-white" disabled={updatingStatus}>
                {updatingStatus ? <Loader2 className="animate-spin" /> : <StatusIcon status={currentStatus} />}
                <span>{currentStatus === 'published' ? 'Published' : 'Unpublished'}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => updateStatus('unpublished')}>
                <GlobeLock className="h-4 w-4" />
                Unpublished
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus('published')}>
                <Globe className="h-4 w-4" />
                Published
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white">
            <Button
              type="button"
              variant={badge.public === true ? 'default' : 'ghost'}
              className={`h-10 rounded-none gap-2 px-3 ${badge.public === true ? '' : 'text-gray-500'}`}
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
              className={`h-10 rounded-none gap-2 px-3 ${badge.public === false ? '' : 'text-gray-500'}`}
              disabled={updatingVisibility}
              onClick={() => updateVisibility(false)}
              title="Private badges are visible only within this org."
            >
              {updatingVisibility && badge.public !== false ? <Loader2 className="h-4 w-4 animate-spin" /> : <GlobeLock className="h-4 w-4" />}
              Private
            </Button>
          </div>
          <Button asChild variant="outline" className="gap-2 bg-white">
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
      <section className="rounded-xl bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Manual grading</h2>
            <p className="mt-1 text-sm text-gray-500">Pending text responses that block final badge award.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2 bg-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
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
              <article key={response.attempt_uuid} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-950">{response.page?.title || 'Text response'}</p>
                    <p className="mt-1 text-xs text-gray-500">{learner} · {new Date(response.submitted_at).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Pending</span>
                </div>

                <div className="mt-4 space-y-3">
                  {Object.entries(inputs).map(([inputId, value]: any) => (
                    <div key={inputId} className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs font-bold uppercase text-gray-400">{inputId} · {value?.word_count ?? countWords(value?.text)} words</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">{value?.text || 'No response text.'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
                  <label className="block text-xs font-bold uppercase text-gray-500">
                    Score / {maxScore}
                    <input
                      type="number"
                      min={0}
                      max={maxScore}
                      value={draft.score}
                      onChange={(event) => setDrafts((current) => ({ ...current, [response.attempt_uuid]: { ...draft, score: event.target.value } }))}
                      className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm normal-case text-gray-900 outline-none focus:ring-2 focus:ring-black"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase text-gray-500">
                    Feedback
                    <input
                      value={draft.feedback}
                      onChange={(event) => setDrafts((current) => ({ ...current, [response.attempt_uuid]: { ...draft, feedback: event.target.value } }))}
                      className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm normal-case text-gray-900 outline-none focus:ring-2 focus:ring-black"
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
            <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">No pending responses</p>
              <p className="mt-1 text-xs text-gray-500">Manual text submissions will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function BadgeAboutPanel({ badge, onPatch }: { badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
  const [about, setAbout] = React.useState(badge.about || '')
  const [criteria, setCriteria] = React.useState(badge.criteria || '')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onPatch({ about, criteria }, 'Badge details updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update badge details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="max-w-4xl rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">About</h2>
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Badge overview</span>
            <textarea value={about} onChange={(event) => setAbout(event.target.value)} rows={7} className="mt-2 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Criteria</span>
            <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
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
      <section className="max-w-4xl rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>
        <div className="mt-4 divide-y divide-gray-100">
          <SettingRow title="Direct conferral" description="Allow authorized admins to issue this badge without path completion." disabled={savingKey === 'direct_conferral_enabled'} checked={badge.direct_conferral_enabled === true} onChange={(value) => toggle('direct_conferral_enabled', value, 'Conferral setting updated.')} />
        </div>
      </section>
      <section className="mt-6 max-w-4xl rounded-xl border border-red-100 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Delete badge</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">This permanently deletes the badge, learning path, activities, pages, learner runs, and awards for this badge.</p>
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
        <section className="rounded-xl bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-gray-900">Preview</h2>
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

        <section className="rounded-xl bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-gray-900">Certificate Setup</h2>
            <p className="text-sm text-gray-500">Configure the certificate and Open Badge metadata issued when a learner completes this path.</p>
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
                <TextInput label="Badge image URL" value={values.badge_image_url} onChange={(value) => updateValue('badge_image_url', value)} placeholder="Optional override for the badge image" />
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
      <span className="text-xs font-bold uppercase text-gray-500">{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
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
      <span className="text-xs font-bold uppercase text-gray-500">{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
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
      <span className="text-xs font-bold uppercase text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-black"
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
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">{description}</p>
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
          <input autoFocus value={value} maxLength={100} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-3xl font-bold tracking-tight text-gray-900 outline-none focus:ring-2 focus:ring-black" />
        ) : (
          <textarea autoFocus value={value} maxLength={1000} onChange={(event) => onChange(event.target.value)} rows={2} placeholder="Describe this badge..." className="min-w-0 flex-1 resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-500 outline-none focus:ring-2 focus:ring-black" />
        )
      ) : isTitle ? (
        <h1 className="min-w-0 break-words text-4xl font-bold tracking-tight text-gray-900">{value}</h1>
      ) : (
        <p className="min-w-0 break-words text-sm font-medium text-gray-500">{value || 'No description yet.'}</p>
      )}

      <Button type="button" size="icon" variant={isEditing ? 'default' : 'ghost'} disabled={isSaving} className={`mt-1 h-7 w-7 shrink-0 ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity group-hover:opacity-100'}`} onClick={isEditing ? onSave : onEdit} title={isEditing ? 'Save' : 'Edit'}>
        {isSaving ? <Loader2 className="animate-spin" /> : isEditing ? <Check /> : <Pencil />}
      </Button>
    </div>
  )
}

function StatusIcon({ status }: { status: BadgeStatus }) {
  if (status === 'published') return <Globe className="h-4 w-4 text-green-700" />
  return <GlobeLock className="h-4 w-4 text-yellow-700" />
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
