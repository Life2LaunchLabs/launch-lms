'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bookmark, Clock, MessageCircle, Sparkles } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { Resource } from '@services/resources/resources'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import SaveDropdown from '@components/Resources/SaveDropdown'
import { getResourceTypePresentation } from '@components/Resources/ResourceTypeVisual'

function formatEstimatedTime(minutes: number | null) {
  if (!minutes) return null
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

export default function ResourceCard({
  resource,
  orgslug,
  orgUUID,
}: {
  resource: Resource
  orgslug: string
  orgUUID?: string
}) {
  const [isSaved, setIsSaved] = useState(resource.is_saved)
  const [imageFailed, setImageFailed] = useState(false)

  const ownerOrgUuid = resource.owner_org_uuid || orgUUID
  const rawImageSrc = resource.thumbnail_image && ownerOrgUuid
    ? getResourceThumbnailMediaDirectory(ownerOrgUuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
  const imageSrc = imageFailed ? null : rawImageSrc
  const resourceUrl = getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid.replace('resource_', '')))
  const presentation = getResourceTypePresentation(resource.resource_type)
  const TypeIcon = presentation.icon
  const estimatedTime = formatEstimatedTime(resource.estimated_time)

  return (
    <article className="group rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50/60">
      <Link
        href={resourceUrl}
        className="flex gap-4 p-5 sm:gap-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700 ring-1 ring-gray-200">
              <TypeIcon size={13} aria-hidden="true" />
              {resource.resource_type}
            </span>
            {resource.has_outcome && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <Sparkles size={12} aria-hidden="true" />
                Outcome
              </span>
            )}
          </div>

          <h3 className="mt-3 text-xl font-bold leading-tight text-gray-950 sm:text-2xl">
            {resource.title}
          </h3>

          {resource.description && (
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-gray-500 sm:text-base">
              {resource.provider_name && (
                <span className="font-bold text-gray-800">{resource.provider_name}: </span>
              )}
              {resource.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-gray-400">
            {resource.owner_org_name && <span>{resource.owner_org_name}</span>}
            {estimatedTime && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden="true" />
                {estimatedTime}
              </span>
            )}
          </div>
        </div>

        {imageSrc && (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-24 sm:w-24">
            <img
              src={imageSrc}
              alt={resource.title}
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          </div>
        )}
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 pb-4 pt-1">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5">
            <Bookmark size={14} aria-hidden="true" />
            {resource.save_count}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5">
            <MessageCircle size={14} aria-hidden="true" />
            {resource.comment_count}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <SaveDropdown
            resourceUuid={resource.resource_uuid}
            isSaved={isSaved}
            savedUserChannelUuids={resource.user_channel_uuids ?? []}
            onSaveChange={setIsSaved}
            variant="card"
            share={{
              title: resource.title,
              description: resource.description,
              url: resourceUrl,
            }}
          />
        </div>
      </div>

    </article>
  )
}
