import {
  Buildings,
  ChartLineUp,
  ChartPieSlice,
  ChatsCircle,
  ClipboardText,
  CreditCard,
  Cube,
  CurrencyCircleDollar,
  Flag,
  Flask,
  FolderOpen,
  Gear,
  Headphones,
  House,
  ListChecks,
  Newspaper,
  Palette,
  ShieldCheck,
  Sparkle,
  StackSimple,
  Storefront,
  TextAa,
  Tray,
  Users,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react'
import type { PlatformSection } from '@components/Admin/Platform/platformSections'
import { adminTab, type AdminTabId } from '@/lib/admin/registry'

/** Icons for the admin registry entries (lib/admin/registry.ts), shared by the sidebar and the mobile menu. */
export const ADMIN_NAV_ICONS: Record<string, Icon> = {
  home: House,
  plans: StackSimple,
  assignments: ClipboardText,
  people: Users,
  requirements: ListChecks,
  discover: Storefront,
  insights: ChartLineUp,
  content: FolderOpen,
  resources: FolderOpen,
  podcasts: Headphones,
  playgrounds: Cube,
  organization: Buildings,
  general: TextAa,
  branding: Palette,
  messaging: ChatsCircle,
  sso: ShieldCheck,
  plan: CreditCard,
  payments: CurrencyCircleDollar,
}

export const PLATFORM_NAV_ICONS: Record<PlatformSection, Icon> = {
  overview: ChartPieSlice,
  organizations: Buildings,
  users: UsersThree,
  requests: Tray,
  feedback: Flag,
  demo: Flask,
  coach: Sparkle,
  settings: Gear,
  news: Newspaper,
}

/** A registry tab with an icon on each of its pages, for page headers that list them. */
export function adminTabWithIcons(id: AdminTabId) {
  const tab = adminTab(id)
  return { ...tab, children: (tab.children || []).map((child) => ({ ...child, Icon: ADMIN_NAV_ICONS[child.id] })) }
}
