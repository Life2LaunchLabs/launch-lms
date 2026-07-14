import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

export type MediaOwnerType = 'user' | 'org'
export type MediaSourceType = 'upload' | 'link'
export type MediaType = 'image' | 'video'

export type MediaOwner = {
  type: MediaOwnerType
  id: number
}

export type MediaAsset = {
  id: number
  asset_uuid: string
  owner_type: MediaOwnerType
  owner_user_id?: number | null
  owner_org_id?: number | null
  created_by_user_id?: number | null
  source_type: MediaSourceType
  media_type: MediaType
  title: string
  url: string
  thumbnail_url?: string | null
  filename?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  folder?: string | null
  creation_date: string
  update_date: string
}

export type MediaFolder = {
  id: number
  folder_uuid: string
  owner_type: MediaOwnerType
  owner_user_id?: number | null
  owner_org_id?: number | null
  created_by_user_id?: number | null
  name: string
  creation_date: string
  update_date: string
}

export async function listMediaAssets(
  owner: MediaOwner,
  mediaType: MediaType,
  accessToken: string,
  folder?: string
): Promise<MediaAsset[]> {
  const params = new URLSearchParams({
    owner_type: owner.type,
    owner_id: String(owner.id),
    media_type: mediaType,
  })
  if (folder) params.set('folder', folder)
  const result = await fetch(
    `${getAPIUrl()}media?${params.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function listMediaFolders(
  owner: MediaOwner,
  accessToken: string
): Promise<MediaFolder[]> {
  const params = new URLSearchParams({
    owner_type: owner.type,
    owner_id: String(owner.id),
  })
  const result = await fetch(
    `${getAPIUrl()}media/folders?${params.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function createMediaFolder(
  owner: MediaOwner,
  name: string,
  accessToken: string
): Promise<MediaFolder> {
  const result = await fetch(
    `${getAPIUrl()}media/folders`,
    RequestBodyWithAuthHeader('POST', { owner_type: owner.type, owner_id: owner.id, name }, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateMediaFolder(
  folderUuid: string,
  name: string,
  accessToken: string
): Promise<MediaFolder> {
  const result = await fetch(
    `${getAPIUrl()}media/folders/${folderUuid}`,
    RequestBodyWithAuthHeader('PATCH', { name }, null, accessToken)
  )
  return errorHandling(result)
}

export async function deleteMediaFolder(
  folderUuid: string,
  accessToken: string
): Promise<{ success: boolean }> {
  const result = await fetch(
    `${getAPIUrl()}media/folders/${folderUuid}`,
    RequestBodyWithAuthHeader('DELETE', {}, null, accessToken)
  )
  return errorHandling(result)
}

export async function updateMediaAssetFolder(
  assetUuid: string,
  folder: string | null,
  accessToken: string
): Promise<MediaAsset> {
  const result = await fetch(
    `${getAPIUrl()}media/${assetUuid}/folder`,
    RequestBodyWithAuthHeader('PATCH', { folder }, null, accessToken)
  )
  return errorHandling(result)
}

export async function uploadMediaAsset(
  owner: MediaOwner,
  mediaType: MediaType,
  file: File,
  accessToken: string,
  title?: string,
  folder?: string
): Promise<MediaAsset> {
  const formData = new FormData()
  formData.append('owner_type', owner.type)
  formData.append('owner_id', String(owner.id))
  formData.append('media_type', mediaType)
  formData.append('media_file', file)
  if (title) formData.append('title', title)
  if (folder) formData.append('folder', folder)
  const result = await fetch(
    `${getAPIUrl()}media/upload`,
    RequestBodyFormWithAuthHeader('POST', formData, null, accessToken)
  )
  return errorHandling(result)
}

export async function createMediaLinkAsset(
  owner: MediaOwner,
  mediaType: MediaType,
  url: string,
  accessToken: string,
  title?: string,
  folder?: string
): Promise<MediaAsset> {
  const result = await fetch(
    `${getAPIUrl()}media/link`,
    RequestBodyWithAuthHeader(
      'POST',
      {
        owner_type: owner.type,
        owner_id: owner.id,
        media_type: mediaType,
        url,
        title,
        folder,
      },
      null,
      accessToken
    )
  )
  return errorHandling(result)
}

export async function applyMediaAssetToUserAvatar(
  assetUuid: string,
  accessToken: string
) {
  const result = await fetch(
    `${getAPIUrl()}media/${assetUuid}/apply/user-avatar`,
    RequestBodyWithAuthHeader('POST', {}, null, accessToken)
  )
  return errorHandling(result)
}
