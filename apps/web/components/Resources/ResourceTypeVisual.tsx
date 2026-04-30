'use client'

import { useState } from 'react'
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers,
  PlayCircle,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ResourceType } from '@services/resources/resources'

type ResourceTypePresentation = {
  icon: LucideIcon
  color: string
}

const resourceTypePresentation: Record<ResourceType, ResourceTypePresentation> = {
  assessment: {
    icon: ClipboardCheck,
    color: '#4c1d95',
  },
  video: {
    icon: PlayCircle,
    color: '#991b1b',
  },
  article: {
    icon: FileText,
    color: '#1e3a8a',
  },
  tool: {
    icon: Wrench,
    color: '#155e75',
  },
  guide: {
    icon: BookOpen,
    color: '#166534',
  },
  course: {
    icon: GraduationCap,
    color: '#9a3412',
  },
  other: {
    icon: Layers,
    color: '#334155',
  },
}

export function getResourceTypePresentation(type: ResourceType) {
  return resourceTypePresentation[type] || resourceTypePresentation.other
}

export default function ResourceTypeVisual({
  type,
  title,
  imageSrc,
  className = '',
  iconClassName = '',
}: {
  type: ResourceType
  title: string
  imageSrc?: string | null
  className?: string
  iconClassName?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const presentation = getResourceTypePresentation(type)
  const Icon = presentation.icon
  const showImage = Boolean(imageSrc) && !imageFailed

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={showImage ? undefined : { backgroundColor: presentation.color }}
    >
      {showImage ? (
        <img
          src={imageSrc || ''}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <img
            src="/texture_overlay.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <Icon
            aria-hidden="true"
            className={`relative z-10 h-14 w-14 text-white ${iconClassName}`}
            strokeWidth={1.75}
          />
        </>
      )}
    </div>
  )
}
