'use client'
import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import {
  MessageCircle,
  Plus,
  Globe,
  Lock,
  Settings,
  Calendar,
  BookOpen,
  ChevronRight,
} from 'lucide-react'
import { Community } from '@services/communities/communities'
import { getCommunityThumbnailMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'
import { useCommunityRights } from '@components/Hooks/useCommunityRights'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { SafeImage } from '@components/Objects/SafeImage'

interface CommunitySidebarProps {
  community: Community
  discussionCount: number
  orgslug: string
  onCreateDiscussion?: () => void
}

export function CommunitySidebar({
  community,
  discussionCount,
  orgslug,
  onCreateDiscussion,
}: CommunitySidebarProps) {
  const { t } = useTranslation()
  const { canManageCommunity, canCreateDiscussion } = useCommunityRights(community.community_uuid)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  // Fetch linked course if community has a course_id
  const { data: linkedCourse } = useSWR(
    community.course_id ? `${getAPIUrl()}courses/id/${community.course_id}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const createdDate = dayjs(community.creation_date).format('MMM D, YYYY')
  const ownerOrgUuid = community.owner_org_uuid || org?.org_uuid
  const linkedCourseOwnerOrgUuid = linkedCourse?.owner_org_uuid || org?.org_uuid

  const thumbnailUrl = community.thumbnail_image && ownerOrgUuid
    ? getCommunityThumbnailMediaDirectory(
        ownerOrgUuid,
        community.community_uuid,
        community.thumbnail_image
      )
    : null

  const courseThumbnailUrl = linkedCourse?.thumbnail_image && linkedCourseOwnerOrgUuid
    ? getCourseThumbnailMediaDirectory(
        linkedCourseOwnerOrgUuid,
        linkedCourse.course_uuid,
        linkedCourse.thumbnail_image
      )
    : null

  return (
    <div className="space-y-4">
      {/* Community Info Card */}
      <div className="bg-card nice-shadow rounded-lg overflow-hidden">
        {/* Header with community name */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            {thumbnailUrl ? (
              <SafeImage
                src={thumbnailUrl}
                alt={community.name}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground truncate">{community.name}</h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {community.public ? (
                  <>
                    <Globe size={12} className="text-green-500" />
                    <span>{t('communities.public')}</span>
                  </>
                ) : (
                  <>
                    <Lock size={12} className="text-muted-foreground" />
                    <span>{t('communities.private')}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {community.description}
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageCircle size={14} className="text-muted-foreground" />
            <span>{discussionCount} {discussionCount === 1 ? t('communities.discussion') : t('communities.discussions')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar size={14} className="text-muted-foreground" />
            <span>{t('communities.created')} {createdDate}</span>
          </div>
        </div>

        {/* Linked Course */}
        {linkedCourse && (
          <div className="px-4 py-3 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {t('communities.linked_course')}
            </div>
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.course(linkedCourse.course_uuid.replace('course_', '')))}
              className="group block"
            >
              <div className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted transition-colors">
                {courseThumbnailUrl ? (
                  <SafeImage
                    src={courseThumbnailUrl}
                    alt={linkedCourse.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <BookOpen size={20} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground group-hover:text-indigo-600 transition-colors truncate">
                    {linkedCourse.name}
                  </h4>
                  {linkedCourse.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {linkedCourse.description}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-indigo-600 transition-colors flex-shrink-0" />
              </div>
            </Link>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 border-t border-border space-y-2">
          {canCreateDiscussion && onCreateDiscussion && (
            <button
              onClick={onCreateDiscussion}
              className="w-full py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer bg-neutral-900 text-white hover:bg-neutral-800 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{t('communities.new_discussion')}</span>
            </button>
          )}

          {canManageCommunity && (
            <Link
              href={getUriWithOrg(orgslug, routePaths.org.dash.communities())}
              className="w-full bg-card text-muted-foreground border border-border py-2.5 rounded-lg font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Settings className="w-4 h-4" />
              {t('communities.manage')}
            </Link>
          )}
        </div>
      </div>

      {/* Quick Tips Card */}
      <div className="bg-card nice-shadow rounded-lg overflow-hidden p-4">
        <h3 className="font-medium text-foreground mb-2 text-sm">{t('communities.community_guidelines')}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('communities.community_guidelines_text')}
        </p>
      </div>
    </div>
  )
}

export default CommunitySidebar
