import {
  CreditCard,
  Library,
  LucideIcon,
  Palette,
  Shield,
  Store,
  TextIcon,
  Users,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { routePaths } from '@services/config/config'

export type AdminFeaturePage = {
  id: string
  label: string
  icon: LucideIcon
  href: string
}

export const BADGE_ADMIN_PAGES: AdminFeaturePage[] = [
  { id: 'collections', label: 'Collections', icon: Library, href: routePaths.org.dash.badges() },
  { id: 'marketplace', label: 'Marketplace', icon: Store, href: `${routePaths.org.dash.badges()}?tab=marketplace` },
]

export function getUserAdminPages(): AdminFeaturePage[] {
  return [
    { id: 'overview', label: 'Overview', icon: Users, href: routePaths.org.dash.users.users() },
  ]
}

export function getOrganizationAdminPages(
  t: TFunction,
  { hasSso = false }: { hasSso?: boolean } = {}
): AdminFeaturePage[] {
  return [
    { id: 'general', label: t('dashboard.organization.settings.tabs.general'), icon: TextIcon, href: routePaths.org.dash.orgSettings.general() },
    { id: 'branding', label: t('dashboard.organization.settings.tabs.branding'), icon: Palette, href: routePaths.org.dash.orgSettings.branding() },
    ...(hasSso
      ? [{ id: 'sso', label: 'Single Sign-On', icon: Shield, href: routePaths.org.dash.orgSettings.sso() }]
      : []),
    { id: 'plan', label: 'Plan & Packages', icon: CreditCard, href: routePaths.org.dash.orgSettings.plan() },
  ]
}
