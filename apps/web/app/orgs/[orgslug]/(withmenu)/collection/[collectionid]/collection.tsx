'use client'

import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import { ArrowLeft, Award } from 'lucide-react'
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

function CollectionProgressGauge({
  earned,
  started,
  total,
}: {
  earned: number
  started: number
  total: number
}) {
  const remaining = Math.max(total - earned - started, 0)
  const earnedWidth = total > 0 ? (earned / total) * 100 : 0
  const startedWidth = total > 0 ? (started / total) * 100 : 0

  return (
    <div className="mx-auto w-full max-w-md pt-6">
      <div className="mb-3 grid grid-cols-3 gap-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <span>{earned} earned</span>
        <span>{started} started</span>
        <span>{remaining} remaining</span>
      </div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
        aria-label={`${earned} earned and ${started} started out of ${total} badges`}
      >
        <div className="h-full bg-green-500" style={{ width: `${earnedWidth}%` }} />
        <div className="h-full bg-gray-800" style={{ width: `${startedWidth}%` }} />
      </div>
    </div>
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
  const progress = getCourseProgress(run)
  const showProgress = progress.isStarted && !progress.isEarned

  return (
    <Link href={courseLink} className="group block focus:outline-none">
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-transparent">
        {course.thumbnail_image && ownerOrgUuid ? (
          <img
            src={getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, course.thumbnail_image)}
            alt={course.name}
            className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${
              progress.isEarned ? '' : 'opacity-55 grayscale brightness-110'
            }`}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center rounded-lg bg-gray-50 text-gray-300 ${
              progress.isEarned ? '' : 'opacity-60 grayscale'
            }`}
          >
            <Award size={42} strokeWidth={1.4} />
          </div>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full">
        {showProgress && (
          <div className="h-full w-full bg-gray-100">
            <div className="h-full bg-gray-800" style={{ width: `${progress.percent}%` }} />
          </div>
        )}
      </div>
      <h2 className="mt-2 text-center text-sm font-semibold leading-snug text-gray-950 transition-colors group-hover:text-gray-600">
        {course.name}
      </h2>
    </Link>
  )
}

const CollectionClient = ({ orgslug, collectionid }: { orgslug: string; collectionid: string }) => {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any

  const { data: col } = useSWR(
    collectionid && access_token ? [`collections/collection_${collectionid}`, access_token] : null,
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

  if (!col) return <PageLoading />

  const courses = col.courses || []
  const progress = getCollectionProgress(courses, trailRunsByCourseUuid)
  const creatorName = col.owner_org_name || org?.name

  return (
    <GeneralWrapperStyled>
      <div className="mb-10">
        <Link
          href={getUriWithOrg(orgslug, routePaths.org.badges())}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      <header className="mx-auto mb-12 flex max-w-3xl flex-col items-center text-center">
        {creatorName && (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            {creatorName}
          </p>
        )}
        <h1 className="mt-3 text-4xl font-semibold leading-tight text-gray-950 sm:text-5xl">
          {col.name}
        </h1>
        {col.description && (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-500">
            {col.description}
          </p>
        )}
        <CollectionProgressGauge
          earned={progress.earned}
          started={progress.started}
          total={courses.length}
        />
      </header>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
        {courses.map((course: any) => (
          <BadgeCourseTile
            key={course.course_uuid}
            course={course}
            orgslug={orgslug}
            run={trailRunsByCourseUuid.get(course.course_uuid)}
            fallbackOrgUuid={col.owner_org_uuid || org?.org_uuid}
          />
        ))}
        {courses.length === 0 && (
          <div className="col-span-full flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-gray-100 text-sm font-medium text-gray-400">
            No badges in this collection
          </div>
        )}
      </div>
    </GeneralWrapperStyled>
  )
}

export default CollectionClient
