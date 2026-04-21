'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Globe2, Mail, Users } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import OrganizationMembershipActions from '@components/Organizations/OrganizationMembershipActions'
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
} from '@services/media/media'
import { getUriWithOrg } from '@services/config/config'
import { DiscoverOrganization } from '@services/organizations/orgs'

interface OrganizationDetailClientProps {
  organization: DiscoverOrganization
  currentOrgslug: string
}

export default function OrganizationDetailClient({
  organization,
  currentOrgslug,
}: OrganizationDetailClientProps) {
  const heroImage = organization.thumbnail_image
    ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
    : null
  const logoImage = organization.logo_image
    ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
    : null

  return (
    <GeneralWrapperStyled>
      <div className="space-y-6">
        <Link
          href={getUriWithOrg(currentOrgslug, '/organizations')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to organizations
        </Link>

        <div className="overflow-hidden rounded-[28px] border border-black/5 bg-white nice-shadow">
          <div className="relative h-56 bg-gradient-to-br from-slate-100 via-white to-slate-200 md:h-72">
            {heroImage ? (
              <img src={heroImage} alt={organization.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="rounded-3xl bg-white/80 p-6 shadow-sm">
                  <Building2 className="h-12 w-12 text-slate-400" />
                </div>
              </div>
            )}
          </div>

          <div className="relative px-6 pb-6 pt-0 md:px-8">
            <div className="-mt-12 mb-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-white shadow-sm md:h-28 md:w-28">
              {logoImage ? (
                <img src={logoImage} alt={`${organization.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-10 w-10 text-slate-400" />
              )}
            </div>

            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {organization.is_member ? 'Member' : 'Explore'}
                  </span>
                  <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {organization.signup_mode === 'open' ? 'Open enrollment' : 'Invite only'}
                  </span>
                  {organization.label && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {organization.label}
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                    {organization.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                    {organization.description || organization.about || 'No description yet.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2">
                    <Users className="h-4 w-4" />
                    <span>{organization.member_count} members</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2">
                    <Globe2 className="h-4 w-4" />
                    <span>@{organization.slug}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2">
                    <Mail className="h-4 w-4" />
                    <span>{organization.email}</span>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-auto md:min-w-[260px]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-700">Membership</p>
                  <p className="mb-4 text-sm text-slate-500">
                    {organization.is_member
                      ? 'You are enrolled in this organization.'
                      : organization.signup_mode === 'open'
                        ? 'You can join this organization right away.'
                        : 'This organization currently requires an invite to join.'}
                  </p>
                  <OrganizationMembershipActions
                    organization={organization}
                    currentOrgslug={currentOrgslug}
                    showOpen={false}
                  />
                </div>
              </div>
            </div>

            {organization.about && organization.about !== organization.description && (
              <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  About
                </h2>
                <p className="text-sm leading-7 text-slate-600">{organization.about}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </GeneralWrapperStyled>
  )
}
