'use client'

import Link from 'next/link'
import { Bookmark, MessageCircle, Sparkles } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { Resource } from '@services/resources/resources'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'

export default function ResourceCard({
  resource,
  orgslug,
  orgUUID,
}: {
  resource: Resource
  orgslug: string
  orgUUID?: string
}) {
  const imageSrc = resource.thumbnail_image && orgUUID
    ? getResourceThumbnailMediaDirectory(orgUUID, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url || '/placeholder/course-dark.png'

  return (
    <Link
      href={getUriWithOrg(orgslug, `/resource/${resource.resource_uuid.replace('resource_', '')}`)}
      className="group rounded-2xl overflow-hidden bg-white nice-shadow hover:-translate-y-0.5 transition-all"
    >
      <div className="relative aspect-[4/3] bg-gray-100">
        <img src={imageSrc} alt={resource.title} className="h-full w-full object-cover" />
        <div className="absolute top-3 right-3 flex gap-2">
          {resource.is_saved && (
            <span className="rounded-full bg-black/80 text-white p-2">
              <Bookmark size={14} className="fill-current" />
            </span>
          )}
          {resource.has_outcome && (
            <span className="rounded-full bg-emerald-600/90 text-white p-2">
              <Sparkles size={14} />
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
          <span>{resource.resource_type}</span>
          {resource.provider_name && <span>{resource.provider_name}</span>}
        </div>
        <h3 className="mt-2 text-base font-semibold text-gray-900 line-clamp-2">{resource.title}</h3>
        {resource.description && (
          <p className="mt-2 text-sm text-gray-500 line-clamp-2">{resource.description}</p>
        )}
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Bookmark size={14} />
            {resource.save_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={14} />
            {resource.comment_count}
          </span>
        </div>
      </div>
    </Link>
  )
}
