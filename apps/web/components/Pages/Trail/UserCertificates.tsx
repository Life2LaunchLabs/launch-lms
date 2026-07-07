'use client'

import React from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { Award } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import { swrFetcher } from '@services/utils/ts/requests'
import { getAPIUrl } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { FeaturedBadgeButton } from '@components/Objects/Portfolio/ProfileAchievements'

interface UserCertificatesProps {
  orgslug: string
  showHeader?: boolean
}

const UserCertificates: React.FC<UserCertificatesProps> = ({ orgslug, showHeader = true }) => {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const { data: learningAwards, error, isLoading } = useSWR(
    access_token ? `${getAPIUrl()}badge-awards/` : null,
    (url) => swrFetcher(url, access_token)
  )

  const learningAwardsData = Array.isArray(learningAwards) ? learningAwards : learningAwards?.data || []
  const badgesData = learningAwardsData.map((award: any) => ({ kind: 'learning', award }))

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

  if (!badgesData || badgesData.length === 0) {
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
            Complete badges to earn Open Badges
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
            {badgesData.length}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:grid-cols-4">
        {badgesData.map((item: any) => {
          const award = item.award
          const badgeUuid = award?.badge?.badge_uuid?.replace('badge_', '')
          const badgeLink = getUriWithOrg(orgslug, routePaths.org.badgeStatus(badgeUuid))
          const badgeImageUrl = normalizeMediaUrl(award.badge_class?.image) || normalizeMediaUrl(award.badge?.thumbnail_image) || '/empty_thumbnail.png'
          const badgeId = award?.award?.award_uuid
          const badgeTitle = award.badge_class?.name || award.badge?.name

          if (!badgeUuid || !badgeId || !badgeTitle) return null

          return (
            <Link
              key={`${item.kind}-${badgeId}`}
              href={badgeLink}
              className="group block focus:outline-none"
            >
              <div className="relative aspect-square w-full overflow-visible rounded-lg bg-transparent">
                <BadgeThumbnailImage
                  src={badgeImageUrl}
                  alt={badgeTitle}
                  hoverScale
                  onError={(event) => {
                    event.currentTarget.src = '/empty_thumbnail.png'
                  }}
                />
                <FeaturedBadgeButton
                  badgeId={badgeId}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[featured=true]:opacity-100"
                />
              </div>
              <div className="h-1.5 w-full" />
              <h2 className="mt-2 text-center text-sm font-semibold leading-snug text-gray-950 transition-colors group-hover:text-gray-600">
                {badgeTitle}
              </h2>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default UserCertificates 
