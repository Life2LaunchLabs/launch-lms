import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

/**
 * Get user by ID.
 *
 * SECURITY: Requires authentication to prevent user enumeration attacks.
 * The access_token parameter is required.
 */
export async function getUser(user_id: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}users/id/${user_id}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

/**
 * Get user by username.
 *
 * SECURITY: Requires authentication to prevent user enumeration attacks.
 * The access_token parameter is required.
 */
export async function getUserByUsername(username: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}users/username/${username}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function uploadUserProfileFeaturedImage(
  user_id: any,
  image_file: any,
  access_token: any
) {
  const formData = new FormData()
  formData.append('image_file', image_file)
  const result: any = await fetch(
    `${getAPIUrl()}users/upload_profile_featured_image/${user_id}`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

/**
 * Download my data: a zip of everything the platform keeps about the signed-in person, with their uploaded files.
 * Saves it in the browser and returns the file name.
 */
export async function downloadMyData(access_token: string): Promise<string> {
  const response = await fetch(`${getAPIUrl()}users/me/data-export`, RequestBodyWithAuthHeader('GET', null, null, access_token))
  if (!response.ok) {
    await errorHandling(response)
    throw new Error('Your data could not be downloaded.')
  }
  const header = response.headers.get('Content-Disposition') || ''
  const name = header.match(/filename="([^"]+)"/)?.[1] || 'launch-lms-data.zip'
  const href = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  return name
}
