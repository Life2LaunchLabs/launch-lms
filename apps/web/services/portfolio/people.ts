import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PersonSummary } from '@services/goals/types'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type PortfolioRole = 'viewer' | 'commenter'
export interface PortfolioPerson { user: PersonSummary; role: PortfolioRole; role_name: string; creation_date: string }
export interface PortfolioPeople { people: PortfolioPerson[]; choices: Array<{ key: PortfolioRole; name: string; hint: string }>; visibility: string }

export interface PortfolioComment {
  comment_uuid: string
  item_kind: 'portfolio' | 'project' | 'timeline'
  item_uuid: string | null
  body: string
  author: PersonSummary | null
  creation_date: string
  can_delete: boolean
}
export interface PortfolioThread extends PortfolioComment { replies: PortfolioComment[] }
export interface PortfolioComments { role: string; can_comment: boolean; threads: PortfolioThread[] }

/** What a signed-in visitor can do on a portfolio, from the shell. */
export interface PortfolioAccess { role: 'owner' | PortfolioRole | 'public'; can_comment: boolean; shared_privately: boolean }

export interface ProfileGoal { goal_uuid: string; title: string; status: string; icon?: string | null; target_date?: string | null; can_comment: boolean }
export interface Profile { person: PersonSummary; goals: ProfileGoal[]; portfolio_role: string | null; chat_uuid: string | null; can_message: boolean }

const shared = (orgId: number, username: string, path = '') => `${getAPIUrl()}portfolio/shared/${orgId}/${q(username)}${path}`
export const portfolioPeopleKey = () => `${getAPIUrl()}portfolio/me/people`
export const portfolioCommentsKey = (orgId: number, username: string) => shared(orgId, username, '/comments')
export const profileKey = (username: string) => `${getAPIUrl()}connect/people/${q(username)}`

export const portfolioPeopleApi = {
  list: (token?: string) => request<PortfolioPeople>(portfolioPeopleKey(), token),
  add: (handle: string, role: PortfolioRole, token?: string) => request<PortfolioPeople>(portfolioPeopleKey(), token, 'POST', { handle, role }),
  update: (userUuid: string, role: PortfolioRole, token?: string) => request<PortfolioPeople>(`${portfolioPeopleKey()}/${q(userUuid)}`, token, 'PATCH', { role }),
  remove: (userUuid: string, token?: string) => request<PortfolioPeople>(`${portfolioPeopleKey()}/${q(userUuid)}`, token, 'DELETE'),
  comments: (orgId: number, username: string, token?: string) => request<PortfolioComments>(portfolioCommentsKey(orgId, username), token),
  addComment: (orgId: number, username: string, data: { body: string; item_kind?: string; item_uuid?: string | null; parent_uuid?: string | null }, token?: string) =>
    request<PortfolioComment>(portfolioCommentsKey(orgId, username), token, 'POST', data),
  deleteComment: (orgId: number, username: string, commentUuid: string, token?: string) => request(shared(orgId, username, `/comments/${q(commentUuid)}`), token, 'DELETE'),
  profile: (username: string, token?: string) => request<Profile>(profileKey(username), token),
}
