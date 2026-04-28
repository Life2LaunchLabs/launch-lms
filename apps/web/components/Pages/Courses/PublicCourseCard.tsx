'use client'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import UserAvatar from '@components/Objects/UserAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { removeCourse } from '@services/courses/activity'
import { getCourseThumbnailMediaDirectory, getUserAvatarMediaDirectory } from '@services/media/media'
import { revalidateTags } from '@services/utils/ts/requests'
import { BookOpen, Building2, Check, MoreVertical, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'

type PublicCourseCardProps = {
  course: any
  orgslug: string
  run?: any | null
  orgName?: string
}

const removeCoursePrefix = (courseUuid: string) => courseUuid.replace('course_', '')

function PublicCourseCard({ course, orgslug, run = null, orgName }: PublicCourseCardProps) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const router = useRouter()
  const access_token = session?.data?.tokens?.access_token
  const courseLink = getUriWithOrg(orgslug, routePaths.org.course(removeCoursePrefix(course.course_uuid)))
  const isEnrolled = Boolean(run)
  const courseTotalSteps = run?.course_total_steps ?? 0
  const courseCompletedSteps = run?.steps?.length ?? 0
  const courseProgress = courseTotalSteps > 0
    ? Math.round((courseCompletedSteps / courseTotalSteps) * 100)
    : 0
  const activeAuthors = course.authors?.filter((author: any) => author.authorship_status === 'ACTIVE') || []
  const displayedAuthors = activeAuthors.slice(0, 3)
  const hasMoreAuthors = activeAuthors.length > 3
  const remainingAuthorsCount = activeAuthors.length - 3
  const resolvedOrgName = orgName || org?.name
  const ownerOrgUuid = course.owner_org_uuid || org?.org_uuid
  const resolvedOrgNameWithOwner = course.owner_org_name || resolvedOrgName

  const quitCourse = async () => {
    if (!access_token) return

    await removeCourse(course.course_uuid, orgslug, access_token)
    await revalidateTags(['courses'], orgslug)
    router.refresh()
    if (org?.id) {
      mutate(`${getAPIUrl()}trail/org/${org.id}/trail`)
    }
  }

  return (
    <div className="group relative flex flex-col bg-white rounded-xl nice-shadow overflow-hidden w-full transition-all duration-300 hover:scale-[1.01]">
      {isEnrolled && (
        <div className="absolute top-2 right-2 z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Course actions" className="p-1.5 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-all shadow-md">
                <MoreVertical size={18} className="text-gray-700" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <ConfirmationModal
                  confirmationMessage={t('courses.quit_course_confirm')}
                  confirmationButtonText={t('courses.quit_course')}
                  dialogTitle={t('courses.quit_course_title')}
                  dialogTrigger={
                    <button className="w-full text-left flex items-center px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                      <Trash2 className="mr-2 h-4 w-4" /> {t('courses.quit_course')}
                    </button>
                  }
                  functionToExecute={quitCourse}
                  status="warning"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Link href={courseLink} className="block relative aspect-video overflow-hidden bg-gray-100">
        {course.thumbnail_image && ownerOrgUuid ? (
          <img
            src={getCourseThumbnailMediaDirectory(ownerOrgUuid, course.course_uuid, course.thumbnail_image)}
            alt={course.name}
            className="w-full h-full object-contain bg-gray-100"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full text-gray-300 gap-2">
            <BookOpen size={40} strokeWidth={1.5} />
          </div>
        )}
        {isEnrolled && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-200/80">
            <div
              className={`h-full ${courseProgress === 100 ? 'bg-green-500' : 'bg-teal-500'}`}
              style={{ width: `${courseProgress}%` }}
            />
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col space-y-1.5">
        <Link
          href={courseLink}
          className="text-base font-bold text-gray-900 leading-tight hover:text-black transition-colors line-clamp-1"
        >
          {course.name}
        </Link>

        {course.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 min-h-[1.5rem]">
            {course.description}
          </p>
        )}

        <div className="pt-1.5 flex items-center justify-between border-t border-gray-100 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {displayedAuthors.length > 0 ? (
              <div className="flex -space-x-2 items-center shrink-0">
                {displayedAuthors.map((author: any, index: number) => (
                  <div
                    key={author.user.user_uuid}
                    className="relative"
                    style={{ zIndex: displayedAuthors.length - index }}
                  >
                    <UserAvatar
                      border="border-2"
                      rounded="rounded-full"
                      avatar_url={author.user.avatar_image ? getUserAvatarMediaDirectory(author.user.user_uuid, author.user.avatar_image) : ''}
                      predefined_avatar={author.user.avatar_image ? undefined : 'empty'}
                      width={20}
                      showProfilePopup={true}
                      userId={author.user.id}
                    />
                  </div>
                ))}
                {hasMoreAuthors && (
                  <div className="relative z-0">
                    <div className="flex items-center justify-center w-[20px] h-[20px] text-[8px] font-bold text-gray-600 bg-gray-100 border-2 border-white rounded-full">
                      +{remainingAuthorsCount}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Building2 size={14} className="text-gray-400 shrink-0" />
            )}

            {resolvedOrgNameWithOwner && (
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">
                {resolvedOrgNameWithOwner}
              </span>
            )}
          </div>

          {isEnrolled ? (
            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-wider shrink-0">
              <Check className="w-3 h-3" />
              <span>{t('analytics.course_analytics.units.enrolled')}</span>
            </div>
          ) : (
            <Link
              href={courseLink}
              className="text-[10px] font-bold text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-wider shrink-0"
            >
              {t('courses.start_learning')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default PublicCourseCard
