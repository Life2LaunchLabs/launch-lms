import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  getResponseMetadata,
} from '@services/utils/ts/requests'

/*
 This file includes only POST, PUT, DELETE requests
 GET requests are called from the frontend using SWR (https://swr.vercel.app/)
*/

export async function updateProfile(
  data: any,
  user_id: number,
  access_token: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}users/` + user_id,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}

export async function devSeedProfile(access_token: string) {
  const result: any = await fetch(
    `${getAPIUrl()}dev/seed_profile`,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res
}
