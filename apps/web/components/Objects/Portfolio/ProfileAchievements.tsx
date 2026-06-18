'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Calendar, Loader2, Star } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { getUriWithOrg, routePaths, getAPIUrl } from '@services/config/config'
import { getCourseThumbnailMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { updateProfile } from '@services/settings/portfolio'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

export type AchievementFeaturedRef = {
  id: string
  kind: 'credential'
}

export type AchievementsSection = {
  enabled: boolean
  publicVisible: boolean
  custom: []
  featured: AchievementFeaturedRef[]
}

type BadgeCredential = {
  id: string
  title: string
  organization: string
  receivedDate: string
  description: string
  imageUrl: string
  href: string
  raw: any
}

type ProfileShape = {
  achievements?: any
}

type ProfileAchievementsSectionProps = {
  achievements: AchievementsSection
  orgslug: string
  profileUsername?: string
  grid?: { w: number; h: number }
  editMode?: boolean
  canEdit?: boolean
  publicVisible?: boolean
  // eslint-disable-next-line no-unused-vars
  onChange?(next: AchievementsSection): void
  // eslint-disable-next-line no-unused-vars
  onPublicVisibleChange?(visible: boolean): void
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

const MAX_FEATURED_BADGES = 12

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

export function normalizeAchievements(achievements: any): AchievementsSection {
  const featured = Array.isArray(achievements?.featured)
    ? achievements.featured
      .filter((item: any) => item?.id && item?.kind === 'credential')
      .slice(0, MAX_FEATURED_BADGES)
      .map((item: any) => ({
        id: String(item.id),
        kind: 'credential' as const,
      }))
    : []

  return {
    enabled: achievements?.enabled !== false,
    publicVisible: achievements?.publicVisible !== false,
    custom: [],
    featured,
  }
}

function getAchievementsFromProfile(profile: ProfileShape | undefined | null) {
  return normalizeAchievements(profile?.achievements)
}

function getBadgeRoutes(orgslug: string, profileUsername?: string) {
  if (profileUsername) {
    return {
      profileHref: getUriWithOrg(orgslug, routePaths.org.user(profileUsername)),
      badgesHref: getUriWithOrg(orgslug, routePaths.org.userAchievements(profileUsername)),
    }
  }

  return {
    profileHref: getUriWithOrg(orgslug, routePaths.org.portfolio()),
    badgesHref: getUriWithOrg(orgslug, routePaths.org.portfolioAchievements()),
  }
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
    || 'Badge'
}

function getCredentialDescription(credential: any) {
  return credential.badge_class?.description
    || credential.certification?.config?.badge_description
    || credential.certification?.config?.certification_description
    || ''
}

function getCredentialImage(credential: any) {
  const courseThumbnailUrl = credential.course?.thumbnail_image && credential.org?.org_uuid
    ? getCourseThumbnailMediaDirectory(
        credential.org.org_uuid,
        credential.course.course_uuid,
        credential.course.thumbnail_image
      )
    : ''

  return courseThumbnailUrl
    || normalizeMediaUrl(credential.badge_class?.image)
    || normalizeMediaUrl(credential.certification?.config?.badge_image_url)
    || normalizeMediaUrl(credential.issuer?.image)
    || '/empty_thumbnail.png'
}

export function normalizeBadgeCredential(credential: any, orgslug: string): BadgeCredential | null {
  const id = credential?.certificate_user?.user_certification_uuid
  if (!id) return null

  return {
    id,
    title: getCredentialTitle(credential),
    organization: credential.issuer?.name || credential.organization?.name || credential.org?.name || 'LaunchLMS',
    receivedDate: credential.certificate_user?.created_at || '',
    description: getCredentialDescription(credential),
    imageUrl: getCredentialImage(credential),
    href: getUriWithOrg(orgslug, routePaths.org.badgesVerify(id)),
    raw: credential,
  }
}

function isFeaturedBadge(achievements: AchievementsSection, badgeId: string) {
  return achievements.featured.some((item) => item.id === badgeId)
}

function toggleFeaturedBadge(achievements: AchievementsSection, badgeId: string) {
  if (isFeaturedBadge(achievements, badgeId)) {
    return {
      ...achievements,
      featured: achievements.featured.filter((item) => item.id !== badgeId),
    }
  }

  return {
    ...achievements,
    enabled: true,
    featured: [...achievements.featured, { id: badgeId, kind: 'credential' as const }].slice(0, MAX_FEATURED_BADGES),
  }
}

async function fetchFeaturedBadges(ids: string[], orgslug: string) {
  const settled = await Promise.allSettled(
    ids.map((id) => swrFetcher(`${getAPIUrl()}certifications/certificate/${id}`))
  )

  const badges = settled
    .map((result) => result.status === 'fulfilled' ? normalizeBadgeCredential(result.value, orgslug) : null)
    .filter(Boolean) as BadgeCredential[]
  const byId = new Map(badges.map((badge) => [badge.id, badge]))

  return ids.map((id) => byId.get(id)).filter(Boolean) as BadgeCredential[]
}

export function useFeaturedBadges(achievements: AchievementsSection, orgslug: string) {
  const ids = useMemo(
    () => achievements.featured.map((item) => item.id),
    [achievements.featured]
  )
  const key = ids.length > 0 ? ['featured-badges', orgslug, ids.join('|')] : null

  const { data, error, isLoading } = useSWR(
    key,
    () => fetchFeaturedBadges(ids, orgslug),
    { revalidateOnFocus: false }
  )

  return {
    badges: data || [],
    error,
    isLoading,
  }
}

export function useFeaturedBadgeToggle(badgeId?: string | null) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const user = session?.data?.user
  const [localAchievements, setLocalAchievements] = useState<AchievementsSection | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const achievements = localAchievements || normalizeAchievements(parseProfileValue(user?.profile).achievements)
  const featured = badgeId ? isFeaturedBadge(achievements, badgeId) : false

  const toggle = async () => {
    if (!badgeId || !accessToken || !user || isSaving) return

    const nextAchievements = toggleFeaturedBadge(achievements, badgeId)
    setLocalAchievements(nextAchievements)
    setIsSaving(true)

    try {
      const payload = {
        ...user,
        profile: {
          ...parseProfileValue(user.profile),
          achievements: nextAchievements,
        },
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      await session?.update?.(true)
      router.refresh()
      toast.success(featured ? 'Badge unfeatured' : 'Badge featured')
    } catch {
      setLocalAchievements(achievements)
      toast.error('Could not update featured badge')
    } finally {
      setIsSaving(false)
    }
  }

  return {
    featured,
    isSaving,
    canToggle: Boolean(badgeId && accessToken && user),
    toggle,
  }
}

export function FeaturedBadgeButton({
  badgeId,
  className,
}: {
  badgeId?: string | null
  className?: string
}) {
  const { featured, isSaving, canToggle, toggle } = useFeaturedBadgeToggle(badgeId)
  if (!canToggle) return null

  return (
    <button
      type="button"
      data-featured={featured ? 'true' : undefined}
      aria-label={featured ? 'Unfeature badge' : 'Feature badge'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      disabled={isSaving}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-gray-500 shadow-sm ring-1 ring-gray-200 backdrop-blur transition hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-70',
        featured && 'text-amber-500',
        className
      )}
    >
      {isSaving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Star className={cn('h-4 w-4', featured && 'fill-current')} />
      )}
    </button>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
      <p className="text-base font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function BadgeSquare({ badge }: { badge: BadgeCredential }) {
  return (
    <div className="aspect-square w-full overflow-visible rounded-lg bg-transparent">
      <BadgeThumbnailImage
        src={badge.imageUrl}
        alt={badge.title}
        onError={(event) => {
          event.currentTarget.src = '/empty_thumbnail.png'
        }}
      />
    </div>
  )
}

function BadgeCard({
  badge,
  widthClass = '',
  compact = false,
  showDate = true,
  action,
}: {
  badge: BadgeCredential
  widthClass?: string
  compact?: boolean
  showDate?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className={cn('group', widthClass)}>
      <Link href={badge.href} className="block">
        <div className="relative">
          <BadgeSquare badge={badge} />
          {action ? <div className="absolute right-3 top-3 z-10">{action}</div> : null}
        </div>
        <h3 className={cn(
          'mt-2 line-clamp-2 text-center font-semibold leading-snug text-gray-950 transition-colors group-hover:text-gray-600',
          compact ? 'text-xs' : 'text-sm'
        )}>
          {badge.title}
        </h3>
        {!compact ? (
          <p className="mt-1 line-clamp-1 text-center text-sm text-gray-500">{badge.organization}</p>
        ) : null}
        {showDate && badge.receivedDate && !compact ? (
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDisplayDate(badge.receivedDate)}</span>
          </div>
        ) : null}
      </Link>
    </div>
  )
}

function BadgeListRow({ badge }: { badge: BadgeCredential }) {
  return (
    <Link
      href={badge.href}
      className="flex min-w-0 items-center gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
    >
      <div className="h-9 w-9 shrink-0">
        <BadgeSquare badge={badge} />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-950">
        {badge.title}
      </p>
    </Link>
  )
}

function BadgeThumbnailStrip({
  badges,
  dense = false,
}: {
  badges: BadgeCredential[]
  dense?: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 justify-center gap-2 overflow-x-auto overflow-y-hidden">
      {badges.map((badge) => (
        <Link
          key={badge.id}
          href={badge.href}
          aria-label={badge.title}
          className={cn(
            'block aspect-square h-full max-h-full min-h-0 shrink-0 overflow-visible rounded-lg bg-transparent',
            dense ? 'max-h-[58px]' : 'max-h-[112px]'
          )}
        >
          <BadgeThumbnailImage
            src={badge.imageUrl}
            alt={badge.title}
            onError={(event) => {
              event.currentTarget.src = '/empty_thumbnail.png'
            }}
          />
        </Link>
      ))}
    </div>
  )
}

function ShortBadgeCard({ badge }: { badge: BadgeCredential }) {
  return (
    <Link
      href={badge.href}
      className="flex h-full min-h-0 w-[132px] min-w-[112px] shrink-0 flex-col items-center"
    >
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <div className="aspect-square h-full max-h-full overflow-visible rounded-lg bg-transparent">
          <BadgeThumbnailImage
            src={badge.imageUrl}
            alt={badge.title}
            onError={(event) => {
              event.currentTarget.src = '/empty_thumbnail.png'
            }}
          />
        </div>
      </div>
      <p className="mt-1 line-clamp-2 shrink-0 text-center text-xs font-semibold leading-4 text-gray-950">
        {badge.title}
      </p>
    </Link>
  )
}

export function ProfileAchievementsSection({
  achievements,
  orgslug,
  profileUsername,
  grid,
  editMode = false,
  canEdit = true,
  publicVisible = true,
  onChange,
  onPublicVisibleChange,
}: ProfileAchievementsSectionProps) {
  const routes = useMemo(() => getBadgeRoutes(orgslug, profileUsername), [orgslug, profileUsername])
  const { badges, isLoading } = useFeaturedBadges(achievements, orgslug)

  if (!editMode && (!achievements.enabled || !publicVisible)) return null
  if (!editMode && achievements.enabled && badges.length === 0 && !isLoading) return null

  const isCompact = grid?.h === 1
  const isNarrow = grid?.w === 1
  const isShortWide = !isNarrow && (grid?.h ?? 3) <= 2

  return (
    <section className={cn(
      'flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-gray-100 bg-white shadow-sm',
      isCompact ? 'p-3' : 'p-4'
    )}>
      <div className={`${isCompact ? 'mb-2' : 'mb-3'} flex shrink-0 items-center justify-between gap-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <h2 className={`${isCompact ? 'text-base' : isNarrow ? 'text-base uppercase text-blue-900' : 'text-2xl'} min-w-0 truncate font-semibold ${isNarrow ? '' : 'text-gray-950'}`}>
            {isCompact ? badges[0]?.title || 'Badges' : 'Badges'}
          </h2>
          {!isCompact && editMode && canEdit && achievements.enabled ? (
            <Button asChild variant="outline" size="sm">
              <Link href={routes.badgesHref}>Edit</Link>
            </Button>
          ) : null}
        </div>

        {isCompact ? (
          null
        ) : editMode && canEdit ? (
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{achievements.enabled ? 'On your profile' : 'Hidden from profile'}</span>
              <Switch
                checked={achievements.enabled}
                onCheckedChange={(checked) => onChange?.({ ...achievements, enabled: checked })}
                aria-label="Toggle badges section"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{publicVisible ? 'Visible to others' : 'Hidden from others'}</span>
              <Switch
                checked={publicVisible}
                onCheckedChange={onPublicVisibleChange}
                disabled={!achievements.enabled}
                aria-label="Toggle public badges visibility"
              />
            </label>
          </div>
        ) : (
          <Button variant="ghost" className="px-0 text-sm font-medium text-gray-500 hover:bg-transparent hover:text-gray-950" asChild>
            <Link href={routes.badgesHref}>{isCompact ? 'Open' : 'See all'}</Link>
          </Button>
        )}
      </div>

      {achievements.enabled ? (
        isLoading ? (
          <div className={cn('flex min-h-0 flex-1 gap-3 overflow-hidden', isCompact && 'gap-2')}>
            {[1, 2, 3].map((item) => (
              <div key={item} className="aspect-square h-full max-h-full min-h-0 shrink-0 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : badges.length > 0 ? (
          isCompact ? (
            <BadgeThumbnailStrip badges={badges} dense />
          ) : isShortWide ? (
            <div className="flex min-h-0 flex-1 justify-center gap-4 overflow-x-auto overflow-y-hidden">
              {badges.map((badge) => (
                <ShortBadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          ) : isNarrow ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {badges.map((badge) => (
                <BadgeListRow key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 justify-center gap-4 overflow-x-auto overflow-y-hidden pb-2">
              {badges.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  widthClass="w-[176px] min-w-[176px]"
                  showDate={false}
                />
              ))}
            </div>
          )
        ) : (
          isCompact || isShortWide ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-center text-xs font-medium text-gray-500">
              No featured badges
            </div>
          ) : (
            <EmptyState
              title="No featured badges yet"
              description="Feature earned badges to show them here."
              action={editMode && canEdit ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={getUriWithOrg(orgslug, routePaths.org.badges()) + '?view=mine'}>Choose badges</Link>
                </Button>
              ) : undefined}
            />
          )
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
  const routes = useMemo(() => getBadgeRoutes(orgslug, profileUsername), [orgslug, profileUsername])
  const achievements = useMemo(() => getAchievementsFromProfile(initialUser.profile), [initialUser.profile])
  const { badges, isLoading, error } = useFeaturedBadges(achievements, orgslug)

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <Breadcrumbs items={[
            { label: 'Portfolio', href: routes.profileHref },
            { label: 'Badges' },
          ]} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">Badges</h1>
              <p className="mt-2 text-sm text-gray-500">Featured badges appear on your profile.</p>
            </div>

            {canEdit ? (
              <Button asChild>
                <Link href={getUriWithOrg(orgslug, routePaths.org.badges()) + '?view=mine'}>Choose badges</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <section className="rounded-lg bg-gray-50 px-5 py-5 sm:px-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-gray-950">Featured badges</h2>
          </div>

          {isLoading ? (
            <div className="flex gap-4 overflow-hidden pb-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="w-[176px] min-w-[176px]">
                  <div className="aspect-square animate-pulse rounded-lg bg-gray-100" />
                  <div className="mx-auto mt-3 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              title="Could not load featured badges"
              description="Your featured badge list is saved, but the badge details could not be loaded right now."
            />
          ) : badges.length > 0 ? (
            <div className="flex justify-center gap-4 overflow-x-auto pb-2">
              {badges.map((badge) => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  widthClass="w-[176px] min-w-[176px]"
                  action={canEdit ? (
                    <FeaturedBadgeButton badgeId={badge.id} className="opacity-100" />
                  ) : undefined}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No featured badges yet"
              description="Use the star on an earned badge to feature it on your profile."
            />
          )}
        </section>
      </div>
    </main>
  )
}

export function CustomAchievementDetail({
  orgslug,
  profileUsername,
}: CustomAchievementDetailProps) {
  const routes = getBadgeRoutes(orgslug, profileUsername)

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[
          { label: 'Portfolio', href: routes.profileHref },
          { label: 'Badges', href: routes.badgesHref },
          { label: 'Not found' },
        ]} />
        <EmptyState
          title="Badge not found"
          description="Manual achievements are no longer used. Feature earned badges from your badges page instead."
          action={(
            <Button asChild variant="outline">
              <Link href={routes.badgesHref}>Back to badges</Link>
            </Button>
          )}
        />
      </div>
    </main>
  )
}
