import { createElement, type ComponentType } from 'react'
import {
  Books,
  FolderOpen,
  House,
} from '@phosphor-icons/react'
import { routePaths } from '@services/config/config'
import { LandingQuickstartFeature } from '@components/Dashboard/Pages/Org/OrgEditLanding/landing_types'

export const QUICKSTART_FEATURES: Record<
  LandingQuickstartFeature,
  {
    label: string
    description: string
    icon: ComponentType<{ className?: string }>
    href: string
  }
> = {
  home: {
    label: 'Portfolio',
    description: 'Open your portfolio',
    icon: ({ className }) =>
      createElement(House, { size: 44, weight: 'fill', className }),
    href: routePaths.org.portfolio(),
  },
  badges: {
    label: 'Badges',
    description: 'Discover badges to earn',
    icon: ({ className }) =>
      createElement(Books, { size: 44, weight: 'fill', className }),
    href: routePaths.org.badges(),
  },
  resources: {
    label: 'Resources',
    description: 'Explore resource channels',
    icon: ({ className }) =>
      createElement(FolderOpen, { size: 44, weight: 'fill', className }),
    href: routePaths.org.resources(),
  },
}
