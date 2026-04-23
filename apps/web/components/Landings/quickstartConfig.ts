import { createElement, type ComponentType } from 'react'
import {
  Books,
  ChatsCircle,
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
    label: 'Home',
    description: 'Organization dashboard home',
    icon: ({ className }) =>
      createElement(House, { size: 44, weight: 'fill', className }),
    href: routePaths.org.root(),
  },
  courses: {
    label: 'Courses',
    description: 'Browse all courses',
    icon: ({ className }) =>
      createElement(Books, { size: 44, weight: 'fill', className }),
    href: routePaths.org.courses(),
  },
  communities: {
    label: 'Communities',
    description: 'Join community discussions',
    icon: ({ className }) =>
      createElement(ChatsCircle, { size: 44, weight: 'fill', className }),
    href: routePaths.org.communities(),
  },
  resources: {
    label: 'Resources',
    description: 'Explore resource channels',
    icon: ({ className }) =>
      createElement(FolderOpen, { size: 44, weight: 'fill', className }),
    href: routePaths.org.resources(),
  },
}
