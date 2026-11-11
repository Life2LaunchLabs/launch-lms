'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Building2, Check, ChevronRight, Globe2, Layers3, Loader2, MapPin, MessageCircle, PencilLine, Sparkles, X } from 'lucide-react'
import { useChatList } from '@components/Connect/useConnect'
import { ListRowSkeleton } from '@components/Objects/Loaders/OrgShellSkeleton'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import OrganizationMembershipActions from '@components/Organizations/OrganizationMembershipActions'
import YourRelationship from '@components/Organizations/YourRelationship'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { PlanTile, SectionTitle, Shelf, planHref } from '@components/Discover/PlanArt'
import { getOrgLogoMediaDirectory, getOrgThumbnailMediaDirectory } from '@services/media/media'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import type { DiscoverOrganization } from '@services/organizations/orgs'
import { planJoiningApi } from '@services/goals/planJoining'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { orgLabelText } from '@/lib/orgLabels'
import { pageLinks, pagePlans } from '@components/Organizations/publicPage'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { tr } from '@/lib/tr'

function SkeletonShelf() {
  return <div className="flex gap-[18px] overflow-hidden" aria-busy="true" aria-label={tr('organizations.page.loading_plans', 'Loading plans')}>
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[220px] w-[196px] shrink-0 animate-pulse rounded-[18px] bg-muted" />)}
  </div>
}

/** Your goals with this organization, from invitation through completion (members only). */
function YouAndOrg({ organization, token }: { organization: DiscoverOrganization; token?: string }) {
  const { goals: orgGoals, isLoading, respond } = useGoalInvitations()
  const [busy, setBusy] = React.useState<string | null>(null)
  const goals = orgGoals.filter((item) => item.organization.slug === organization.slug)
  const answer = async (invitation: OrgGoalInvitation, accept: boolean) => {
    setBusy(invitation.goal_uuid)
    try {
      await respond(invitation, accept)
      toast.success(accept ? tr('organizations.page.goal_accepted', 'Goal accepted.') : tr('organizations.page.goal_declined', 'Goal declined.'))
    } catch (error: any) {
      toast.error(error?.message || tr('organizations.page.could_not_answer', 'Could not answer this goal invitation.'))
    } finally {
      setBusy(null)
    }
  }
  return <section aria-labelledby="you-and-org" className="flex flex-col gap-4 rounded-[28px] bg-card p-6 nice-shadow md:p-7">
    <h2 id="you-and-org" className="m-0 text-xl font-extrabold tracking-tight">{tr('organizations.page.you_and_name', 'You and {{name}}', { name: organization.name })}</h2>
    <YourRelationship orgId={organization.id} token={token} showStaff={false} />
    {isLoading ? <div className="flex flex-col gap-3" role="status" aria-label="Loading"><ListRowSkeleton /><ListRowSkeleton /></div> : goals.length ? <div className="flex flex-col gap-3">{goals.map((item) => {
      const invited = item.status === 'pending'
      const status = invited ? tr('organizations.page.invited', 'Invited') : item.assignment.status !== 'ended' ? tr('organizations.page.active', 'Active') : tr('organizations.page.completed', 'Completed')
      return <article key={item.goal_uuid} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-800"><Layers3 size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="m-0 text-base font-black">{item.title}</h3><span className={invited ? 'rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700' : 'rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-black uppercase text-green-700'}>{status}</span></div>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{item.group?.name ? tr('organizations.page.through_group', 'Through {{name}}', { name: item.group.name }) : tr('organizations.page.just_for_you', 'Just for you')}{item.assignment.due_date ? ` · ${tr('organizations.page.due', 'Due {{date}}', { date: new Date(item.assignment.due_date).toLocaleDateString() })}` : ''}</p>
        </div>
        {invited ? <div className="grid shrink-0 grid-cols-2 gap-2">
          <button type="button" disabled={busy === item.goal_uuid} onClick={() => void answer(item, false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-black text-muted-foreground disabled:opacity-50"><X size={14} />{tr('organizations.page.decline', 'Decline')}</button>
          <button type="button" disabled={busy === item.goal_uuid} onClick={() => void answer(item, true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-black text-background disabled:opacity-50">{busy === item.goal_uuid ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}{tr('organizations.page.accept', 'Accept')}</button>
        </div> : <Link href={routePaths.org.plan(item.goal_uuid)} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground no-underline hover:bg-muted sm:self-auto">{tr('organizations.page.open_goal', 'Open goal')}<ChevronRight size={14} /></Link>}
      </article>
    })}</div> : null}
  </section>
}

/**
 * An organization's public page: who they are, the plans they offer, the badges those plans award,
 * and their story in their own words. It never shows people: no member count, no email, no faces.
 */
export default function OrganizationDetailClient({ organization, currentOrgslug }: { organization: DiscoverOrganization; currentOrgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: adminOrganizations } = useSWR(token ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const canAdmin = Array.isArray(adminOrganizations) && adminOrganizations.some((item: any) => item.slug === organization.slug)
  const { data: feed, error: feedError } = useSWR(['org-page-plans', organization.id, token || 'public'], () => planJoiningApi.discover(token, organization.id), { revalidateOnFocus: false })
  // Your chat with the organization, there once one of its plans is yours.
  const { data: chatList } = useChatList()
  const chat = organization.is_member ? chatList?.chats.find((item) => item.kind === 'school' && item.org?.slug === organization.slug) : undefined

  const plans = feed ? pagePlans([...feed.keep_going, ...feed.plans], organization.page) : []
  const badges = plans.filter((card) => card.badge)
  const links = pageLinks(organization)
  const highlights = (organization.page?.highlights || []).filter(Boolean)
  const kind = orgLabelText(organization.label)
  const chips = [kind, organization.page?.city].filter(Boolean)
  const story = organization.about && organization.about !== organization.description ? organization.about : ''
  const heroImage = organization.thumbnail_image ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image) : null
  const logoImage = organization.logo_image ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image) : null

  return <GeneralWrapperStyled>
    <div className="flex flex-col gap-8 pb-16">
      <Link href={getUriWithOrg(currentOrgslug, routePaths.org.discover())} className="inline-flex items-center gap-2 self-start text-sm font-medium text-muted-foreground no-underline transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{tr('organizations.page.discover', 'Discover')}
      </Link>

      <header className="overflow-hidden rounded-[28px] bg-card nice-shadow">
        <div className="relative h-48 bg-gradient-to-br from-muted via-card to-muted md:h-72">
          {heroImage ? <img src={heroImage} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Building2 className="h-12 w-12 text-muted-foreground" aria-hidden="true" /></div>}
        </div>
        <div className="flex flex-col gap-5 px-5 pb-6 md:flex-row md:items-end md:justify-between md:px-8">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="-mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-card bg-card shadow-sm md:h-28 md:w-28">
              {logoImage ? <img src={logoImage} alt={tr('organizations.page.name_logo', '{{name}} logo', { name: organization.name })} className="h-full w-full object-cover" /> : <Building2 className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
            </div>
            <h1 className="m-0 text-3xl font-extrabold tracking-tight md:text-4xl">{organization.name}</h1>
            {organization.description ? <p className="m-0 max-w-2xl text-base leading-7 text-muted-foreground">{organization.description}</p> : null}
            {chips.length ? <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
              {kind ? <span className="rounded-full bg-muted px-3 py-1">{kind}</span> : null}
              {organization.page?.city ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1"><MapPin size={14} aria-hidden="true" />{organization.page.city}</span> : null}
            </p> : null}
          </div>
          <div className="flex shrink-0 flex-col gap-2 md:items-end">
            {canAdmin ? <Link href={authenticatedOrgHref(getUriWithOrg(organization.slug, routePaths.org.admin.organization.publicPage()), true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background no-underline"><PencilLine size={16} />{tr('organizations.page.edit_page', 'Edit page')}</Link> : null}
            {chat ? <Link href={getUriWithOrg(currentOrgslug, routePaths.org.chat(chat.conversation_uuid))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background no-underline"><MessageCircle size={16} />{tr('organizations.page.message', 'Message')}</Link> : null}
            {!canAdmin ? <OrganizationMembershipActions organization={organization} currentOrgslug={currentOrgslug} showOpen={false} /> : null}
          </div>
        </div>
      </header>

      {organization.is_member && token ? <YouAndOrg organization={organization} token={token} /> : null}

      {highlights.length ? <ul aria-label={tr('organizations.page.highlights', 'Highlights')} className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
        {highlights.map((item) => <li key={item} className="flex items-start gap-2.5 rounded-2xl bg-card p-4 text-base font-bold nice-shadow"><Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--org-primary-color)]" aria-hidden="true" />{item}</li>)}
      </ul> : null}

      {feedError ? null : !feed ? <SkeletonShelf /> : plans.length ? <section aria-label={tr('organizations.page.plans_we_offer', 'Plans we offer')} className="flex flex-col gap-3.5">
        <SectionTitle>{tr('organizations.page.plans_we_offer', 'Plans we offer')}</SectionTitle>
        <Shelf label={tr('organizations.page.plans_we_offer', 'Plans we offer')}>{plans.map((card) => <PlanTile key={card.template_uuid} card={card} orgslug={currentOrgslug} />)}</Shelf>
      </section> : null}

      {badges.length ? <section aria-label={tr('organizations.page.badges_you_can_earn', 'Badges you can earn')} className="flex flex-col gap-3.5">
        <SectionTitle>{tr('organizations.page.badges_you_can_earn', 'Badges you can earn')}</SectionTitle>
        <Shelf label={tr('organizations.page.badges_you_can_earn', 'Badges you can earn')}>{badges.map((card) => <Link key={card.template_uuid} href={planHref(currentOrgslug, card.template_uuid)} className="flex w-[132px] shrink-0 flex-col items-center gap-2 text-center text-foreground no-underline">
          <BadgeMedal badge={{ ...card.badge!, icon: card.badge!.icon ?? card.icon, color: card.badge!.color ?? card.color }} size={96} />
          <span className="line-clamp-2 text-sm font-bold leading-tight">{card.badge!.name}</span>
        </Link>)}</Shelf>
      </section> : null}

      {story ? <section aria-labelledby="our-story" className="flex flex-col gap-3 rounded-[28px] bg-card p-6 nice-shadow md:p-8">
        <h2 id="our-story" className="m-0 text-xl font-extrabold tracking-tight">{tr('organizations.page.our_story', 'Our story')}</h2>
        <p className="m-0 max-w-3xl whitespace-pre-line text-base leading-7 text-muted-foreground">{story}</p>
      </section> : null}

      {links.length ? <section aria-labelledby="find-us" className="flex flex-col gap-3">
        <h2 id="find-us" className="m-0 text-xl font-extrabold tracking-tight">{tr('organizations.page.find_us', 'Find us')}</h2>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{links.map((link) => <li key={link.href}>
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-foreground no-underline nice-shadow hover:bg-muted"><Globe2 size={16} aria-hidden="true" />{link.label}</a>
        </li>)}</ul>
      </section> : null}
    </div>
  </GeneralWrapperStyled>
}
