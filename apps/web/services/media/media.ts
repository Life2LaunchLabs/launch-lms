import { getConfig, getUriWithoutOrg } from '@services/config/config'

function getMediaUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === (getConfig('NEXT_PUBLIC_LAUNCHLMS_DEMO_HOST') || 'demo.life2launch.app')) {
    return `${window.location.origin}/`
  }
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

export function getResourceNoteMediaDirectory(
  userUUID: string,
  resourceUUID: string,
  fileId: string,
  storageDirectory = 'notes'
) {
  return legacyMediaDirectory(fileId, () => `${getMediaUrl()}content/users/${userUUID}/resources/${resourceUUID}/${storageDirectory}/${fileId}`)
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
