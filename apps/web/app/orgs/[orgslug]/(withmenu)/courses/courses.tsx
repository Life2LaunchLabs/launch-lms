'use client'

import React, { useMemo } from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import ContentHeroSection, { ContentHeroButton } from '@components/Objects/StyledElements/Headers/ContentHeroSection'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import CollectionsOverviewSection from '@components/Pages/Courses/CollectionsOverviewSection'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import UserCertificates from '@components/Pages/Trail/UserCertificates'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import { Award, BadgeCheck } from 'lucide-react'
import useSWR from 'swr'

interface CourseProps {
  orgslug: string
  collections: any
  org_id: string | number
  view?: 'discover' | 'mine'
  inviteBadge?: string
  invitedBadgeCourse?: any
  orgConfig?: any
}

function isCourseEarned(run: any) {
  const totalSteps = Number(run?.course_total_steps || 0)
  const completedSteps = Array.isArray(run?.steps) ? run.steps.length : 0
  return totalSteps > 0 && completedSteps >= totalSteps
}

function getRunTimestamp(run: any) {
  const dateValue =
    run?.update_date ||
    run?.updated_at ||
    run?.modified_at ||
    run?.creation_date ||
    run?.created_at

  const timestamp = dateValue ? new Date(dateValue).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function cleanCourseUuid(courseUuid?: string | null) {
  return String(courseUuid || '').replace('course_', '')
}

function normalizeCourseUuid(courseUuid?: string | null) {
  const cleaned = cleanCourseUuid(courseUuid)
  return cleaned ? `course_${cleaned}` : ''
}

function getBadgeThumbnailSrc(course: any) {
  if (course?.thumbnail_image_url) return course.thumbnail_image_url
  if (course?.thumbnail_image) {
    return getCourseThumbnailMediaDirectory(
      course.owner_org_uuid || '',
      course.course_uuid,
      course.thumbnail_image
    )
  }
  return ''
}

function getRecommendedBadgeUuids(orgConfig: any, user: any) {
  const config = orgConfig?.config || orgConfig || {}
  const onboarding = user?.profile?.onboarding || {}
  const goal = onboarding?.next_step || 'not_sure'
  const storedRecommendations = Array.isArray(onboarding?.recommended_badges)
    ? onboarding.recommended_badges
    : []
  const orgRecommendations =
    config?.customization?.onboarding?.recommended_badges?.[goal] ||
    config?.onboarding?.recommended_badges?.[goal] ||
    []

  return (storedRecommendations.length ? storedRecommendations : orgRecommendations)
    .map((value: string) => normalizeCourseUuid(value))
    .filter(Boolean)
    .slice(0, 3)
}

function Courses(props: CourseProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const currentUser = session?.data?.user
  const activeView = props.view === 'mine' ? 'mine' : 'discover'

  const { data: trail } = useSWR(
    props.org_id && accessToken ? `${getAPIUrl()}trail/org/${props.org_id}/trail` : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const trailRunsByCourseUuid = useMemo(() => {
    const runs = trail?.runs || []
    return new Map<string, any>(
      runs.map((run: any) => [run.course.course_uuid, run] as [string, any])
    )
  }, [trail])
  const collectionCourses = useMemo(() => {
    return (props.collections || []).flatMap((collection: any) =>
      (collection.courses || []).map((course: any) => ({
        ...course,
        owner_org_uuid: course.owner_org_uuid || collection.owner_org_uuid,
      }))
    )
  }, [props.collections])
  const invitedBadge = useMemo(() => {
    if (!props.inviteBadge) return null
    const invitedBadgeUuid = cleanCourseUuid(props.inviteBadge)
    const collectionCourse = collectionCourses.find(
      (course: any) => cleanCourseUuid(course.course_uuid) === invitedBadgeUuid
    )
    if (collectionCourse) return collectionCourse
    if (cleanCourseUuid(props.invitedBadgeCourse?.course_uuid) === invitedBadgeUuid) {
      return props.invitedBadgeCourse
    }
    return null
  }, [collectionCourses, props.inviteBadge, props.invitedBadgeCourse])
  const inProgressBadge = useMemo(() => {
    return collectionCourses
      .map((course: any) => ({
        course,
        run: trailRunsByCourseUuid.get(course.course_uuid),
      }))
      .filter(({ run }: any) => run && !isCourseEarned(run))
      .sort((a: any, b: any) => getRunTimestamp(b.run) - getRunTimestamp(a.run))[0]
  }, [collectionCourses, trailRunsByCourseUuid])
  const recommendedBadges = useMemo(() => {
    const recommendedUuids = getRecommendedBadgeUuids(props.orgConfig, currentUser)
    if (!recommendedUuids.length) return []
    return recommendedUuids
      .map((courseUuid: string) => collectionCourses.find(
        (course: any) => normalizeCourseUuid(course.course_uuid) === courseUuid
      ))
      .filter(Boolean)
      .filter((course: any) => {
        const run = trailRunsByCourseUuid.get(course.course_uuid)
        return !isCourseEarned(run)
      })
  }, [collectionCourses, currentUser, props.orgConfig, trailRunsByCourseUuid])
  const heroBadge = invitedBadge
    ? { course: invitedBadge, trigger: 'invite' as const }
    : inProgressBadge
      ? { course: inProgressBadge.course, trigger: 'progress' as const }
      : null
  const showRecommendedHero = !heroBadge && recommendedBadges.length > 0

  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <ContentPageHeader
          orgslug={props.orgslug}
          tabs={[
            { href: routePaths.org.badges(), label: 'Discover', active: activeView === 'discover' },
            { href: routePaths.org.myBadges(), label: 'My Badges', active: activeView === 'mine' },
          ]}
        />
        <FeatureDisabledView
          featureName="collections"
          orgslug={props.orgslug}
          icon={BadgeCheck}
          context="public"
        >
          {activeView === 'discover' ? (
            <>
              <ContentHeroSection
                eyebrow={
                  heroBadge?.trigger === 'invite'
                    ? 'Badge invite accepted'
                    : heroBadge
                      ? 'In progress'
                      : showRecommendedHero
                        ? 'Recommended next'
                      : 'Start here'
                }
                title={
                  heroBadge?.trigger === 'invite'
                    ? `Ready to start ${heroBadge.course.name}`
                    : heroBadge
                      ? heroBadge.course.name
                      : showRecommendedHero
                        ? 'Start with one of these badges'
                      : 'Find a badge to get started'
                }
                body={
                  heroBadge?.trigger === 'invite'
                    ? (
                        heroBadge.course.description ||
                        heroBadge.course.about ||
                        'Review the badge path, then start when you are ready.'
                      )
                    : heroBadge
                      ? (heroBadge.course.description || heroBadge.course.about)
                      : showRecommendedHero
                        ? 'Your onboarding goal matched these starting badges. Pick any one, or choose another badge below.'
                      : 'Choose a badge path and complete the activities to earn your first badge.'
                }
                image={
                  heroBadge && getBadgeThumbnailSrc(heroBadge.course) ? (
                    <BadgeThumbnailImage
                      src={getBadgeThumbnailSrc(heroBadge.course)}
                      alt={heroBadge.course.name}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/65">
                      <Award size={42} strokeWidth={1.4} />
                    </div>
                  )
                }
                imageFrameClassName="overflow-visible bg-transparent"
              >
                {showRecommendedHero ? (
                  <div className="grid w-full gap-3 sm:grid-cols-3">
                    {recommendedBadges.map((course: any) => (
                      <a
                        key={course.course_uuid}
                        href={getUriWithOrg(props.orgslug, routePaths.org.course(cleanCourseUuid(course.course_uuid)))}
                        className="flex min-w-0 items-center gap-3 rounded-lg bg-white/12 p-3 text-left text-white ring-1 ring-white/20 transition-colors hover:bg-white/18"
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                          {getBadgeThumbnailSrc(course) ? (
                            <BadgeThumbnailImage
                              src={getBadgeThumbnailSrc(course)}
                              alt={course.name}
                            />
                          ) : (
                            <Award size={22} strokeWidth={1.6} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{course.name}</span>
                          <span className="block text-xs text-white/65">View details</span>
                        </span>
                      </a>
                    ))}
                  </div>
                ) : heroBadge && (
                  <ContentHeroButton
                    href={getUriWithOrg(
                      props.orgslug,
                      heroBadge.trigger === 'invite'
                        ? routePaths.org.course(cleanCourseUuid(heroBadge.course.course_uuid))
                        : routePaths.org.badgePath(cleanCourseUuid(heroBadge.course.course_uuid))
                    )}
                    label={heroBadge.trigger === 'invite' ? 'View badge' : 'Continue'}
                  />
                )}
              </ContentHeroSection>
              <CollectionsOverviewSection
                collections={props.collections || []}
                orgslug={props.orgslug}
                org_id={props.org_id}
                trailRunsByCourseUuid={trailRunsByCourseUuid}
              />
            </>
          ) : (
            <UserCertificates orgslug={props.orgslug} showHeader={false} />
          )}
        </FeatureDisabledView>
      </GeneralWrapperStyled>
    </div>
  )
}

export default Courses
