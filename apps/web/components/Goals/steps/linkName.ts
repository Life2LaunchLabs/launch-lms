import { getResource, getResourceUrlPreview } from '@services/resources/resources'
import { getLAUNCHLMS_TOP_DOMAIN_VAL } from '@services/config/config'
import { appLinkOf } from '@services/goals/appLinks'
import { planJoiningApi } from '@services/goals/planJoining'
import { normalizeMediaUrl } from '@services/media/media'
import { resourceImage } from '@components/Discover/ResourceCover'

export type LinkName = { title: string; og_image: string }

export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const storedImage = (url?: string | null) => url && /^(https?:\/\/|\/)/i.test(url) ? normalizeMediaUrl(url) : ''

/**
 * A link to the app's own resource or plan, named from the app: fetching the page itself gives
 * only the site's name (a resource opens as a sheet over Discover) or nothing behind a sign-in.
 */
async function appName(url: string, token?: string): Promise<LinkName | null> {
  const link = appLinkOf(url, getLAUNCHLMS_TOP_DOMAIN_VAL())
  if (!link) return null
  if (link.kind === 'resource') {
    const resource = await getResource(link.uuid, token)
    return resource?.title ? { title: resource.title, og_image: resourceImage(resource) || '' } : null
  }
  const plan = await planJoiningApi.plan(link.uuid, token)
  return plan?.title ? { title: plan.title, og_image: storedImage(plan.badge?.image_url) || storedImage(plan.thumbnail_image) } : null
}

/**
 * The name (and picture) to give a pasted link in a step: the app's own career, resource or
 * plan by its name, any other page by its title. Null when neither can be found.
 */
export async function nameLink(url: string, token?: string): Promise<LinkName | null> {
  const app = await appName(url, token).catch(() => null)
  if (app) return app
  const page = await getResourceUrlPreview(url, token).catch(() => null)
  const title = page?.title?.trim()
  return title ? { title, og_image: page?.og_image || '' } : null
}
