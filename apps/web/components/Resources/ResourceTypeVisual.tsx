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
  background: string
}

const resourceTypePresentation: Record<ResourceType, ResourceTypePresentation> = {
  assessment: {
    icon: ClipboardCheck,
    color: '#7c3aed',
    background: '#ede9fe',
  },
  video: {
    icon: PlayCircle,
    color: '#dc2626',
    background: '#fee2e2',
  },
  article: {
    icon: FileText,
    color: '#2563eb',
    background: '#dbeafe',
  },
  tool: {
    icon: Wrench,
    color: '#0891b2',
    background: '#cffafe',
  },
  guide: {
    icon: BookOpen,
    color: '#16a34a',
    background: '#dcfce7',
  },
  course: {
    icon: GraduationCap,
    color: '#ea580c',
    background: '#ffedd5',
  },
  other: {
    icon: Layers,
    color: '#64748b',
    background: '#f1f5f9',
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
      style={showImage ? undefined : { backgroundColor: presentation.background }}
    >
      {showImage ? (
        <img
          src={imageSrc || ''}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon
          aria-hidden="true"
          className={`h-14 w-14 ${iconClassName}`}
          style={{ color: presentation.color }}
          strokeWidth={1.75}
        />
      )}
    </div>
  )
}
