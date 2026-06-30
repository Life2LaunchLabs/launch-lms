'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Award, Check, ChevronDown, Eye, GalleryVerticalEnd, Globe, GlobeLock, Info, Loader2, Pencil, Settings, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
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
import { deleteLearningBadge, updateLearningBadge } from '@services/learning/learning'

type BadgeStatus = 'published' | 'unpublished'

const tabs = [
  { key: 'learning-path', label: 'Learning Path', icon: GalleryVerticalEnd },
  { key: 'about', label: 'About', icon: Info },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'certification', label: 'Certification', icon: Award },
]

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
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [badge, setBadge] = React.useState(initialBadge)
  const [editingField, setEditingField] = React.useState<'name' | 'description' | null>(null)
  const [draftName, setDraftName] = React.useState(initialBadge.name || '')
  const [draftDescription, setDraftDescription] = React.useState(initialBadge.description || '')
  const [savingField, setSavingField] = React.useState<'name' | 'description' | null>(null)
  const [updatingStatus, setUpdatingStatus] = React.useState(false)
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

  const publicBadgeHref = getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}`)
  const currentStatus: BadgeStatus = badge.published ? 'published' : 'unpublished'

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
            {badge.thumbnail_image ? (
              <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lime-500">
                <Award size={42} strokeWidth={1.5} />
              </div>
            )}
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
              <Link key={tab.key} href={getUriWithOrg(orgslug, `/admin/badges/badge/${badge.badge_uuid}/${tab.key}`)} replace>
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
        {normalizedSubpage === 'about' ? <BadgeAboutPanel badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'settings' ? <BadgeSettingsPanel orgslug={orgslug} badge={badge} onPatch={patchBadge} /> : null}
        {normalizedSubpage === 'certification' ? <BadgeCertificationPanel badge={badge} onPatch={patchBadge} /> : null}
      </motion.div>
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
          <SettingRow title="Public badge" description="Public badges are visible in learner badge lists." disabled={savingKey === 'public'} checked={badge.public === true} onChange={(value) => toggle('public', value, 'Access updated.')} />
          <SettingRow title="Direct conferral" description="Allow authorized admins to issue this badge without path completion." disabled={savingKey === 'direct_conferral_enabled'} checked={badge.direct_conferral_enabled === true} onChange={(value) => toggle('direct_conferral_enabled', value, 'Conferral setting updated.')} />
        </div>
      </section>
      <section className="mt-6 max-w-4xl rounded-xl border border-red-100 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Delete badge</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">This permanently deletes the badge, learning path, activities, pages, learner runs, and awards for this Learning 2.0 badge.</p>
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

function BadgeCertificationPanel({ badge, onPatch }: { badge: any; onPatch: (patch: Record<string, any>, successMessage?: string) => Promise<any> }) {
  const [issuerName, setIssuerName] = React.useState(badge.badge_metadata?.issuer_name || '')
  const [evidenceLabel, setEvidenceLabel] = React.useState(badge.badge_metadata?.evidence_label || '')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onPatch({
        badge_metadata: {
          ...(badge.badge_metadata || {}),
          issuer_name: issuerName,
          evidence_label: evidenceLabel,
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
      <section className="max-w-4xl rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">Certification</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Issuer display name</span>
            <input value={issuerName} onChange={(event) => setIssuerName(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Evidence label</span>
            <input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} placeholder="Learning path completion" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" />
          </label>
        </div>
        <Button onClick={save} disabled={saving} className="mt-5 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </Button>
      </section>
    </div>
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
