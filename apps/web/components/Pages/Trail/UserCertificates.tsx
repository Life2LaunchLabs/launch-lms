'use client'

import React from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { Award } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import { swrFetcher } from '@services/utils/ts/requests'
import { getAPIUrl } from '@services/config/config'
import { getCourseThumbnailMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'

interface UserCertificatesProps {
  orgslug: string
  showHeader?: boolean
}

const UserCertificates: React.FC<UserCertificatesProps> = ({ orgslug, showHeader = true }) => {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any

  const { data: certificates, error, isLoading } = useSWR(
    access_token && org?.id ? `${getAPIUrl()}certifications/user/all?org_id=${org.id}` : null,
    (url) => swrFetcher(url, access_token)
  )

  // Handle the actual API response structure - badges are returned as an array directly
  const certificatesData = Array.isArray(certificates) ? certificates : certificates?.data || []

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-2">
        {showHeader && (
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Award className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">My Badges</h2>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-lg bg-gray-100" />
              <div className="mx-auto mt-3 h-4 w-3/4 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col space-y-2">
        {showHeader && (
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Award className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">My Badges</h2>
          </div>
        )}
        <div className="col-span-full flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <Award className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <p className="text-gray-500">Failed to load badges</p>
        </div>
      </div>
    )
  }

  if (!certificatesData || certificatesData.length === 0) {
    return (
      <div className="flex flex-col space-y-2">
        {showHeader && (
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Award className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">My Badges</h2>
          </div>
        )}
        <div className="col-span-full flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <Award className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold text-gray-600 mb-2">
            No badges earned yet
          </h1>
          <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
            Complete courses to earn Open Badges
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-2">
      {showHeader && (
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-yellow-50 rounded-lg">
            <Award className="w-5 h-5 text-yellow-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">My Badges</h2>
          <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {certificatesData.length}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
        {certificatesData.map((certificate: any) => {
          const badgeLink = getUriWithOrg(
            orgslug,
            routePaths.org.badgeStatus(certificate.course.course_uuid.replace('course_', ''))
          )
          const courseThumbnailUrl = certificate.course?.thumbnail_image && org?.org_uuid
            ? getCourseThumbnailMediaDirectory(
                org.org_uuid,
                certificate.course.course_uuid,
                certificate.course.thumbnail_image
              )
            : ''
          const badgeImageUrl = courseThumbnailUrl
            || normalizeMediaUrl(certificate.badge_class?.image)
            || normalizeMediaUrl(certificate.certification?.config?.badge_image_url)
            || '/empty_thumbnail.png'

          return (
            <Link
              key={certificate.certificate_user.user_certification_uuid}
              href={badgeLink}
              className="group block focus:outline-none"
            >
              <div className="aspect-square w-full overflow-visible rounded-lg bg-transparent">
                <BadgeThumbnailImage
                  src={badgeImageUrl}
                  alt={certificate.badge_class?.name || certificate.certification.config.badge_name || certificate.course.name}
                  hoverScale
                  onError={(event) => {
                    event.currentTarget.src = '/empty_thumbnail.png'
                  }}
                />
              </div>
              <div className="h-1.5 w-full" />
              <h2 className="mt-2 text-center text-sm font-semibold leading-snug text-gray-950 transition-colors group-hover:text-gray-600">
                {certificate.badge_class?.name || certificate.certification.config.badge_name || certificate.certification.config.certification_name}
              </h2>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default UserCertificates 
