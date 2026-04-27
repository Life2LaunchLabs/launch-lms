'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getTrendingItems, TrendingItem } from '@services/trending/trending'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory, getResourceThumbnailMediaDirectory } from '@services/media/media'
import { Activity, BookOpen, FileText, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TrendingSectionProps {
  orgslug: string
  title?: string
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffMins < 2) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 5) return `${diffWeeks}w ago`
  return date.toLocaleDateString()
}

function stripPrefix(uuid: string, prefix: string): string {
  return uuid.replace(prefix, '')
}

function itemHref(item: TrendingItem, orgslug: string): string {
  if (item.item_type === 'discussion' && item.community_uuid) {
    return getUriWithOrg(
      orgslug,
      routePaths.org.communityDiscussion(
        stripPrefix(item.community_uuid, 'community_'),
        stripPrefix(item.item_uuid, 'discussion_')
      )
    )
  }
  if (item.item_type === 'resource') {
    return getUriWithOrg(orgslug, routePaths.org.resource(stripPrefix(item.item_uuid, 'resource_')))
  }
  if (item.item_type === 'course') {
    return getUriWithOrg(orgslug, routePaths.org.course(stripPrefix(item.item_uuid, 'course_')))
  }
  return '#'
}

function TypeBadge({ type }: { type: TrendingItem['item_type'] }) {
  const cfg = {
    discussion: { label: 'Discussion', color: 'bg-violet-100 text-violet-700', Icon: MessageSquare },
    resource: { label: 'Resource', color: 'bg-blue-100 text-blue-700', Icon: FileText },
    course: { label: 'Course', color: 'bg-emerald-100 text-emerald-700', Icon: BookOpen },
  }[type]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function thumbnailUrl(item: TrendingItem, orgUUID: string): string | null {
  if (!item.thumbnail_image) return null
  if (item.item_type === 'course') {
    return getCourseThumbnailMediaDirectory(orgUUID, item.item_uuid, item.thumbnail_image)
  }
  if (item.item_type === 'resource') {
    return getResourceThumbnailMediaDirectory(orgUUID, item.item_uuid, item.thumbnail_image)
  }
  return null
}

function TrendingItemRow({
  item,
  orgslug,
  orgUUID,
}: {
  item: TrendingItem
  orgslug: string
  orgUUID: string
}) {
  const href = itemHref(item, orgslug)
  const thumbUrl = thumbnailUrl(item, orgUUID)

  return (
    <Link
      href={href}
      className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
          {item.item_type === 'discussion' ? (
            <MessageSquare className="w-4 h-4 text-gray-400" />
          ) : item.item_type === 'resource' ? (
            <FileText className="w-4 h-4 text-gray-400" />
          ) : (
            <BookOpen className="w-4 h-4 text-gray-400" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeBadge type={item.item_type} />
          {item.community_name && (
            <span className="text-xs text-gray-400 truncate">{item.community_name}</span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-gray-700">
          {item.title}
        </p>
      </div>

      <span className="text-xs text-gray-400 shrink-0 mt-1">{timeAgo(item.last_event_date)}</span>
    </Link>
  )
}

function TrendingSection({ orgslug, title }: TrendingSectionProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const orgUUID = org?.org_uuid

  const { data: items, isLoading } = useSWR(
    orgUUID ? ['trending', orgUUID, access_token || 'anon'] : null,
    () => getTrendingItems(orgUUID, access_token)
  )

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-2 mb-6">
        <h2 className="my-2 text-lg font-bold tracking-tight text-gray-900">
          {title || t('landing.trending.title')}
        </h2>
        <div className="space-y-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col space-y-2 mb-6">
        <h2 className="my-2 text-lg font-bold tracking-tight text-gray-900">
          {title || t('landing.trending.title')}
        </h2>
        <div className="flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <Activity className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-gray-400 text-center">{t('landing.trending.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-1 mb-6">
      <h2 className="my-2 text-lg font-bold tracking-tight text-gray-900">
        {title || t('landing.trending.title')}
      </h2>
      <div className="divide-y divide-gray-50">
        {items.map((item) => (
          <TrendingItemRow key={`${item.item_type}-${item.item_uuid}`} item={item} orgslug={orgslug} orgUUID={orgUUID} />
        ))}
      </div>
    </div>
  )
}

export default TrendingSection
