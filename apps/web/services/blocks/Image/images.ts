import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyFormWithAuthHeader,
  RequestBodyWithAuthHeader,
} from '@services/utils/ts/requests'
import { MediaAsset } from '@services/media/library'

export function getImageBlockFileId(blockObject: any) {
  if (!blockObject?.content) return ''
  if (blockObject.content.url) return blockObject.content.url
  if (!blockObject.content.file_id) return ''
  return blockObject.content.file_format
    ? `${blockObject.content.file_id}.${blockObject.content.file_format}`
    : blockObject.content.file_id
}

export function mediaAssetToImageBlockObject(asset: MediaAsset, activityUuid: string) {
  return {
    id: asset.id,
    block_uuid: `block_${asset.asset_uuid}`,
    block_type: 'imageBlock',
    content: {
      file_id: asset.url,
      file_format: '',
      url: asset.url,
      title: asset.title,
      activity_uuid: activityUuid,
      source_type: asset.source_type,
      media_asset_uuid: asset.asset_uuid,
    },
  }
}

export async function uploadNewImageFile(
  file: any,
  activity_uuid: string,
  access_token: string
) {
  // Send file thumbnail as form data
  const formData = new FormData()
  formData.append('file_object', file)
  formData.append('activity_uuid', activity_uuid)

  const result = await fetch(
    `${getAPIUrl()}blocks/image`,
    RequestBodyFormWithAuthHeader('POST', formData, null, access_token)
  )

  const data = await result.json()

  if (!result.ok) {
    const errorMessage = typeof data?.detail === 'string'
      ? data.detail
      : Array.isArray(data?.detail)
        ? data.detail.map((e: any) => e.msg).join(', ')
        : 'Upload failed'
    throw new Error(errorMessage)
  }

  return data
}

export async function getImageFile(file_id: string, access_token: string) {
  // todo : add course id to url
  return fetch(
    `${getAPIUrl()}blocks/image?file_id=${file_id}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
    .then((result) => result.json())
    .catch((error) => console.error('error', error))
}
