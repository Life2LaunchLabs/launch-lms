import {
  ClipboardCheck,
  CreditCard,
  Handshake,
  Library,
  LucideIcon,
  Palette,
  ScanEye,
  Shield,
  ShieldAlert,
  SquareUserRound,
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
  { id: 'issuing', label: 'Issuing', icon: Handshake, href: `${routePaths.org.dash.badges()}?tab=issuing` },
  { id: 'grading', label: 'Grading', icon: ClipboardCheck, href: `${routePaths.org.dash.badges()}?tab=grading` },
]

export function getUserAdminPages({
  t,
  hasUserGroups,
  hasAuditLogs,
}: {
  t: TFunction
  hasUserGroups: boolean
  hasAuditLogs: boolean
}): AdminFeaturePage[] {
  return [
    { id: 'users', label: t('dashboard.users.settings.tabs.users'), icon: Users, href: routePaths.org.dash.users.users() },
    ...(hasUserGroups
      ? [{ id: 'groups', label: t('dashboard.users.settings.tabs.usergroups'), icon: SquareUserRound, href: routePaths.org.dash.users.usergroups() }]
      : []),
    { id: 'roles', label: t('dashboard.users.settings.tabs.roles'), icon: Shield, href: routePaths.org.dash.users.roles() },
    { id: 'signups', label: t('dashboard.users.settings.tabs.signups'), icon: ScanEye, href: routePaths.org.dash.users.signups() },
    ...(hasAuditLogs
      ? [{ id: 'audit-logs', label: t('dashboard.users.settings.tabs.audit_logs'), icon: ShieldAlert, href: routePaths.org.dash.users.auditLogs() }]
      : []),
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
