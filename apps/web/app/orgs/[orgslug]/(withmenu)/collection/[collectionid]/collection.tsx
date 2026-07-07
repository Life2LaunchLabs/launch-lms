'use client'

import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import ContentHeroSection, { ContentHeroSegmentedProgress } from '@components/Objects/StyledElements/Headers/ContentHeroSection'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import CollectionCoverFanThumbnail from '@components/Objects/Thumbnails/CollectionCoverFanThumbnail'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getCollectionThumbnailMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import { Award } from 'lucide-react'
import Link from 'next/link'
import React, { useMemo } from 'react'
import useSWR from 'swr'

const removeCoursePrefix = (courseUuid: string) => courseUuid.replace('course_', '')

function getCourseProgress(run: any) {
  const totalSteps = Number(run?.course_total_steps || 0)
  const completedSteps = Array.isArray(run?.steps) ? run.steps.length : 0
  const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return {
    percent: Math.max(0, Math.min(100, percent)),
    isStarted: Boolean(run),
    isEarned: totalSteps > 0 && completedSteps >= totalSteps,
  }
}

function getCollectionProgress(courses: any[], trailRunsByCourseUuid?: Map<string, any>) {
  return courses.reduce(
    (progress: { earned: number; started: number }, course: any) => {
      const courseProgress = getCourseProgress(trailRunsByCourseUuid?.get(course.course_uuid))

      if (!courseProgress.isStarted) return progress

      if (courseProgress.isEarned) {
        progress.earned += 1
      } else {
        progress.started += 1
      }

      return progress
    },
    { earned: 0, started: 0 }
  )
}

function BadgeCourseTile({
  course,
  orgslug,
  run,
  fallbackOrgUuid,
}: {
  course: any
  orgslug: string
  run?: any
  fallbackOrgUuid?: string
}) {
  const courseLink = getUriWithOrg(orgslug, routePaths.org.course(removeCoursePrefix(course.course_uuid)))
  const ownerOrgUuid = course.owner_org_uuid || fallbackOrgUuid
  const thumbnailSrc = course.thumbnail_image_url || (
    course.thumbnail_image && ownerOrgUuid
      ? getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, course.thumbnail_image)
      : ''
  )
  const progress = getCourseProgress(run)
  const showProgress = progress.isStarted && !progress.isEarned

  return (
    <Link href={courseLink} className="group block focus:outline-none">
      <div className="aspect-square w-full overflow-visible rounded-lg bg-transparent">
        {thumbnailSrc ? (
          <BadgeThumbnailImage
            src={thumbnailSrc}
            alt={course.name}
            hoverScale
            className={`${
              progress.isEarned ? '' : 'opacity-55 grayscale brightness-110'
            }`}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center rounded-lg bg-muted text-gray-300 ${
              progress.isEarned ? '' : 'opacity-60 grayscale'
            }`}
          >
            <Award size={42} strokeWidth={1.4} />
          </div>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full">
        {showProgress && (
          <div className="h-full w-full bg-muted">
            <div className="h-full bg-gray-800" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
      </div>
      <h2 className="mt-2 text-center text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-muted-foreground">
        {course.name}
      </h2>
    </Link>
  )
}

const CollectionClient = ({ orgslug, collectionid, initialCollection }: { orgslug: string; collectionid: string; initialCollection?: any }) => {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any

  const { data: col } = useSWR(
    !initialCollection && collectionid && access_token ? [`collections/collection_${collectionid}`, access_token] : null,
    ([, token]) => swrFetcher(`${getAPIUrl()}collections/collection_${collectionid}`, token)
  )
  const { data: trail } = useSWR(
    org?.id && access_token ? `${getAPIUrl()}trail/org/${org.id}/trail` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )
  const trailRunsByCourseUuid = useMemo(() => {
    const runs = trail?.runs || []
    return new Map<string, any>(
      runs.map((run: any) => [run.course.course_uuid, run] as [string, any])
    )
  }, [trail])

  const collection = initialCollection || col

  if (!collection) return <PageLoading />

  const courses = collection.courses || []
  const progress = getCollectionProgress(courses, trailRunsByCourseUuid)
  const creatorName = collection.owner_org_name || org?.name
  const ownerOrgUuid = collection.owner_org_uuid || org?.org_uuid

  return (
    <GeneralWrapperStyled>
      <ContentPageHeader
        orgslug={orgslug}
      />

      <ContentHeroSection
        eyebrow={creatorName}
        title={collection.name}
        body={collection.description}
        image={
          collection.thumbnail_image && ownerOrgUuid ? (
            <img
              src={getCollectionThumbnailMediaDirectory(ownerOrgUuid, collection.collection_uuid, collection.thumbnail_image)}
              alt={collection.name}
              className="h-full w-full object-cover"
            />
          ) : courses.length > 0 ? (
            <CollectionCoverFanThumbnail
              courses={courses}
              fallbackOrgUuid={ownerOrgUuid}
              className="p-2"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/65">
              <Award size={42} strokeWidth={1.4} />
            </div>
          )
        }
      >
        <ContentHeroSegmentedProgress
          directive={`Earn ${courses.length} badge${courses.length === 1 ? '' : 's'}`}
          earned={progress.earned}
          inProgress={progress.started}
          total={courses.length}
        />
      </ContentHeroSection>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
        {courses.map((course: any) => (
          <BadgeCourseTile
            key={course.course_uuid}
            course={course}
            orgslug={orgslug}
            run={trailRunsByCourseUuid.get(course.course_uuid)}
            fallbackOrgUuid={collection.owner_org_uuid || org?.org_uuid}
          />
        ))}
        {courses.length === 0 && (
          <div className="col-span-full flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground">
            No badges in this collection
          </div>
        )}
      </div>
    </GeneralWrapperStyled>
  )
}

export default CollectionClient
