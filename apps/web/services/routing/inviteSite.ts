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

/**
 * Where someone goes right after accepting an organization invitation in the app (the Connect card
 * or the organization's page; FEED-84/95): staff and admins open that organization's welcome
 * (/joined: profile, then its admin home), like the invitation email's link. Learners stay put.
 * Takes the role as the invite preview names it ('admin' | 'staff' | 'learner') or as its id.
 */
export function acceptedInvitePath(role: string | number | null | undefined): string | null {
  return role === 'admin' || role === 'staff' || role === 1 || role === 2 ? '/joined' : null
}
