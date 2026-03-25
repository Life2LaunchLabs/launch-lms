'use client'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import TrailCourseCard from '@components/Pages/Trail/TrailCourseCard'
import TypeOfContentTitle from '@components/Objects/StyledElements/Titles/TypeOfContentTitle'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'

interface InProgressSectionProps {
  orgslug: string
}

function InProgressSection({ orgslug }: InProgressSectionProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const orgID = org?.id

  const isCoursesEnabled =
    org?.config?.config?.resolved_features?.courses?.enabled ??
    org?.config?.config?.features?.courses?.enabled !== false

  const { data: trail } = useSWR(
    isCoursesEnabled && orgID && access_token
      ? `${getAPIUrl()}trail/org/${orgID}/trail`
      : null,
    (url) => swrFetcher(url, access_token)
  )

  // Don't render for unauthenticated users
  if (!access_token) return null

  return (
    <div className="flex flex-col space-y-2 mb-6">
      <TypeOfContentTitle title={t('courses.progress')} type="tra" />

      {!trail ? (
        <PageLoading />
      ) : trail.runs.length === 0 ? (
        <div className="col-span-full flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <BookOpen className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold text-gray-600 mb-2">
            {t('user.no_courses_in_progress')}
          </h1>
          <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
            {t('user.start_course_to_see_progress')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {trail.runs.map((run: any) => (
            <TrailCourseCard
              key={run.course.course_uuid}
              run={run}
              course={run.course}
              orgslug={orgslug}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default InProgressSection
