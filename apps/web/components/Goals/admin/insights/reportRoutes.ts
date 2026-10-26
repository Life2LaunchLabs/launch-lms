import { routePaths } from '@services/routing/paths'

const admin = routePaths.org.admin

/** Insights routes for group reports; thin names over services/routing/paths.ts (routePaths.org.admin.insights*). */
export const insightsRoutes = {
  /** The Reports page, for a group and the frameworks to include. */
  report: (groupId?: number | string | null, frameworks: string[] = []) => admin.insightsReport(groupId, frameworks),
  /** The clean page to print a group's report from. */
  reportPrint: (groupId: number | string, frameworks: string[] = []) => admin.insightsReportPrint(groupId, frameworks),
  engagement: () => admin.insightsEngagement(),
}

/** The `fw` query value as framework uuids. */
export const parseFrameworks = (value?: string | string[] | null) =>
  (Array.isArray(value) ? value.join(',') : value || '').split(',').map((item) => item.trim()).filter(Boolean)
