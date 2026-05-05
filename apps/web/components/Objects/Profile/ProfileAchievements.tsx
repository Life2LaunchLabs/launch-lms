'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Calendar,
  ExternalLink,
  GraduationCap,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  Trophy,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths, getAPIUrl } from '@services/config/config'
import { updateProfile } from '@services/settings/profile'
import { swrFetcher } from '@services/utils/ts/requests'

export type CustomAchievementType =
  | 'award'
  | 'badge'
  | 'book'
  | 'briefcase'
  | 'graduation'
  | 'sparkles'
  | 'trophy'

export type CustomAchievement = {
  id: string
  type: CustomAchievementType
  title: string
  organization: string
  receivedDate: string
  description: string
}

export type AchievementFeaturedRef = {
  id: string
  kind: 'custom' | 'credential'
}

export type AchievementsSection = {
  enabled: boolean
  custom: CustomAchievement[]
  featured: AchievementFeaturedRef[]
}

type CredentialAchievement = {
  id: string
  kind: 'credential'
  title: string
  organization: string
  receivedDate: string
  description: string
  imageUrl: string
  href: string
  raw: any
}

type DisplayAchievement = {
  id: string
  kind: 'custom' | 'credential'
  title: string
  organization: string
  receivedDate: string
  description: string
  href: string
  imageUrl?: string
  customType?: CustomAchievementType
}

type AchievementRoutes = {
  profileHref: string
  achievementsHref: string
  // eslint-disable-next-line no-unused-vars
  achievementHref: (achievementId: string) => string
}

type ProfileShape = {
  achievements?: AchievementsSection
}

type ProfileAchievementsSectionProps = {
  achievements: AchievementsSection
  orgslug: string
  profileUsername?: string
  editMode?: boolean
  canEdit?: boolean
  // eslint-disable-next-line no-unused-vars
  onChange?(next: AchievementsSection): void
}

type ProfileAchievementsManagerProps = {
  initialUser: any
  orgslug: string
  profileUsername?: string
  canEdit?: boolean
}

type CustomAchievementDetailProps = {
  initialUser: any
  orgslug: string
  achievementId: string
  profileUsername?: string
}

const CUSTOM_ACHIEVEMENT_TYPES: Array<{
  value: CustomAchievementType
  label: string
  icon: React.ComponentType<{ className?: string }>
  bg: string
  fg: string
}> = [
  { value: 'award', label: 'Award', icon: Award, bg: 'bg-amber-100', fg: 'text-amber-700' },
  { value: 'badge', label: 'Badge', icon: BadgeCheck, bg: 'bg-sky-100', fg: 'text-sky-700' },
  { value: 'book', label: 'Learning', icon: BookOpen, bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  { value: 'briefcase', label: 'Work', icon: Briefcase, bg: 'bg-stone-200', fg: 'text-stone-700' },
  { value: 'graduation', label: 'Education', icon: GraduationCap, bg: 'bg-violet-100', fg: 'text-violet-700' },
  { value: 'sparkles', label: 'Milestone', icon: Sparkles, bg: 'bg-rose-100', fg: 'text-rose-700' },
  { value: 'trophy', label: 'Trophy', icon: Trophy, bg: 'bg-yellow-100', fg: 'text-yellow-700' },
]

const MAX_FEATURED_ACHIEVEMENTS = 12

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeAchievements(achievements: any): AchievementsSection {
  return {
    enabled: Boolean(achievements?.enabled),
    custom: Array.isArray(achievements?.custom)
      ? achievements.custom.map((item: any) => ({
        id: item.id || createId('achievement'),
        type: CUSTOM_ACHIEVEMENT_TYPES.some((option) => option.value === item.type) ? item.type : 'award',
        title: item.title || '',
        organization: item.organization || '',
        receivedDate: item.receivedDate || '',
        description: item.description || '',
      }))
      : [],
    featured: Array.isArray(achievements?.featured)
      ? achievements.featured
        .filter((item: any) => item?.id && (item?.kind === 'custom' || item?.kind === 'credential'))
        .slice(0, MAX_FEATURED_ACHIEVEMENTS)
        .map((item: any) => ({
          id: String(item.id),
          kind: item.kind,
        }))
      : [],
  }
}

function getAchievementsFromProfile(profile: ProfileShape | undefined | null) {
  return normalizeAchievements(profile?.achievements)
}

function getAchievementRoutes(orgslug: string, profileUsername?: string): AchievementRoutes {
  if (profileUsername) {
    return {
      profileHref: getUriWithOrg(orgslug, routePaths.org.user(profileUsername)),
      achievementsHref: getUriWithOrg(orgslug, routePaths.org.userAchievements(profileUsername)),
      achievementHref: (achievementId: string) =>
        getUriWithOrg(orgslug, routePaths.org.userAchievementDetail(profileUsername, achievementId)),
    }
  }

  return {
    profileHref: getUriWithOrg(orgslug, routePaths.org.profile()),
    achievementsHref: getUriWithOrg(orgslug, routePaths.org.profileAchievements()),
    achievementHref: (achievementId: string) =>
      getUriWithOrg(orgslug, routePaths.org.profileAchievementDetail(achievementId)),
  }
}

function parseProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return profile
}

function getCustomTypeConfig(type: CustomAchievementType) {
  return CUSTOM_ACHIEVEMENT_TYPES.find((option) => option.value === type) || CUSTOM_ACHIEVEMENT_TYPES[0]
}

function formatDisplayDate(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  })
}

function getCredentialTitle(credential: any) {
  return credential.badge_class?.name
    || credential.certification?.config?.badge_name
    || credential.certification?.config?.certification_name
    || credential.course?.name
    || 'Credential'
}

function getCredentialDescription(credential: any) {
  return credential.badge_class?.description
    || credential.certification?.config?.badge_description
    || credential.certification?.config?.certification_description
    || ''
}

function getCredentialImage(credential: any) {
  return credential.badge_class?.image
    || credential.certification?.config?.badge_image_url
    || credential.issuer?.image
    || '/logo-icon.svg'
}

function normalizeCredentialAchievements(certificates: any[], orgslug: string): CredentialAchievement[] {
  return certificates.map((credential: any) => ({
    id: credential.certificate_user?.user_certification_uuid,
    kind: 'credential' as const,
    title: getCredentialTitle(credential),
    organization: credential.issuer?.name || credential.organization?.name || 'LaunchLMS',
    receivedDate: credential.certificate_user?.created_at || '',
    description: getCredentialDescription(credential),
    imageUrl: getCredentialImage(credential),
    href: getUriWithOrg(orgslug, routePaths.org.badgesVerify(credential.certificate_user?.user_certification_uuid)),
    raw: credential,
  })).filter((credential) => credential.id)
}

function buildFeaturedAchievements(
  achievements: AchievementsSection,
  credentials: CredentialAchievement[],
  routes: AchievementRoutes
): DisplayAchievement[] {
  const customMap = new Map(
    achievements.custom.map((item) => [
      item.id,
      {
        id: item.id,
        kind: 'custom' as const,
        title: item.title,
        organization: item.organization,
        receivedDate: item.receivedDate,
        description: item.description,
        href: routes.achievementHref(item.id),
        customType: item.type,
      },
    ])
  )

  const credentialMap = new Map(credentials.map((item) => [item.id, item]))

  return achievements.featured
    .map((item) => item.kind === 'custom' ? customMap.get(item.id) : credentialMap.get(item.id))
    .filter(Boolean) as DisplayAchievement[]
}

function isFeatured(achievements: AchievementsSection, id: string, kind: 'custom' | 'credential') {
  return achievements.featured.some((item) => item.id === id && item.kind === kind)
}

function toggleFeatured(
  achievements: AchievementsSection,
  ref: AchievementFeaturedRef
) {
  const exists = isFeatured(achievements, ref.id, ref.kind)
  if (exists) {
    return {
      ...achievements,
      featured: achievements.featured.filter((item) => !(item.id === ref.id && item.kind === ref.kind)),
    }
  }

  return {
    ...achievements,
    featured: [...achievements.featured, ref].slice(0, MAX_FEATURED_ACHIEVEMENTS),
  }
}

function createEmptyCustomAchievement(): CustomAchievement {
  return {
    id: createId('achievement'),
    type: 'award',
    title: '',
    organization: '',
    receivedDate: '',
    description: '',
  }
}

function AchievementSquare({
  imageUrl,
  customType,
  title,
}: {
  imageUrl?: string
  customType?: CustomAchievementType
  title: string
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-[18px] bg-gray-100">
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      </div>
    )
  }

  const config = getCustomTypeConfig(customType || 'award')
  const Icon = config.icon

  return (
    <div className={`flex aspect-square w-full items-center justify-center rounded-[18px] ${config.bg}`}>
      <Icon className={`h-9 w-9 ${config.fg}`} />
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
      <p className="text-base font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  )
}

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="text-2xl font-semibold text-gray-950">{title}</h2>
      {action}
    </div>
  )
}

function CardActionButton({
  active = false,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`rounded-full p-2 backdrop-blur-sm transition-colors ${
        active
          ? 'bg-amber-50/95 text-amber-500'
          : 'bg-white/90 text-gray-500 hover:bg-white hover:text-gray-900'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function AchievementCard({
  item,
  overlayActions,
  footerAction,
  widthClass = '',
}: {
  item: DisplayAchievement
  overlayActions?: React.ReactNode
  footerAction?: React.ReactNode
  widthClass?: string
}) {
  return (
    <div className={`group ${widthClass}`}>
      <Link href={item.href} className="block">
        <div className="relative">
          <AchievementSquare imageUrl={item.imageUrl} customType={item.customType} title={item.title} />
          {overlayActions ? (
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              {overlayActions}
            </div>
          ) : null}
        </div>
      </Link>
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <Link href={item.href} className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-gray-950 transition-colors group-hover:text-black">
            {item.title || 'Untitled achievement'}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-gray-500">
            {item.organization || 'Organization'}
          </p>
          {item.receivedDate ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDisplayDate(item.receivedDate)}</span>
            </div>
          ) : null}
        </Link>
        {footerAction ? <div className="shrink-0">{footerAction}</div> : null}
      </div>
    </div>
  )
}

function useCredentialAchievements(orgslug: string) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token

  const { data, error, isLoading } = useSWR(
    accessToken && org?.id ? `${getAPIUrl()}certifications/user/all?org_id=${org.id}` : null,
    (url: string) => swrFetcher(url, accessToken)
  )

  const credentials = useMemo(
    () => {
      const rawCertificates = Array.isArray(data) ? data : data?.data || []
      return normalizeCredentialAchievements(rawCertificates, orgslug)
    },
    [data, orgslug]
  )

  return {
    credentials,
    org,
    accessToken,
    isLoading,
    error,
    session,
  }
}

function AchievementFormDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSave,
  isEditing,
}: {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange(open: boolean): void
  value: CustomAchievement
  // eslint-disable-next-line no-unused-vars
  onChange(next: CustomAchievement): void
  onSave: () => void
  isEditing: boolean
}) {
  const typeConfig = getCustomTypeConfig(value.type)
  const TypeIcon = typeConfig.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b border-gray-100 px-6 py-5">
          <DialogTitle>{isEditing ? 'Edit achievement' : 'Add achievement'}</DialogTitle>
          <DialogDescription>
            Create a custom achievement for highlights, speaking gigs, certifications, or milestones outside the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Preview</p>
            <div className="rounded-[20px] bg-gray-50 p-4">
              <AchievementSquare customType={value.type} title={value.title || 'Achievement'} />
              <div className="mt-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <TypeIcon className="h-4 w-4" />
                  <span>{typeConfig.label}</span>
                </div>
                <p className="text-sm font-semibold text-gray-950">{value.title || 'Achievement title'}</p>
                <p className="text-sm text-gray-500">{value.organization || 'Organization'}</p>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-4 pr-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-gray-700">Achievement type</span>
              <Select value={value.type} onValueChange={(next) => onChange({ ...value, type: next as CustomAchievementType })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_ACHIEVEMENT_TYPES.map((option) => {
                    const Icon = option.icon
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-gray-700">Title</span>
              <Input
                value={value.title}
                onChange={(event) => onChange({ ...value, title: event.target.value })}
                placeholder="Achievement title"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-gray-700">Conferring organization</span>
              <Input
                value={value.organization}
                onChange={(event) => onChange({ ...value, organization: event.target.value })}
                placeholder="Organization name"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-gray-700">Received date</span>
              <Input
                type="date"
                value={value.receivedDate}
                onChange={(event) => onChange({ ...value, receivedDate: event.target.value })}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-gray-700">Description</span>
              <Textarea
                value={value.description}
                onChange={(event) => onChange({ ...value, description: event.target.value })}
                placeholder="Optional description"
                rows={5}
              />
            </label>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!value.title.trim() || !value.organization.trim()}
          >
            {isEditing ? 'Save changes' : 'Add achievement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FeaturedTray({
  items,
  onToggleFeatured,
  canEdit = true,
}: {
  items: DisplayAchievement[]
  // eslint-disable-next-line no-unused-vars
  onToggleFeatured(ref: AchievementFeaturedRef): void
  canEdit?: boolean
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No featured achievements yet"
        description="Star custom achievements or credentials below to pin them to your profile carousel."
      />
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {items.map((item) => (
        <AchievementCard
          key={`${item.kind}-${item.id}`}
          item={item}
          widthClass="w-[176px] min-w-[176px]"
          overlayActions={canEdit ? (
            <CardActionButton
              active
              aria-label="Remove from featured"
              onClick={(event) => {
                event.preventDefault()
                onToggleFeatured({ id: item.id, kind: item.kind })
              }}
            >
              <Star className="h-4 w-4 fill-current" />
            </CardActionButton>
          ) : undefined}
        />
      ))}
    </div>
  )
}

function CustomAchievementCard({
  achievement,
  featured,
  onToggleFeatured,
  onEdit,
  onDelete,
  href,
}: {
  achievement: CustomAchievement
  featured: boolean
  onToggleFeatured: () => void
  onEdit: () => void
  onDelete: () => void
  href: string
}) {
  const item: DisplayAchievement = {
    id: achievement.id,
    kind: 'custom',
    title: achievement.title,
    organization: achievement.organization,
    receivedDate: achievement.receivedDate,
    description: achievement.description,
    href,
    customType: achievement.type,
  }

  return (
    <AchievementCard
      item={item}
      overlayActions={(
        <>
          <CardActionButton
            active={featured}
            aria-label={featured ? 'Unstar achievement' : 'Star achievement'}
            onClick={(event) => {
              event.preventDefault()
              onToggleFeatured()
            }}
          >
            <Star className={`h-4 w-4 ${featured ? 'fill-current' : ''}`} />
          </CardActionButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <CardActionButton
                aria-label="Achievement actions"
                onClick={(event) => event.preventDefault()}
              >
                <MoreVertical className="h-4 w-4" />
              </CardActionButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    />
  )
}

function CredentialCard({
  credential,
  featured,
  onToggleFeatured,
}: {
  credential: CredentialAchievement
  featured: boolean
  onToggleFeatured: () => void
}) {
  const item: DisplayAchievement = {
    id: credential.id,
    kind: 'credential',
    title: credential.title,
    organization: credential.organization,
    receivedDate: credential.receivedDate,
    description: credential.description,
    href: credential.href,
    imageUrl: credential.imageUrl,
  }

  return (
    <AchievementCard
      item={item}
      overlayActions={(
        <>
          <CardActionButton
            active={featured}
            aria-label={featured ? 'Unstar credential' : 'Star credential'}
            onClick={(event) => {
              event.preventDefault()
              onToggleFeatured()
            }}
          >
            <Star className={`h-4 w-4 ${featured ? 'fill-current' : ''}`} />
          </CardActionButton>
          <CardActionButton
            aria-label="View credential"
            onClick={(event) => {
              event.preventDefault()
              window.location.href = credential.href
            }}
          >
            <ExternalLink className="h-4 w-4" />
          </CardActionButton>
        </>
      )}
    />
  )
}

export function ProfileAchievementsSection({
  achievements,
  orgslug,
  profileUsername,
  editMode = false,
  canEdit = true,
  onChange,
}: ProfileAchievementsSectionProps) {
  const routes = useMemo(() => getAchievementRoutes(orgslug, profileUsername), [orgslug, profileUsername])
  const { credentials } = useCredentialAchievements(orgslug)

  const featuredItems = useMemo(
    () => buildFeaturedAchievements(achievements, credentials, routes),
    [achievements, credentials, routes]
  )

  if (!editMode && !achievements.enabled) return null
  if (!editMode && achievements.enabled && featuredItems.length === 0) return null

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-gray-950">Achievements</h2>
          {editMode && canEdit ? (
            <div className="flex items-center gap-3">
              <Switch
                checked={achievements.enabled}
                onCheckedChange={(checked) => onChange?.({ ...achievements, enabled: checked })}
                aria-label="Toggle achievements section"
              />
              <span className="text-sm text-gray-500">{achievements.enabled ? 'Visible on profile' : 'Hidden from profile'}</span>
            </div>
          ) : null}
        </div>

        {editMode && canEdit ? (
          achievements.enabled ? (
            <Button asChild>
              <Link href={routes.achievementsHref}>
                Edit
              </Link>
            </Button>
          ) : null
        ) : (
          <Button variant="ghost" className="px-0 text-sm font-medium text-gray-500 hover:bg-transparent hover:text-gray-950" asChild>
            <Link href={routes.achievementsHref}>
              See all
            </Link>
          </Button>
        )}
      </div>

      {achievements.enabled ? (
        featuredItems.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {featuredItems.map((item) => (
              <AchievementCard key={`${item.kind}-${item.id}`} item={item} widthClass="w-[176px] min-w-[176px]" />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No featured achievements yet"
            description={editMode
              ? 'Use the edit screen to star custom achievements or credentials.'
              : 'Featured achievements will appear here once they are starred.'}
          />
        )
      ) : null}
    </section>
  )
}

export function ProfileAchievementsManager({
  initialUser,
  orgslug,
  profileUsername,
  canEdit = true,
}: ProfileAchievementsManagerProps) {
  const router = useRouter()
  const routes = useMemo(() => getAchievementRoutes(orgslug, profileUsername), [orgslug, profileUsername])
  const { credentials, accessToken, session, isLoading, error } = useCredentialAchievements(orgslug)
  const [achievements, setAchievements] = useState<AchievementsSection>(() => getAchievementsFromProfile(initialUser.profile))
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftAchievement, setDraftAchievement] = useState<CustomAchievement>(createEmptyCustomAchievement())
  const [editingAchievementId, setEditingAchievementId] = useState<string | null>(null)

  const featuredItems = useMemo(
    () => buildFeaturedAchievements(achievements, credentials, routes),
    [achievements, credentials, routes]
  )

  const openCreateDialog = () => {
    setEditingAchievementId(null)
    setDraftAchievement(createEmptyCustomAchievement())
    setDialogOpen(true)
  }

  const openEditDialog = (achievement: CustomAchievement) => {
    setEditingAchievementId(achievement.id)
    setDraftAchievement(achievement)
    setDialogOpen(true)
  }

  const saveDialog = () => {
    if (!draftAchievement.title.trim() || !draftAchievement.organization.trim()) {
      toast.error('Add a title and organization')
      return
    }

    setAchievements((current) => {
      const nextCustom = editingAchievementId
        ? current.custom.map((item) => item.id === editingAchievementId ? draftAchievement : item)
        : [draftAchievement, ...current.custom]
      return {
        ...current,
        custom: nextCustom,
      }
    })
    setDialogOpen(false)
  }

  const deleteCustomAchievement = (achievementId: string) => {
    setAchievements((current) => ({
      ...current,
      custom: current.custom.filter((item) => item.id !== achievementId),
      featured: current.featured.filter((item) => !(item.kind === 'custom' && item.id === achievementId)),
    }))
  }

  const persistAchievements = async () => {
    if (!accessToken) return

    setIsSaving(true)
    const loadingToast = toast.loading('Saving achievements')
    try {
      const payload = {
        ...initialUser,
        profile: {
          ...parseProfileValue(initialUser.profile),
          achievements,
        },
      }
      const res = await updateProfile(payload, initialUser.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      await session?.update?.(true)
      toast.success('Achievements saved', { id: loadingToast })
      router.refresh()
    } catch {
      toast.error('Could not save achievements', { id: loadingToast })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <Breadcrumbs items={[
            { label: 'Profile', href: routes.profileHref },
            { label: 'Achievements' },
          ]} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-semibold text-gray-950">Achievements</h1>

            {canEdit ? (
              <Button onClick={persistAchievements} disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save changes'}
              </Button>
            ) : null}
          </div>
        </div>

        <section className="rounded-[24px] bg-gray-50 px-5 py-5 sm:px-6">
          <SectionHeader title="Featured achievements" />
          <FeaturedTray
            items={featuredItems}
            canEdit={canEdit}
            onToggleFeatured={(ref) => setAchievements((current) => toggleFeatured(current, ref))}
          />
        </section>

        <section>
          <SectionHeader
            title="Custom"
            action={canEdit ? (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Add new
              </Button>
            ) : undefined}
          />

          {achievements.custom.length > 0 ? (
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {achievements.custom.map((achievement) => (
                canEdit ? (
                  <CustomAchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    featured={isFeatured(achievements, achievement.id, 'custom')}
                    onToggleFeatured={() => setAchievements((current) => toggleFeatured(current, { id: achievement.id, kind: 'custom' }))}
                    onEdit={() => openEditDialog(achievement)}
                    onDelete={() => deleteCustomAchievement(achievement.id)}
                    href={routes.achievementHref(achievement.id)}
                  />
                ) : (
                  <AchievementCard
                    key={achievement.id}
                    item={{
                      id: achievement.id,
                      kind: 'custom',
                      title: achievement.title,
                      organization: achievement.organization,
                      receivedDate: achievement.receivedDate,
                      description: achievement.description,
                      href: routes.achievementHref(achievement.id),
                      customType: achievement.type,
                    }}
                  />
                )
              ))}
            </div>
          ) : (
            <EmptyState
              title="No custom achievements yet"
              description="Custom achievements will appear here once they are added."
            />
          )}
        </section>

        <section>
          <SectionHeader title="Credentials" />

          {isLoading ? (
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item}>
                  <div className="aspect-square animate-pulse rounded-[18px] bg-gray-100" />
                  <div className="mt-2.5 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              title="Could not load credentials"
              description="Your earned credentials are still available elsewhere in the app, but they could not be loaded into achievements right now."
            />
          ) : credentials.length > 0 ? (
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {credentials.map((credential) => (
                canEdit ? (
                  <CredentialCard
                    key={credential.id}
                    credential={credential}
                    featured={isFeatured(achievements, credential.id, 'credential')}
                    onToggleFeatured={() => setAchievements((current) => toggleFeatured(current, { id: credential.id, kind: 'credential' }))}
                  />
                ) : (
                  <AchievementCard
                    key={credential.id}
                    item={{
                      id: credential.id,
                      kind: 'credential',
                      title: credential.title,
                      organization: credential.organization,
                      receivedDate: credential.receivedDate,
                      description: credential.description,
                      href: credential.href,
                      imageUrl: credential.imageUrl,
                    }}
                  />
                )
              ))}
            </div>
          ) : (
            <EmptyState
              title="No credentials earned yet"
              description="Course completion credentials will appear here automatically when they are available."
            />
          )}
        </section>
      </div>

      {canEdit ? (
        <AchievementFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          value={draftAchievement}
          onChange={setDraftAchievement}
          onSave={saveDialog}
          isEditing={Boolean(editingAchievementId)}
        />
      ) : null}
    </main>
  )
}

export function CustomAchievementDetail({
  initialUser,
  orgslug,
  achievementId,
  profileUsername,
}: CustomAchievementDetailProps) {
  const routes = getAchievementRoutes(orgslug, profileUsername)
  const achievements = getAchievementsFromProfile(initialUser.profile)
  const achievement = achievements.custom.find((item) => item.id === achievementId)

  if (!achievement) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Breadcrumbs items={[
            { label: 'Profile', href: routes.profileHref },
            { label: 'Achievements', href: routes.achievementsHref },
            { label: 'Not found' },
          ]} />
          <EmptyState
            title="Achievement not found"
            description="This custom achievement does not exist anymore or is not available on this profile."
          />
        </div>
      </main>
    )
  }

  const config = getCustomTypeConfig(achievement.type)
  const Icon = config.icon

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[
          { label: 'Profile', href: routes.profileHref },
          { label: 'Achievements', href: routes.achievementsHref },
          { label: achievement.title || 'Achievement' },
        ]} />

        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">
            <AchievementSquare customType={achievement.type} title={achievement.title} />
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.bg} ${config.fg}`}>
              <Icon className="h-4 w-4" />
              <span>{config.label}</span>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">{achievement.title || 'Achievement'}</h1>
              <p className="mt-2 text-base text-gray-500">{achievement.organization || 'Organization'}</p>
            </div>

            {achievement.receivedDate ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <span>Received {formatDisplayDate(achievement.receivedDate)}</span>
              </div>
            ) : null}

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-gray-700">
                {achievement.description || 'No description provided for this achievement.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
