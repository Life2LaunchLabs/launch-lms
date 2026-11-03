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

export interface PortfolioAccess { role: 'owner' | PortfolioRole | 'public'; can_comment: boolean; shared_privately: boolean; /** They switched on their plans for you in My people. */ plans?: boolean }

export interface ProfileGoal { goal_uuid: string; title: string; status: string; icon?: string | null; target_date?: string | null; can_comment: boolean }
export interface Profile { person: PersonSummary; goals: ProfileGoal[]; portfolio_role: string | null; chat_uuid: string | null; can_message: boolean }

export const portfolioPeopleKey = () => `${getAPIUrl()}portfolio/me/people`
export const profileKey = (username: string) => `${getAPIUrl()}connect/people/${q(username)}`

export const portfolioPeopleApi = {
  list: (token?: string) => request<PortfolioPeople>(portfolioPeopleKey(), token),
  add: (handle: string, role: PortfolioRole, token?: string) => request<PortfolioPeople>(portfolioPeopleKey(), token, 'POST', { handle, role }),
  update: (userUuid: string, role: PortfolioRole, token?: string) => request<PortfolioPeople>(`${portfolioPeopleKey()}/${q(userUuid)}`, token, 'PATCH', { role }),
  remove: (userUuid: string, token?: string) => request<PortfolioPeople>(`${portfolioPeopleKey()}/${q(userUuid)}`, token, 'DELETE'),
  profile: (username: string, token?: string) => request<Profile>(profileKey(username), token),
}
