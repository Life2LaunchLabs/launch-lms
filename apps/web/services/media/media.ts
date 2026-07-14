import { getBackendUrl, getConfig, getUriWithoutOrg } from '@services/config/config'

function getMediaUrl() {
  const mediaUrl = getConfig('NEXT_PUBLIC_LAUNCHLMS_MEDIA_URL')
  if (mediaUrl) {
    return mediaUrl
  }

  // Default browser media requests to same-origin so uploads, logos, and other
  // assets keep working on HTTPS, custom domains, and internal backend setups.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/`
  }

  // Server-rendered metadata can still build absolute URLs from the frontend
  // domain when no explicit media host is configured.
  return getUriWithoutOrg('/')
}

function getApiUrl() {
  return getBackendUrl()
}

export function normalizeMediaUrl(url?: string | null) {
  if (!url) return ''
  return url.replace('/api/v1/content/', '/content/')
}

function isStoredMediaUrl(fileId?: string | null) {
  if (!fileId) return false
  return /^https?:\/\//i.test(fileId) || fileId.startsWith('/content/') || fileId.startsWith('/api/v1/content/')
}

function resolveMediaFileId(fileId: string) {
  if (/^https?:\/\//i.test(fileId)) return fileId
  if (fileId.startsWith('/api/v1/content/')) return `${getMediaUrl()}${fileId.replace('/api/v1/', '')}`
  if (fileId.startsWith('/content/')) return `${getMediaUrl()}${fileId.replace(/^\//, '')}`
  return ''
}

function legacyMediaDirectory(fileId: string, buildUrl: () => string) {
  return isStoredMediaUrl(fileId) ? resolveMediaFileId(fileId) : buildUrl()
}

/**
 * Get the streaming URL for an activity video.
 * Uses the optimized streaming endpoint with proper Range request support.
 */
export function getActivityVideoStreamUrl(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  filename: string
) {
  return `${getApiUrl()}api/v1/stream/video/${orgUUID}/${courseUUID}/${activityUUID}/${filename}`
}

/**
 * Get the streaming URL for a video block.
 * Uses the optimized streaming endpoint with proper Range request support.
 */
export function getVideoBlockStreamUrl(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  blockUUID: string,
  filename: string
) {
  return `${getApiUrl()}api/v1/stream/block/${orgUUID}/${courseUUID}/${activityUUID}/${blockUUID}/${filename}`
}

/**
 * Get the streaming URL for an audio block.
 * Uses the optimized streaming endpoint with proper Range request support.
 */
export function getAudioBlockStreamUrl(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  blockUUID: string,
  filename: string
) {
  return `${getApiUrl()}api/v1/stream/block/audio/${orgUUID}/${courseUUID}/${activityUUID}/${blockUUID}/${filename}`
}

export function getCourseThumbnailMediaDirectory(
  orgUUID: string,
  courseUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseUUID}/thumbnails/${fileId}`)
}

export function getCourseCoreBackgroundMediaDirectory(
  orgUUID: string,
  courseUUID: string,
  fileId: string
) {
  return getCourseThumbnailMediaDirectory(orgUUID, courseUUID, fileId)
}

export function getBoardThumbnailMediaDirectory(
  orgUUID: string,
  boardUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/boards/${boardUUID}/thumbnails/${fileId}`)
}

export function getPlaygroundThumbnailMediaDirectory(
  orgUUID: string,
  playgroundUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/playgrounds/${playgroundUUID}/thumbnails/${fileId}`)
}

export function getCommunityThumbnailMediaDirectory(
  orgUUID: string,
  communityUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/communities/${communityUUID}/thumbnails/${fileId}`)
}

export function getResourceThumbnailMediaDirectory(
  orgUUID: string,
  resourceUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/resources/${resourceUUID}/thumbnails/${fileId}`)
}

export function getResourceChannelThumbnailMediaDirectory(
  orgUUID: string,
  channelUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/resource_channels/${channelUUID}/thumbnails/${fileId}`)
}

export function getResourceOutcomeMediaDirectory(
  userUUID: string,
  resourceUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/users/${userUUID}/resources/${resourceUUID}/outcomes/${fileId}`)
}

export function getCollectionThumbnailMediaDirectory(
  orgUUID: string,
  collectionUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/collections/${collectionUUID}/thumbnails/${fileId}`)
}

export function getOrgLandingMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/landing/${fileId}`)
}

export function getUserAvatarMediaDirectory(userUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/users/${userUUID}/avatars/${fileId}`)
}

export function getUserProfileCoverMediaDirectory(userUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/users/${userUUID}/profile_covers/${fileId}`)
}

export function getUserProfileFeaturedMediaDirectory(userUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/users/${userUUID}/profile_featured/${fileId}`)
}

export function getActivityBlockMediaDirectory(
  orgUUID: string,
  courseId: string,
  activityId: string,
  blockId: any,
  fileId: any,
  type: string
) {
  if (typeof fileId === 'string' && isStoredMediaUrl(fileId)) {
    return resolveMediaFileId(fileId)
  }
  if (type == 'pdfBlock') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseId}/activities/${activityId}/dynamic/blocks/pdfBlock/${blockId}/${fileId}`
    return uri
  }
  if (type == 'videoBlock') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseId}/activities/${activityId}/dynamic/blocks/videoBlock/${blockId}/${fileId}`
    return uri
  }
  if (type == 'imageBlock') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseId}/activities/${activityId}/dynamic/blocks/imageBlock/${blockId}/${fileId}`
    return uri
  }
  if (type == 'audioBlock') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseId}/activities/${activityId}/dynamic/blocks/audioBlock/${blockId}/${fileId}`
    return uri
  }
}

export function getTaskRefFileDir(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  assignmentUUID: string,
  assignmentTaskUUID: string,
  fileID : string

) {
  let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseUUID}/activities/${activityUUID}/assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/${fileID}`
  return uri
}

export function getTaskFileSubmissionDir(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  assignmentUUID: string,
  assignmentTaskUUID: string,
  fileSubID : string
) {
  let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseUUID}/activities/${activityUUID}/assignments/${assignmentUUID}/tasks/${assignmentTaskUUID}/subs/${fileSubID}`
  return uri
}

export function getActivityMediaDirectory(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  fileId: string,
  activityType: string
) {
  if (activityType == 'video') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseUUID}/activities/${activityUUID}/video/${fileId}`
    return uri
  }
  if (activityType == 'documentpdf') {
    let uri = `${getMediaUrl()}content/orgs/${orgUUID}/courses/${courseUUID}/activities/${activityUUID}/documentpdf/${fileId}`
    return uri
  }
}

export function getOrgLogoMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/logos/${fileId}`)
}

export function getOrgThumbnailMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/thumbnails/${fileId}`)
}

export function getOrgPreviewMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/previews/${fileId}`)
}

export function getOrgOgImageMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/og_images/${fileId}`)
}

export function getOrgAuthBackgroundMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/auth_backgrounds/${fileId}`)
}

export function getOrgFaviconMediaDirectory(orgUUID: string, fileId: string) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/favicons/${fileId}`)
}

/**
 * Get the URL for SCORM content files
 * Routes through a local proxy to ensure same-origin for SCORM API injection
 */
export function getScormContentUrl(
  orgUUID: string,
  courseUUID: string,
  activityUUID: string,
  filePath: string
): string {
  // Use local proxy route to serve SCORM content from same origin
  // This is required for the SCORM API to work properly in iframes
  return `/api/scorm/${activityUUID}/content/${filePath}`
}

/**
 * Get the thumbnail URL for a podcast
 */
export function getPodcastThumbnailMediaDirectory(
  orgUUID: string,
  podcastUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/podcasts/${podcastUUID}/thumbnails/${fileId}`)
}

/**
 * Get the thumbnail URL for a podcast episode
 */
export function getEpisodeThumbnailMediaDirectory(
  orgUUID: string,
  podcastUUID: string,
  episodeUUID: string,
  fileId: string
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/orgs/${orgUUID}/podcasts/${podcastUUID}/episodes/${episodeUUID}/thumbnails/${fileId}`)
}

/**
 * Get the direct media URL for a podcast episode audio file.
 */
export function getEpisodeAudioMediaDirectory(
  orgUUID: string,
  podcastUUID: string,
  episodeUUID: string,
  fileId: string
) {
  let uri = `${getMediaUrl()}content/orgs/${orgUUID}/podcasts/${podcastUUID}/episodes/${episodeUUID}/audio/${fileId}`
  return uri
}

/**
 * Get the streaming URL for a podcast episode audio file.
 * Uses the optimized streaming endpoint with proper Range request support.
 */
export function getPodcastAudioStreamUrl(
  orgUUID: string,
  podcastUUID: string,
  episodeUUID: string,
  filename: string
) {
  return `${getApiUrl()}api/v1/stream/audio/${orgUUID}/${podcastUUID}/${episodeUUID}/${filename}`
}
