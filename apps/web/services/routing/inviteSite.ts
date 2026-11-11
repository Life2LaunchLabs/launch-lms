/**
 * An invitation link opened on another organization's site (the email named the inviter's site,
 * e.g. the main one; FEED-83): the organization whose site the sign-up page should move to, or null
 * to stay. Only invitations move; a join link's code belongs to the site it was made on.
 */
export function invitationSiteSlug(
  preview: { kind: string; org?: { slug?: string } | null } | null | undefined,
  pageOrgSlug: string | null | undefined,
): string | null {
  const slug = preview?.kind === 'invitation' ? preview.org?.slug : null
  return slug && pageOrgSlug && slug !== pageOrgSlug ? slug : null
}
