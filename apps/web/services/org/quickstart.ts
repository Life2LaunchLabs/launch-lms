import { getDefaultOrg } from '@services/config/config'

const HOST_ACCESS_PACKAGE_KEYS = [
  'white_label_subdomain',
  'subdomain',
  'subdomains',
  'custom_domain',
  'custom_domains',
  'domains',
]

export function normalizeCourseUuid(courseUuid?: string | null) {
  if (!courseUuid) return null
  return courseUuid.replace(/^course_/, '')
}

export function getOrgQuickstartCourseUuid(org: any): string | null {
  const config = org?.config?.config

  return (
    config?.customization?.general?.quickstart_course_uuid ||
    config?.general?.quickstart_course_uuid ||
    null
  )
}

export function canConfigureOrgQuickstart(org: any): boolean {
  const config = org?.config?.config
  const packages = Array.isArray(config?.packages) ? config.packages : []
  const isV2 = config?.config_version?.startsWith('2')
  const plan = isV2 ? config?.plan : config?.cloud?.plan

  const hasHostAccess =
    org?.slug === getDefaultOrg() ||
    org?.user_site_enabled === true ||
    config?.user_site_enabled === true ||
    config?.cloud?.user_site_enabled === true ||
    config?.features?.user_site_enabled === true ||
    packages.some((pkg: string) => HOST_ACCESS_PACKAGE_KEYS.includes(pkg)) ||
    plan === 'enterprise'

  return hasHostAccess
}
