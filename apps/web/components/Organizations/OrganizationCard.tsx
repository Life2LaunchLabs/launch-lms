'use client'

import React from 'react'
import Link from 'next/link'
import { Building2, Users } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
} from '@services/media/media'
import { DiscoverOrganization, OrganizationInvitation } from '@services/organizations/orgs'
import OrganizationMembershipActions from '@components/Organizations/OrganizationMembershipActions'

interface OrganizationCardProps {
  organization: DiscoverOrganization
  currentOrgslug: string
  invitation?: OrganizationInvitation | null
  canAdmin?: boolean
}

export default function OrganizationCard({
  organization,
  currentOrgslug,
  invitation,
  canAdmin = false,
}: OrganizationCardProps) {
  const imageSrc = organization.thumbnail_image
    ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
    : organization.logo_image
      ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
      : null

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card nice-shadow transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={getUriWithOrg(currentOrgslug, `/organization/${organization.slug}`)} className="block">
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-muted via-card to-slate-200">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={organization.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card/90 shadow-sm">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        )}

        <div className="absolute left-4 top-4 flex gap-2">
          {invitation ? <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">Invited</span> : null}
          <span className="rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {organization.is_member ? 'Member' : 'Organization'}
          </span>
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            {organization.signup_mode === 'open' ? 'Open' : 'Invite only'}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <div className="mb-1 flex items-start justify-between gap-3">
            <h3 className="line-clamp-1 text-lg font-semibold text-foreground">
              {organization.name}
            </h3>
            {organization.label && (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {organization.label}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {organization.description || organization.about || 'Explore this organization and manage your membership.'}
          </p>
        </div>

        <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{organization.member_count} members</span>
          </div>
          <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            View details
          </span>
        </div>
      </div>
      </Link>
      {(invitation || canAdmin) ? <div className="border-t border-border px-5 py-4"><OrganizationMembershipActions organization={organization} currentOrgslug={currentOrgslug} compact showOpen={false} invitation={invitation} canAdmin={canAdmin} /></div> : null}
    </article>
  )
}
