import { getAPIUrl } from '@services/config/config'
import { RequestBody, getResponseMetadata } from '@services/utils/ts/requests'

export async function sendResetLink(email: string, org_id: number) {
  const result = await fetch(
    `${getAPIUrl()}users/reset_password/send_reset_code/${email}?org_id=${org_id}`,
    RequestBody('POST', null, null)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function resetPassword(
  email: string,
  new_password: string,
  org_id: number,
  reset_code: string
) {
  const result = await fetch(
    `${getAPIUrl()}users/reset_password/change_password/${email}`,
    RequestBody('POST', { new_password, org_id, reset_code }, null)
  )
  const res = await getResponseMetadata(result)
  return res
}

// signup

interface NewAccountBody {
  username: string
  email: string
  password: string
  org_slug: string
  org_id: string
}

export async function signup(body: NewAccountBody): Promise<any> {
  const HeadersConfig = new Headers({ 'Content-Type': 'application/json' })

  const requestOptions: any = {
    method: 'POST',
    headers: HeadersConfig,
    body: JSON.stringify(body),
    redirect: 'follow',
    credentials: 'include',
  }

  const res = await fetch(`${getAPIUrl()}users/${body.org_id}`, requestOptions)

  return res
}

/** @deprecated Compatibility for already-issued inviteCode URLs. */
export async function signUpWithInviteCode(
  body: NewAccountBody,
  invite_code: string
): Promise<any> {
  const HeadersConfig = new Headers({ 'Content-Type': 'application/json' })

  const requestOptions: any = {
    method: 'POST',
    headers: HeadersConfig,
    body: JSON.stringify(body),
    redirect: 'follow',
    credentials: 'include',
  }

  const res = await fetch(
    `${getAPIUrl()}users/${body.org_id}/invite/${invite_code}`,
    requestOptions
  )

  return res
}

export async function signUpWithInvitation(
  body: NewAccountBody,
  invitationToken: string
): Promise<any> {
  return fetch(
    `${getAPIUrl()}users/${body.org_id}/invitation/${encodeURIComponent(invitationToken)}`,
    {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'include',
    }
  )
}

// Email Verification

export async function verifyEmail(
  token: string,
  userUuid: string,
  orgUuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const HeadersConfig = new Headers({ 'Content-Type': 'application/json' })

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: HeadersConfig,
      body: JSON.stringify({
        token,
        user_uuid: userUuid,
        org_uuid: orgUuid,
      }),
    }

    const response = await fetch(`${getAPIUrl()}auth/verify-email`, requestOptions)
    const data = await response.json()

    if (response.ok) {
      return { success: true }
    } else {
      return {
        success: false,
        error: data.detail || 'Verification failed',
      }
    }
  } catch {
    return {
      success: false,
      error: 'An error occurred during verification',
    }
  }
}

export async function resendVerificationEmail(
  email: string,
  orgId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const HeadersConfig = new Headers({ 'Content-Type': 'application/json' })

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: HeadersConfig,
      body: JSON.stringify({
        email,
        org_id: orgId,
      }),
    }

    const response = await fetch(`${getAPIUrl()}auth/resend-verification`, requestOptions)
    const data = await response.json()

    if (response.ok) {
      return { success: true }
    } else {
      return {
        success: false,
        error: data.detail || 'Failed to resend verification email',
      }
    }
  } catch {
    return {
      success: false,
      error: 'An error occurred',
    }
  }
}
