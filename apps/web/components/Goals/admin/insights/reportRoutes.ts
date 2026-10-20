/**
 * Insights routes for group reports. Local until they are folded into services/routing/paths.ts
 * (routePaths.org.admin.insightsReport and friends), which another change owns.
 */
const withQuery = (path: string, query: Record<string, string | null | undefined>) => {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
  const text = params.toString()
  return text ? `${path}?${text}` : path
}

const fwParam = (frameworks: string[] = []) => frameworks.length ? frameworks.join(',') : null

export const insightsRoutes = {
  /** The Reports page, for a group and the frameworks to include. */
  report: (groupId?: number | string | null, frameworks: string[] = []) => withQuery('/admin/insights', { group: groupId == null ? null : String(groupId), fw: fwParam(frameworks) }),
  /** The clean page to print a group's report from. */
  reportPrint: (groupId: number | string, frameworks: string[] = []) => withQuery(`/admin/insights/reports/${encodeURIComponent(String(groupId))}/print`, { fw: fwParam(frameworks) }),
  engagement: () => '/admin/insights/engagement',
  /** Framework coverage by template. Moves into Plans → Requirements later. */
  coverage: () => '/admin/insights/coverage',
}

/** The `fw` query value as framework uuids. */
export const parseFrameworks = (value?: string | string[] | null) =>
  (Array.isArray(value) ? value.join(',') : value || '').split(',').map((item) => item.trim()).filter(Boolean)
