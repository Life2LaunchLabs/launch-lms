'use client'

import React from 'react'
import Link from 'next/link'
import { Building2, Users } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
} from '@services/media/media'
import { DiscoverOrganization } from '@services/organizations/orgs'

interface OrganizationCardProps {
  organization: DiscoverOrganization
  currentOrgslug: string
}

export default function OrganizationCard({
  organization,
  currentOrgslug,
}: OrganizationCardProps) {
  const imageSrc = organization.thumbnail_image
    ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
    : organization.logo_image
      ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
      : null

  return (
    <Link
      href={getUriWithOrg(currentOrgslug, `/organization/${organization.slug}`)}
      className="group block overflow-hidden rounded-2xl border border-black/5 bg-white nice-shadow transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={organization.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-sm">
              <Building2 className="h-8 w-8 text-slate-400" />
            </div>
          </div>
        )}

        <div className="absolute left-4 top-4 flex gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
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
            <h3 className="line-clamp-1 text-lg font-semibold text-slate-900">
              {organization.name}
            </h3>
            {organization.label && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                {organization.label}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-sm text-slate-600">
            {organization.description || organization.about || 'Explore this organization and manage your membership.'}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{organization.member_count} members</span>
          </div>
          <span className="font-medium text-slate-700 transition-colors group-hover:text-black">
            View details
          </span>
        </div>
      </div>
    </Link>
  )
}
