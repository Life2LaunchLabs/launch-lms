'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bookmark, MessageCircle, Sparkles } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { Resource } from '@services/resources/resources'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import SaveDropdown from '@components/Resources/SaveDropdown'

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

  const ownerOrgUuid = resource.owner_org_uuid || orgUUID
  const imageSrc = resource.thumbnail_image && ownerOrgUuid
    ? getResourceThumbnailMediaDirectory(ownerOrgUuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url || '/placeholder/course-dark.png'

  return (
    <div className="group relative aspect-square overflow-hidden rounded bg-gray-100">

      {/* Navigable area — image + title panel */}
      <Link
        href={getUriWithOrg(orgslug, `/resource/${resource.resource_uuid.replace('resource_', '')}`)}
        className="absolute inset-0 block"
      >
        <img src={imageSrc} alt={resource.title} className="absolute inset-0 h-full w-full object-cover" />

        {/* Title panel — expands upward on hover */}
        <div className="absolute inset-x-0 bottom-0 bg-white/80 backdrop-blur-sm rounded-t overflow-hidden h-[5.5rem] group-hover:h-[calc(100%-2.5rem)] transition-[height] duration-300 ease-out">
          <div className="flex flex-col h-full px-2.5 pt-2 pb-2.5">

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium truncate">
                {resource.resource_type}{resource.provider_name && ` · ${resource.provider_name}`}
              </span>
              {resource.has_outcome && (
                <Sparkles size={10} className="text-emerald-500 shrink-0" />
              )}
            </div>

            <h3 className="mt-0.5 text-sm font-semibold text-gray-900 line-clamp-2 leading-snug shrink-0">
              {resource.title}
            </h3>

            <div className="flex-1 min-h-0 overflow-hidden">
              {resource.description && (
                <p className="mt-1 text-xs text-gray-500 line-clamp-[8] leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-100">
                  {resource.description}
                </p>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400 shrink-0">
              <span className="flex items-center gap-1">
                <Bookmark size={11} />
                {resource.save_count}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle size={11} />
                {resource.comment_count}
              </span>
            </div>
            {resource.owner_org_name && (
              <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400 font-medium truncate">
                {resource.owner_org_name}
              </div>
            )}

          </div>
        </div>
      </Link>

      {/* Action bar — outside Link so SaveDropdown doesn't trigger navigation */}
      <div className="absolute inset-x-0 top-0 flex justify-end p-2 z-10">
        <SaveDropdown
          resourceUuid={resource.resource_uuid}
          isSaved={isSaved}
          savedUserChannelUuids={resource.user_channel_uuids ?? []}
          onSaveChange={setIsSaved}
          variant="card"
        />
      </div>

    </div>
  )
}
