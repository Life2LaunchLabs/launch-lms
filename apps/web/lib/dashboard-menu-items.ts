import {
  House,
  BookOpen,
  Users,
  CurrencyCircleDollar,
  Buildings,
  Newspaper,
  Cube,
  FolderOpen,
} from '@phosphor-icons/react'

export interface DashboardMenuItem {
  id: string
  href: string
  icon: typeof House
  labelKey: string
  /** Feature key used for plan-based gating. If undefined, item is always shown. */
  featureKey?: string
  /** If true, the feature defaults to disabled (must be explicitly enabled). */
  defaultDisabled?: boolean
}

export const DASHBOARD_MENU_ITEMS: DashboardMenuItem[] = [
  {
    id: 'home',
    href: '/admin',
    icon: House,
    labelKey: 'common.home',
  },
  {
    id: 'courses',
    href: '/admin/courses',
    icon: BookOpen,
    labelKey: 'common.badges',
  },
  {
    id: 'resources',
    href: '/admin/resources',
    icon: FolderOpen,
    labelKey: 'common.resources',
    featureKey: 'resources',
    defaultDisabled: true,
  },
  {
    id: 'news',
    href: '/admin/news',
    icon: Newspaper,
    labelKey: 'common.news',
  },
  {
    id: 'playgrounds',
    href: '/admin/playgrounds',
    icon: Cube,
    labelKey: 'common.playgrounds',
    featureKey: 'playgrounds',
    defaultDisabled: true,
  },
  {
    id: 'users',
    href: '/admin/users/settings/users',
    icon: Users,
    labelKey: 'common.users',
  },
  {
    id: 'payments',
    href: '/admin/payments/overview',
    icon: CurrencyCircleDollar,
    labelKey: 'common.payments',
    featureKey: 'payments',
  },
  {
    id: 'organization',
    href: '/admin/org/settings/general',
    icon: Buildings,
    labelKey: 'common.organization',
  },
]
