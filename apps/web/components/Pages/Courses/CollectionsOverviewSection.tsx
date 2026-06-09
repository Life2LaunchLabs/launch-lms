'use client'

import ContentPlaceHolderIfUserIsNotAdmin from '@components/Objects/ContentPlaceHolder'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { Award, Library } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface CollectionsOverviewSectionProps {
  collections: any[]
  orgslug: string
  org_id: number | string
  trailRunsByCourseUuid?: Map<string, any>
}

const removeCollectionPrefix = (collectionUuid: string) => collectionUuid.replace('collection_', '')
const removeCoursePrefix = (courseUuid: string) => courseUuid.replace('course_', '')

function isCourseEarned(run: any) {
  const totalSteps = Number(run?.course_total_steps || 0)
  const completedSteps = Array.isArray(run?.steps) ? run.steps.length : 0
  return totalSteps > 0 && completedSteps >= totalSteps
}

function getCollectionProgress(collection: any, trailRunsByCourseUuid?: Map<string, any>) {
  const courses = collection.courses || []

  return courses.reduce(
    (progress: { earned: number; started: number }, course: any) => {
      const run = trailRunsByCourseUuid?.get(course.course_uuid)
      if (!run) return progress

      if (isCourseEarned(run)) {
        progress.earned += 1
      } else {
        progress.started += 1
      }

      return progress
    },
    { earned: 0, started: 0 }
  )
}

function BadgeThumbnailCard({
  course,
  orgslug,
  fallbackOrgUuid,
}: {
  course: any
  orgslug: string
  fallbackOrgUuid?: string
}) {
  const courseLink = getUriWithOrg(orgslug, routePaths.org.course(removeCoursePrefix(course.course_uuid)))
  const ownerOrgUuid = course.owner_org_uuid || fallbackOrgUuid

  return (
    <Link
      href={courseLink}
      onClick={(event) => event.stopPropagation()}
      className="group/badge block w-[168px] shrink-0 focus:outline-none"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover/badge:-translate-y-0.5 group-hover/badge:shadow-md group-focus-visible/badge:ring-2 group-focus-visible/badge:ring-gray-900">
        {course.thumbnail_image && ownerOrgUuid ? (
          <img
            src={getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, course.thumbnail_image)}
            alt={course.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/badge:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-50 text-gray-300">
            <Award size={34} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="mt-3 min-h-[2.15rem] text-center text-[13px] font-semibold leading-snug text-gray-950 line-clamp-2">
        {course.name}
      </div>
    </Link>
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
    <div className="w-full pt-5">
      <div className="mb-3 grid grid-cols-3 gap-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <span>{earned} earned</span>
        <span>{started} started</span>
        <span>{remaining} remaining</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-label={`${earned} earned and ${started} started out of ${total} badges`}>
        <div className="h-full bg-green-500" style={{ width: `${earnedWidth}%` }} />
        <div className="h-full bg-gray-800" style={{ width: `${startedWidth}%` }} />
      </div>
    </div>
  )
}

function CollectionsOverviewSection({
  collections,
  orgslug,
  trailRunsByCourseUuid,
}: CollectionsOverviewSectionProps) {
  const { t } = useTranslation()
  const router = useRouter()

  if (collections.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
        <div className="p-4 bg-white rounded-full nice-shadow mb-4">
          <Library className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-bold text-gray-600 mb-2">No badge collections yet</h1>
        <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
          <ContentPlaceHolderIfUserIsNotAdmin
            text={t('collections.create_collections_placeholder')}
          />
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {collections.map((collection: any) => {
        const courses = collection.courses || []
        const collectionId = removeCollectionPrefix(collection.collection_uuid)
        const collectionLink = getUriWithOrg(orgslug, routePaths.org.collection(collectionId))
        const progress = getCollectionProgress(collection, trailRunsByCourseUuid)

        return (
          <section
            key={collection.collection_uuid}
            role="button"
            tabIndex={0}
            onClick={() => router.push(collectionLink)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                router.push(collectionLink)
              }
            }}
            className="group grid h-[300px] cursor-pointer grid-cols-1 overflow-hidden rounded-lg border border-black/[0.04] bg-white shadow-[0_6px_22px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 lg:grid-cols-[minmax(360px,0.34fr)_minmax(0,1fr)]"
            aria-label={`View ${collection.name} collection`}
          >
            <div className="flex h-full flex-col items-center justify-center border-b border-gray-100/80 px-8 py-7 text-center lg:border-b-0 lg:border-r lg:border-gray-100 lg:px-10">
              <Link
                href={collectionLink}
                onClick={(event) => event.stopPropagation()}
                className="text-center text-[30px] font-semibold leading-none text-gray-950 transition-colors hover:text-gray-700 sm:text-[34px]"
              >
                {collection.name}
              </Link>
              {collection.description && (
                <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-gray-500 line-clamp-2">
                  {collection.description}
                </p>
              )}
              <CollectionProgressGauge
                earned={progress.earned}
                started={progress.started}
                total={courses.length}
              />
            </div>

            <div className="flex h-full items-center gap-7 overflow-x-auto px-8 pb-5 pt-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {courses.length > 0 ? (
                courses.map((course: any) => (
                  <BadgeThumbnailCard
                    key={course.course_uuid}
                    course={course}
                    orgslug={orgslug}
                    fallbackOrgUuid={collection.owner_org_uuid}
                  />
                ))
              ) : (
                <div className="flex min-h-[140px] w-full items-center justify-center rounded-lg border border-dashed border-gray-100 text-sm font-medium text-gray-400">
                  No badges in this collection
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default CollectionsOverviewSection
