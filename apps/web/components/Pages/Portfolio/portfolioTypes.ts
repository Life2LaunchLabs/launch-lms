import type { TimelineEntry } from './Timeline'

/** The portfolio shell the API returns and the pieces of it the portfolio views read. */
export type Project = { project_uuid: string; slug: string; title: string; subtitle: string; summary: string; story_kind: string; status: string; featured: boolean; revision: number; start_date?: string; end_date?: string; is_ongoing?: boolean; cover_url?: string; cover_asset_uuid?: string; blocks: Array<{ block_uuid?: string; block_type: string; data: Record<string, any> }> }
export type PortfolioBadge = { badge_uuid: string; name: string; description?: string; thumbnail_image?: string; }
export type PortfolioSection = { section_uuid: string; section_type: string; title_override?: string; enabled: boolean; sort_order: number }
export type ChecklistItem = { key: string; label: string; supportingText: string; href: string; complete: boolean }
export type Shell = { portfolio: Record<string, any>; projects: Project[]; timeline: TimelineEntry[]; sections?: PortfolioSection[]; traits?: { strength?: string[]; value?: string[] }; badges?: { earned: PortfolioBadge[]; featured: PortfolioBadge[]; featuredBadgeUuids: string[]; hiddenBadgeUuids: string[] }; views: Array<{ key: string; visible: boolean; itemCount: number }>; readiness: { canPublish: boolean; blockers: string[] }; checklist?: { items: ChecklistItem[]; completed: number; total: number; percent: number; nextIncomplete?: ChecklistItem | null; earned: boolean } }

/** Replaces the shell after a save. */
// eslint-disable-next-line no-unused-vars
export type SetShell = (shell: Shell) => void
