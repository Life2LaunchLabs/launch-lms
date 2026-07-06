'use client'

import ContentPlaceHolderIfUserIsNotAdmin from '@components/Objects/ContentPlaceHolder'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { cleanLearningCollectionId } from '@services/learning/legacyAdapters'
import { Award, Library } from 'lucide-react'
import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface CollectionsOverviewSectionProps {
  collections: any[]
  orgslug: string
  org_id: number | string
  trailRunsByCourseUuid?: Map<string, any>
}

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

function getBadgeThumbnailSrc(course: any, fallbackOrgUuid?: string) {
  if (course?.thumbnail_image_url) return course.thumbnail_image_url
  const ownerOrgUuid = course?.owner_org_uuid || fallbackOrgUuid
  if (course?.thumbnail_image && ownerOrgUuid) {
    return getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, course.thumbnail_image)
  }
  return ''
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
  const thumbnailSrc = getBadgeThumbnailSrc(course, fallbackOrgUuid)

  return (
    <Link
      href={courseLink}
      onClick={(event) => event.stopPropagation()}
      className="group/badge block w-[168px] shrink-0 focus:outline-none"
    >
      <div className="relative aspect-square overflow-visible rounded-lg bg-transparent transition-all duration-300 group-hover/badge:-translate-y-0.5 group-focus-visible/badge:ring-2 group-focus-visible/badge:ring-gray-900">
        {thumbnailSrc ? (
          <BadgeThumbnailImage
            src={thumbnailSrc}
            alt={course.name}
            className="transition-transform duration-500 group-hover/badge:scale-105"
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

function CollectionsOverviewSection({
  collections,
  orgslug,
  trailRunsByCourseUuid,
}: CollectionsOverviewSectionProps) {
  const { t } = useTranslation()

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
    <div className="flex flex-col gap-10">
      {collections.map((collection: any) => {
        const courses = collection.courses || []
        const collectionId = cleanLearningCollectionId(collection.collection_uuid)
        const collectionLink = getUriWithOrg(orgslug, routePaths.org.collection(collectionId))
        const progress = getCollectionProgress(collection, trailRunsByCourseUuid)

        return (
          <section
            key={collection.collection_uuid}
            aria-label={`View ${collection.name} collection`}
            className="min-w-0"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="min-w-0 text-2xl font-bold leading-tight text-gray-950">
                {collection.name}
              </h2>
              <div className="shrink-0 text-right">
                <Link
                  href={collectionLink}
                  className="text-sm font-semibold text-gray-400 transition-colors hover:text-gray-700"
                >
                  See all
                </Link>
                <div className="mt-1 text-xs font-semibold text-gray-300">
                  {progress.earned} completed
                </div>
              </div>
            </div>

            <div className="flex gap-7 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
