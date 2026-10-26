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
  /** With a framework picked: how many of its requirements the plan counts toward, of how many. */
  covers?: number
  requirement_count?: number
}

/** A requirement framework from the library, offered before the plans. */
export interface StartFramework {
  framework_uuid: string
  name: string
  description: string
  requirement_count: number
  owner_org_name: string
}

export interface SetUpResult {
  org: { id: number; slug: string; name: string }
  /** The space's copy of the picked framework, or why it couldn't be copied. */
  framework: { framework_uuid: string; name: string } | { detail: string } | null
  added: Array<{ template_uuid: string; status: string; local_template_uuid: string | null }>
  failed: Array<{ template_uuid: string; detail: string }>
  trial: boolean
}

export const startKeys = {
  suggested: (role: StartRole, framework?: string | null) => `${getAPIUrl()}onboarding/suggested?role=${role}${framework ? `&framework=${encodeURIComponent(framework)}` : ''}`,
  frameworks: () => `${getAPIUrl()}onboarding/frameworks`,
}

export const startApi = {
  /** Readable before signing in. */
  suggested: async (role: StartRole, framework?: string | null): Promise<SuggestedPlan[]> => errorHandling(await fetch(startKeys.suggested(role, framework))),
  frameworks: async (): Promise<StartFramework[]> => errorHandling(await fetch(startKeys.frameworks())),
  setUp: async (body: { role: StartRole; name: string; org_name: string; color: string; plan_uuids: string[]; framework_uuid: string | null; trial: boolean }, token: string): Promise<SetUpResult> =>
    errorHandling(await fetch(`${getAPIUrl()}onboarding/set-up`, RequestBodyWithAuthHeader('POST', body, null, token))),
}
