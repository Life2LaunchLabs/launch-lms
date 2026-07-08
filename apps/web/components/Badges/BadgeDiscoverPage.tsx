'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, Flag, Play } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { getLearningPath } from '@services/learning/learning'
import badgesImage from 'public/landing/badges.png'

type BadgeStatus = 'available' | 'in_progress' | 'earned'
type BadgePublishStatus = 'draft' | 'coming_soon' | 'published'

type BadgeCatalogItem = {
  badgeUuid: string
  name: string
  description: string
  thumbnailSrc: string
  ownerOrgUuid: string
  ownerOrgName: string
  activityCount: number
  status: BadgeStatus
  publishStatus: BadgePublishStatus
  progressPercent: number
  updatedAt: number
  path?: any
}

type BadgeDiscoverPageProps = {
  orgslug: string
  collections: any[]
}

function cleanBadgeUuid(value?: string | null) {
  return String(value || '').replace(/^(course_|badge_)/, '')
}

function getRunTimestamp(run: any, fallback?: any) {
  const dateValue =
    run?.update_date ||
    run?.updated_at ||
    run?.modified_at ||
    run?.completed_at ||
    run?.started_at ||
    run?.creation_date ||
    run?.created_at ||
    fallback?.update_date ||
    fallback?.updated_at ||
    fallback?.creation_date

  const timestamp = dateValue ? new Date(dateValue).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getBadgeThumbnailSrc(badge: any, ownerOrgUuid: string) {
  if (badge?.thumbnail_image_url) return badge.thumbnail_image_url
  if (badge?.thumbnail_image && ownerOrgUuid) {
    return getCourseThumbnailMediaDirectory(ownerOrgUuid, badge.course_uuid, badge.thumbnail_image)
  }
  return ''
}

function getBadgeActivityCount(badge: any) {
  if (Array.isArray(badge?.learnings)) return badge.learnings.length
  if (Array.isArray(badge?.chapters)) return badge.chapters.length
  if (Array.isArray(badge?.activities)) return badge.activities.length
  if (Array.isArray(badge?.path?.activities)) return badge.path.activities.length
  return Number(badge?.activity_count || badge?.activities_count || 0)
}

function getBadgePublishStatus(badge: any): BadgePublishStatus {
  const status = String(badge?.status || '').trim()
  if (status === 'coming_soon' || status === 'published' || status === 'draft') return status
  return 'draft'
}

function getPathActivityProgress(path: any) {
  const activities = path?.activities || []
  const run = path?.run
  const completePages = new Set(
    (run?.page_progress || [])
      .filter((progress: any) => progress?.complete)
      .map((progress: any) => progress.page_uuid)
  )

  const completedActivities = activities.filter((activity: any) => {
    const requiredPages = (activity.pages || []).filter((page: any) => page.required !== false)
    return requiredPages.length > 0 && requiredPages.every((page: any) => completePages.has(page.page_uuid))
  })
  const progressPercent = activities.length
    ? Math.round((completedActivities.length / activities.length) * 100)
    : 0
  const hasProgress = Boolean(run) || completedActivities.length > 0
  const earned = run?.status === 'completed' || Boolean(run?.completed_at || run?.award)

  return {
    activityCount: activities.length,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    hasProgress,
    earned,
    updatedAt: getRunTimestamp(run, path?.badge),
  }
}

function buildBadgeCatalog(collections: any[], pathsByBadgeUuid: Map<string, any>) {
  const byBadgeUuid = new Map<string, BadgeCatalogItem>()

  ;(collections || []).forEach((collection: any) => {
    ;(collection.courses || []).forEach((rawBadge: any) => {
      const badgeUuid = cleanBadgeUuid(rawBadge.course_uuid || rawBadge.badge_uuid)
      if (!badgeUuid || byBadgeUuid.has(badgeUuid)) return

      const ownerOrgUuid = rawBadge.owner_org_uuid || collection.owner_org_uuid || ''
      const publishStatus = getBadgePublishStatus(rawBadge)
      const path = pathsByBadgeUuid.get(badgeUuid)
      const progress = getPathActivityProgress(path)
      const status: BadgeStatus = progress.earned
        ? 'earned'
        : progress.hasProgress
          ? 'in_progress'
          : 'available'

      byBadgeUuid.set(badgeUuid, {
        badgeUuid,
        name: rawBadge.name || rawBadge.title || 'Untitled badge',
        description: rawBadge.description || rawBadge.about || '',
        thumbnailSrc: getBadgeThumbnailSrc(rawBadge, ownerOrgUuid),
        ownerOrgUuid,
        ownerOrgName: rawBadge.owner_org_name || collection.owner_org_name || collection.org?.name || '',
        activityCount: progress.activityCount || getBadgeActivityCount(rawBadge),
        status,
        publishStatus,
        progressPercent: progress.progressPercent,
        updatedAt: progress.updatedAt,
        path,
      })
    })
  })

  return Array.from(byBadgeUuid.values())
}

function badgeHref(orgslug: string, badgeUuid: string, target: 'overview' | 'path' = 'overview') {
  const path = target === 'path'
    ? routePaths.org.badgePath(badgeUuid)
    : `/badges/${badgeUuid}`
  return getUriWithOrg(orgslug, path)
}

function BadgeSticker({
  badge,
  size = 'md',
  hover = false,
}: {
  badge: BadgeCatalogItem
  size?: 'sm' | 'md' | 'lg'
  hover?: boolean
}) {
  const sizeClass = {
    sm: 'h-16 w-16',
    md: 'h-32 w-32',
    lg: 'h-36 w-36 sm:h-44 sm:w-44',
  }[size]

  return (
    <div className={cn('relative shrink-0 overflow-visible', sizeClass)}>
      {badge.thumbnailSrc ? (
        <BadgeThumbnailImage
          src={badge.thumbnailSrc}
          alt={badge.name}
          hoverScale={hover}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-muted-foreground">
          <Award size={size === 'sm' ? 24 : 38} strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}

function BadgesHero({ featuredBadge, orgslug }: { featuredBadge?: BadgeCatalogItem; orgslug: string }) {
  return (
    <section className="relative overflow-hidden bg-[var(--org-page-background)]">
      <div className="grid min-h-[116px] gap-3 py-2 md:grid-cols-[minmax(0,420px)_180px] md:items-center md:justify-between md:py-3 lg:grid-cols-[minmax(0,460px)_196px]">
        <div className="relative z-10 max-w-[420px] lg:max-w-[460px]">
          <h1 className="text-[36px] font-black leading-[0.9] tracking-normal text-foreground sm:text-[44px] lg:text-[50px]">
            <span className="block">Skills that</span>
            <span className="relative inline-block">
              <span className="absolute inset-x-[-0.08em] bottom-[0.08em] top-[0.46em] -z-10 rotate-[-1deg] bg-lime-300" />
              open
            </span>{' '}
            doors.
          </h1>
          <p className="mt-1.5 text-base font-medium leading-5 text-muted-foreground">
            Learn. Earn. Get recognized.
          </p>
        </div>
        <div className="relative hidden min-h-[112px] items-center justify-end overflow-visible md:flex">
          <img
            src={badgesImage.src}
            alt=""
            className="h-[128px] w-[128px] max-w-none object-contain lg:h-[148px] lg:w-[148px]"
          />
          {featuredBadge ? (
            <Link
              href={badgeHref(orgslug, featuredBadge.badgeUuid)}
              className="sr-only"
            >
              Explore featured badge
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ActiveBadgeCard({ badge, orgslug }: { badge: BadgeCatalogItem; orgslug: string }) {
  return (
    <Link
      href={badgeHref(orgslug, badge.badgeUuid, 'path')}
      className="group flex w-[280px] shrink-0 items-center gap-4 rounded-lg border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
    >
      <BadgeSticker badge={badge} size="sm" hover />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-bold leading-tight text-foreground">
          {badge.name}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--org-primary-color)]"
              style={{ width: `${badge.progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">{badge.progressPercent}%</span>
        </div>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-white transition group-hover:scale-105">
        <Play size={16} fill="currentColor" />
      </span>
    </Link>
  )
}

function DiscoverBadgeCard({ badge, orgslug }: { badge: BadgeCatalogItem; orgslug: string }) {
  const isComingSoon = badge.publishStatus === 'coming_soon'
  return (
    <Link
      href={badgeHref(orgslug, badge.badgeUuid)}
      className="group flex w-[150px] shrink-0 flex-col items-center text-center focus:outline-none"
    >
      <div className="relative flex h-[132px] w-[132px] items-center justify-center overflow-visible rounded-lg bg-transparent transition group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-foreground">
        <BadgeSticker badge={badge} size="md" hover />
        {isComingSoon ? (
          <span className="absolute right-0 top-1 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-black uppercase leading-none text-orange-700 ring-1 ring-orange-200">
            <Flag size={10} fill="currentColor" />
            Coming soon
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 w-full text-sm font-bold leading-tight text-foreground line-clamp-2">
        {badge.name}
      </div>
      <div className="mt-1 text-xs font-semibold leading-none text-muted-foreground">
        {badge.activityCount || 0} activities
      </div>
    </Link>
  )
}

function BadgeCarousel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-base font-black leading-tight text-foreground">{title}</h2>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  )
}

function EmptyBadgeState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[118px] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm font-semibold text-muted-foreground">
      {children}
    </div>
  )
}

function BadgeDiscoverContent({ orgslug, collections }: BadgeDiscoverPageProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  const badgeUuids = useMemo(() => {
    const seen = new Set<string>()
    ;(collections || []).forEach((collection: any) => {
      ;(collection.courses || []).forEach((badge: any) => {
        const badgeUuid = cleanBadgeUuid(badge.course_uuid || badge.badge_uuid)
        if (badgeUuid) seen.add(badgeUuid)
      })
    })
    return Array.from(seen)
  }, [collections])

  const { data: pathDetails } = useSWR(
    badgeUuids.length ? ['badge-paths', accessToken || 'public', ...badgeUuids] : null,
    async () => {
      const results = await Promise.all(
        badgeUuids.map(async (badgeUuid) => {
          try {
            return [badgeUuid, await getLearningPath(badgeUuid, accessToken, Boolean(accessToken))] as const
          } catch {
            return [badgeUuid, null] as const
          }
        })
      )
      return results
    },
    { revalidateOnFocus: false }
  )
  const progressReady = !badgeUuids.length || Boolean(pathDetails)

  const pathsByBadgeUuid = useMemo(() => {
    return new Map<string, any>(
      (pathDetails || [])
        .filter((entry: readonly [string, any]) => Boolean(entry[1]))
        .map((entry: readonly [string, any]) => entry)
    )
  }, [pathDetails])

  const badges = useMemo(
    () => buildBadgeCatalog(collections, pathsByBadgeUuid),
    [collections, pathsByBadgeUuid]
  )
  const activeBadges = useMemo(
    () => progressReady ? badges
      .filter((badge) => badge.status === 'in_progress')
      .sort((a, b) => b.updatedAt - a.updatedAt) : [],
    [badges, progressReady]
  )
  const featuredBadges = useMemo(
    () => progressReady ? badges.filter((badge) => badge.status === 'available') : [],
    [badges, progressReady]
  )

  return (
    <div className="flex flex-col gap-4 pb-10 pt-5 md:pt-0">
      <BadgesHero featuredBadge={featuredBadges[0]} orgslug={orgslug} />

      <BadgeCarousel title="Pick up where you left off">
        {activeBadges.length ? (
          activeBadges.map((badge) => (
            <ActiveBadgeCard key={badge.badgeUuid} badge={badge} orgslug={orgslug} />
          ))
        ) : (
          <EmptyBadgeState>
            {progressReady ? 'Start a badge and it will appear here.' : 'Loading active badges...'}
          </EmptyBadgeState>
        )}
      </BadgeCarousel>

      <BadgeCarousel title="Featured">
        {featuredBadges.length ? (
          featuredBadges.map((badge) => (
            <DiscoverBadgeCard key={badge.badgeUuid} badge={badge} orgslug={orgslug} />
          ))
        ) : (
          <EmptyBadgeState>
            {progressReady ? 'No new badges are available right now.' : 'Loading featured badges...'}
          </EmptyBadgeState>
        )}
      </BadgeCarousel>
    </div>
  )
}

export default function BadgeDiscoverPage(props: BadgeDiscoverPageProps) {
  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <ContentPageHeader
          orgslug={props.orgslug}
          noBottomMargin
          tabs={[
            { href: routePaths.org.badges(), label: 'Discover', active: true },
            { href: routePaths.org.myBadges(), label: 'My Badges', active: false },
          ]}
        />
        <FeatureDisabledView
          featureName="collections"
          orgslug={props.orgslug}
          icon={Award}
          context="public"
        >
          <BadgeDiscoverContent {...props} />
        </FeatureDisabledView>
      </GeneralWrapperStyled>
    </div>
  )
}
