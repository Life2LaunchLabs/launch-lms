'use client'

import { getCourseThumbnailMediaDirectory } from '@services/media/media'

export type CollectionCoverFanCourse = {
  course_uuid: string
  thumbnail_image?: string | null
  owner_org_uuid?: string | null
}

interface CollectionCoverFanThumbnailProps {
  courses: CollectionCoverFanCourse[]
  fallbackOrgUuid?: string | null
  className?: string
}

export default function CollectionCoverFanThumbnail({
  courses,
  fallbackOrgUuid,
  className = '',
}: CollectionCoverFanThumbnailProps) {
  return (
    <div
      className={`flex items-center justify-center h-full w-full bg-gray-100/50 relative p-4 ${className}`.trim()}
    >
      <div className="flex -space-x-10 items-center justify-center w-full">
        {courses.slice(0, 3).map((course, index) => (
          <div
            key={course.course_uuid}
            className="relative h-20 w-32 overflow-hidden rounded-lg border-2 border-white shadow-lg transition-all duration-300 shrink-0"
            style={{
              backgroundImage: `url(${
                course.thumbnail_image
                  ? getCourseThumbnailMediaDirectory(
                      course.owner_org_uuid || fallbackOrgUuid || '',
                      course.course_uuid,
                      course.thumbnail_image
                    )
                  : '/empty_thumbnail.png'
              })`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: 3 - index,
            }}
          />
        ))}
      </div>
    </div>
  )
}
