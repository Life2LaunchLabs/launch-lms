import {
  Compass,
  IdentificationCard,
  Path,
  Toolbox,
} from '@phosphor-icons/react/ssr'
import type { Icon } from '@phosphor-icons/react'

export type PlanAreaSlug = 'identity' | 'skills' | 'lifestyle' | 'path'

export interface PlanArea {
  slug: PlanAreaSlug
  title: string
  description: string
  icon: Icon
}

export const planAreas: PlanArea[] = [
  {
    slug: 'identity',
    title: 'Identity',
    description: 'Define who you are, what matters to you, and the impact you want to make.',
    icon: IdentificationCard,
  },
  {
    slug: 'skills',
    title: 'Skills',
    description: 'Map the strengths you have today and the capabilities you want to build.',
    icon: Toolbox,
  },
  {
    slug: 'lifestyle',
    title: 'Lifestyle',
    description: 'Design the rhythms, relationships, and environment that support your life.',
    icon: Compass,
  },
  {
    slug: 'path',
    title: 'Path',
    description: 'Turn your direction into clear milestones and practical next steps.',
    icon: Path,
  },
]

export function getPlanArea(slug: string) {
  return planAreas.find((area) => area.slug === slug)
}
