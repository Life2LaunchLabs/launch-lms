import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** Who's setting up at /start (apps/api/src/services/orgs/onboarding.py ROLES). */
export type StartRole = 'parent' | 'mentor' | 'teacher' | 'program' | 'district'

/** A plan /start suggests for a role (apps/api/src/services/orgs/onboarding.py). */
export interface SuggestedPlan {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string | null
  step_count: number
  stage_count: number
  categories: string[]
  badge: boolean
  creator_org: { name: string } | null
}

export interface SetUpResult {
  org: { id: number; slug: string; name: string }
  added: Array<{ template_uuid: string; status: string; local_template_uuid: string | null }>
  failed: Array<{ template_uuid: string; detail: string }>
  trial: boolean
}

export const startKeys = { suggested: (role: StartRole) => `${getAPIUrl()}onboarding/suggested?role=${role}` }

export const startApi = {
  /** Readable before signing in. */
  suggested: async (role: StartRole): Promise<SuggestedPlan[]> => errorHandling(await fetch(startKeys.suggested(role))),
  setUp: async (body: { role: StartRole; name: string; org_name: string; color: string; plan_uuids: string[]; trial: boolean }, token: string): Promise<SetUpResult> =>
    errorHandling(await fetch(`${getAPIUrl()}onboarding/set-up`, RequestBodyWithAuthHeader('POST', body, null, token))),
}
