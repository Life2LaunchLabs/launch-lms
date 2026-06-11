import {
  Compass,
  IdentificationCard,
  Path,
  Toolbox,
} from '@phosphor-icons/react/ssr'
import type { Icon } from '@phosphor-icons/react'

export type PlanAreaSlug = 'identity' | 'skills' | 'lifestyle' | 'path'
export type PlanAreaStatus = 'active' | 'in-progress' | 'locked'

export interface PlanArea {
  slug: PlanAreaSlug
  title: string
  description: string
  icon: Icon
  status: PlanAreaStatus
  progress: number
  theme: {
    iconBg: string
    iconColor: string
    barColor: string
    badgeBg: string
    badgeColor: string
  }
}

export const planAreas: PlanArea[] = [
  {
    slug: 'identity',
    title: 'Identity',
    description: 'Define your core values and the person you want to become.',
    icon: IdentificationCard,
    status: 'active',
    progress: 85,
    theme: {
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-500',
      barColor: 'bg-blue-500',
      badgeBg: 'bg-blue-100',
      badgeColor: 'text-blue-700',
    },
  },
  {
    slug: 'skills',
    title: 'Skills',
    description: 'Master new abilities and level up your career proficiency.',
    icon: Toolbox,
    status: 'in-progress',
    progress: 42,
    theme: {
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      barColor: 'bg-green-500',
      badgeBg: 'bg-green-100',
      badgeColor: 'text-green-700',
    },
  },
  {
    slug: 'lifestyle',
    title: 'Lifestyle',
    description: 'Optimize your health, routines, and daily environment.',
    icon: Compass,
    status: 'in-progress',
    progress: 65,
    theme: {
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      barColor: 'bg-amber-400',
      badgeBg: 'bg-amber-100',
      badgeColor: 'text-amber-700',
    },
  },
  {
    slug: 'path',
    title: 'Path',
    description: 'Chart your long-term milestones and major life transitions.',
    icon: Path,
    status: 'locked',
    progress: 0,
    theme: {
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-500',
      barColor: 'bg-rose-400',
      badgeBg: 'bg-gray-100',
      badgeColor: 'text-gray-500',
    },
  },
]

export function getPlanArea(slug: string) {
  return planAreas.find((area) => area.slug === slug)
}
