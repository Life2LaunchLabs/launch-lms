import type { TimelineEntry } from './Timeline'
import type { PortfolioAccess } from '@services/portfolio/people'
import type { GoalIcon } from '@services/goals/types'
import type { Highlight, PortfolioLayout } from '@services/portfolio/records'

export type { Highlight, PortfolioLayout }

/** The portfolio shell the API returns and the pieces of it the portfolio views read. */
export type Project = { project_uuid: string; slug: string; title: string; subtitle: string; summary: string; story_kind: string; status: string; featured: boolean; revision: number; start_date?: string; end_date?: string; is_ongoing?: boolean; cover_url?: string; cover_asset_uuid?: string; blocks: Array<{ block_uuid?: string; block_type: string; data: Record<string, any> }> }
/** A badge the learner earned (one award). */
export type PortfolioBadge = { award_uuid: string; code: string; template_uuid: string | null; name: string; description?: string; image_url?: string; icon?: GoalIcon | null; color?: string | null; kind: string; skills: string[]; earned_on: string; issuer: { name: string; slug: string } | null }
/** One of the learner's open plans that will earn a badge, with how far along it is. */
export type WorkingToward = { name: string; kind: string; image_url?: string; icon?: GoalIcon | null; color?: string | null; goal_uuid: string; plan_title: string; done: number; total: number }
export type PortfolioSection = { section_uuid: string; section_type: string; title_override?: string; enabled: boolean; sort_order: number }
export type ChecklistItem = { key: string; label: string; supportingText: string; href: string; complete: boolean }
export type Shell = PortfolioRecords & { portfolio: Record<string, any>; projects: Project[]; timeline: TimelineEntry[]; sections?: PortfolioSection[]; traits?: { strength?: string[]; value?: string[] }; badges?: { earned: PortfolioBadge[]; featured: PortfolioBadge[]; working_toward: WorkingToward[]; featuredAwardUuids: string[]; hiddenAwardUuids: string[] }; views: Array<{ key: string; visible: boolean; itemCount: number }>; readiness: { canPublish: boolean; blockers: string[] }; checklist?: { items: ChecklistItem[]; completed: number; total: number; percent: number; nextIncomplete?: ChecklistItem | null; earned: boolean }; access?: PortfolioAccess }

/** Who you are: legal name for rosters and reports, the name you go by everywhere else. Visitors get only ``shown_name``. */
export type Identity = { first_name?: string; last_name?: string; preferred_name?: string; legal_name?: string; shown_name: string }
export type Credential = { credential_uuid: string; kind: 'card' | 'certificate' | 'diploma' | 'test_score'; name: string; issuer: string; issued_on?: string | null; expires_on?: string | null; expected_on?: string | null; score: string; verification_status: string; photo_url?: string; timeline_uuid?: string | null; featured: boolean; visibility?: string; source?: string }
export type Quote = { quote_uuid: string; body: string; confirmed: boolean; name: string; role_label: string; timeline_uuid?: string | null; project_uuid?: string | null; featured: boolean; status?: string; contact_uuid?: string; visibility?: string }
export type Contact = { contact_uuid: string; name: string; role_label: string; email: string; phone: string; note: string; is_reference: boolean; on_app: boolean; timeline_uuid?: string | null; source?: string }
/** A result for "What I'm like". Plans can write these; ``source`` says where it came from. */
export type PortfolioResult = { result_uuid: string; kind: 'interests' | 'strengths' | 'values' | 'skills' | 'other'; name: string; summary: string; data: Record<string, any>; taken_on?: string | null; featured: boolean; source: string; visibility?: string }
export type ResumeVersion = { version_uuid: string; name: string; layout: string; accent: string; excluded: string[] }
export type PortfolioDocument = { document_uuid: string; kind: string; title: string; source: string; visibility: string; url: string; filename?: string; creation_date: string }
/** What the portfolio records add to the shell. Visitors never get contacts, résumé versions or documents. */
export type PortfolioRecords = { identity?: Identity | null; highlights?: Highlight[]; layout?: PortfolioLayout; credentials?: Credential[]; quotes?: Quote[]; results?: PortfolioResult[]; contacts?: Contact[]; resume_versions?: ResumeVersion[]; documents?: PortfolioDocument[] }

/** Replaces the shell after a save. */
// eslint-disable-next-line no-unused-vars
export type SetShell = (shell: Shell) => void
