import type { DiscoverOrganization, PublicPageGap } from '@services/organizations/orgs'
import type { PlanOfferCard } from '@services/goals/planJoining'
import { tr } from '@/lib/tr'

const SOCIAL_NAMES: Record<string, string> = { twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube' }
const isWebLink = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim())

/** The plans the organization offers on its page: pinned ones first, hidden ones left out. */
export function pagePlans(cards: PlanOfferCard[], page: DiscoverOrganization['page']): PlanOfferCard[] {
  const hidden = new Set(page?.hidden_plans || [])
  const pinned = page?.pinned_plans || []
  const unique = cards.filter((card, index) => !hidden.has(card.template_uuid) && cards.findIndex((other) => other.template_uuid === card.template_uuid) === index)
  const rank = (card: PlanOfferCard) => { const at = pinned.indexOf(card.template_uuid); return at < 0 ? pinned.length : at }
  return [...unique].sort((a, b) => rank(a) - rank(b))
}

/** The organization's links people can open: its website, then its socials. Only web links. */
export function pageLinks(organization: Pick<DiscoverOrganization, 'page' | 'socials'>): { label: string; href: string }[] {
  const links = isWebLink(organization.page?.website) ? [{ label: tr('organizations.page.website', 'Website'), href: organization.page.website.trim() }] : []
  for (const [key, value] of Object.entries(organization.socials || {})) {
    if (SOCIAL_NAMES[key] && isWebLink(value)) links.push({ label: SOCIAL_NAMES[key], href: value.trim() })
  }
  return links
}

/** The checklist above "List us in Discover": what the page still needs before Discover can list it. */
export function pageGaps(organization: Pick<DiscoverOrganization, 'thumbnail_image' | 'description'>, planCount: number): PublicPageGap[] {
  const gaps: PublicPageGap[] = []
  if (!organization.thumbnail_image) gaps.push('cover')
  if (!(organization.description || '').trim()) gaps.push('tagline')
  if (planCount < 1) gaps.push('plan')
  return gaps
}
