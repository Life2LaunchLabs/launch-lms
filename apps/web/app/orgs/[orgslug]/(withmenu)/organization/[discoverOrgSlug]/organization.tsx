'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Building2, Check, ChevronRight, Globe2, Layers3, Loader2, Mail, Users, X } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import OrganizationMembershipActions from '@components/Organizations/OrganizationMembershipActions'
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
} from '@services/media/media'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import useSWR from 'swr'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { DiscoverOrganization } from '@services/organizations/orgs'
import useProgramInvitations, { ProgramInvitation } from '@components/Hooks/useProgramInvitations'

interface OrganizationDetailClientProps {
  organization: DiscoverOrganization
  currentOrgslug: string
}

export default function OrganizationDetailClient({
  organization,
  currentOrgslug,
}: OrganizationDetailClientProps) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: adminOrganizations } = useSWR(token ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { programs, isLoading: programsLoading, respond } = useProgramInvitations()
  const [busy, setBusy] = React.useState<string | null>(null)
  const organizationPrograms = programs.filter((item) => item.organization.slug === organization.slug)
  const canAdmin = Array.isArray(adminOrganizations) && adminOrganizations.some((item: any) => item.slug === organization.slug)
  const heroImage = organization.thumbnail_image
    ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
    : null
  const logoImage = organization.logo_image
    ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
    : null

  const respondToInvitation = async (invitation: ProgramInvitation, accept: boolean) => {
    setBusy(invitation.participant_uuid)
    try {
      await respond(invitation, accept)
      toast.success(accept ? 'Program accepted.' : 'Program invitation declined.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the program invitation.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <GeneralWrapperStyled>
      <div className="space-y-6">
        <Link
          href={getUriWithOrg(currentOrgslug, '/account/organizations')}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to organizations
        </Link>

        <div className="overflow-hidden rounded-[28px] border border-border bg-card nice-shadow">
          <div className="relative h-56 bg-gradient-to-br from-muted via-card to-slate-200 md:h-72">
            {heroImage ? (
              <img src={heroImage} alt={organization.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="rounded-3xl bg-card/80 p-6 shadow-sm">
                  <Building2 className="h-12 w-12 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="relative px-6 pb-6 pt-0 md:px-8">
            <div className="-mt-12 mb-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-card shadow-sm md:h-28 md:w-28">
              {logoImage ? (
                <img src={logoImage} alt={`${organization.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-10 w-10 text-muted-foreground" />
              )}
            </div>

            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {organization.is_member ? 'Member' : 'Explore'}
                  </span>
                  <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {organization.signup_mode === 'open' ? 'Open enrollment' : 'Invite only'}
                  </span>
                  {organization.label && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {organization.label}
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                    {organization.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                    {organization.description || organization.about || 'No description yet.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                    <Users className="h-4 w-4" />
                    <span>{organization.member_count} members</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                    <Globe2 className="h-4 w-4" />
                    <span>@{organization.slug}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2">
                    <Mail className="h-4 w-4" />
                    <span>{organization.email}</span>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-auto md:min-w-[260px]">
                <div className="rounded-2xl border border-border bg-muted/80 p-4">
                  <p className="mb-3 text-sm font-medium text-muted-foreground">Membership</p>
                  <p className="mb-4 text-sm text-muted-foreground">
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
                    canAdmin={canAdmin}
                  />
                </div>
              </div>
            </div>

            {organization.about && organization.about !== organization.description && (
              <div className="mt-8 rounded-2xl border border-border bg-muted/70 p-5">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  About
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">{organization.about}</p>
              </div>
            )}
          </div>
        </div>
        {token ? <section className="rounded-[28px] border border-border bg-card p-6 nice-shadow md:p-8">
          <div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Learning relationship</p><h2 className="mt-1 text-xl font-black text-foreground">Your programs with {organization.name}</h2><p className="mt-1 text-sm text-muted-foreground">Direct and group assignments appear here from invitation through completion.</p></div>
          {programsLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div> : organizationPrograms.length ? <div className="mt-5 space-y-3">{organizationPrograms.map((item) => {
            const invited = item.status === 'invited'
            const statusLabel = invited ? 'Invited' : item.assignment.active ? 'Active' : 'Completed'
            return <article key={item.participant_uuid} className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-800"><Layers3 size={20} /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-foreground">{item.program.name}</h3><span className={invited ? 'rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700' : 'rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-black uppercase text-green-700'}>{statusLabel}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.group?.name ? `Assigned through ${item.group.name}` : 'Assigned directly'}{item.assignment.due_date ? ` · Due ${new Date(item.assignment.due_date).toLocaleDateString()}` : ''}</p>{invited && item.assignment.welcome_message ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.assignment.welcome_message}</p> : null}</div>
              {invited ? <div className="grid shrink-0 grid-cols-2 gap-2"><button disabled={busy === item.participant_uuid} onClick={() => void respondToInvitation(item, false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-black text-muted-foreground disabled:opacity-50"><X size={14} />Decline</button><button disabled={busy === item.participant_uuid} onClick={() => void respondToInvitation(item, true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-black text-background disabled:opacity-50">{busy === item.participant_uuid ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Accept</button></div> : <Link href={routePaths.org.program(item.program.slug)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-black hover:bg-muted">Open program<ChevronRight size={14} /></Link>}
            </article>
          })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-10 text-center"><Layers3 className="mx-auto text-muted-foreground" size={28} /><p className="mt-2 text-sm font-semibold text-muted-foreground">You don’t have any programs with this organization yet.</p></div>}
        </section> : null}
      </div>
    </GeneralWrapperStyled>
  )
}
