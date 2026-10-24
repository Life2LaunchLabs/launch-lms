'use client'

import React from 'react'
import Link from 'next/link'
import { Download, ShieldCheck } from 'lucide-react'
import Certificate from '@components/Badges/Certificate'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { badgeAwardsApi, badgeKindLabel, type BadgeAward } from '@services/badges/badges'
import { CHUNKY } from '@components/Discover/PlanArt'
import { cn } from '@/lib/utils'

const longDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** One badge a learner earned, as anyone with the link sees it: who earned it, the badge, and its certificate. */
export default function AwardPage({ orgslug, award }: { orgslug: string; award: BadgeAward }) {
  const badge = award.achievement
  const learner = award.learner?.name || award.learner?.username || 'A learner'
  const org = award.issuing_org
  const [here, setHere] = React.useState('')
  React.useEffect(() => setHere(window.location.href), [])
  const kind = badgeKindLabel(badge.kind).toLowerCase()
  return <div className="min-h-screen bg-background text-[15px] leading-[1.45] text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1056px] flex-wrap items-center gap-5 px-4 py-8 sm:px-6">
        <BadgeMedal badge={badge} size={88} />
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#DDF1E8] px-2.5 py-1 text-xs font-black text-[#0B5F57]"><ShieldCheck size={13} aria-hidden="true" />Verified Open Badge</span>
          <h1 className="m-0 text-3xl font-bold leading-tight tracking-tight">{learner} earned {badge.name}</h1>
          <p className="m-0 text-muted-foreground">
            {org ? <>Awarded by {org.name} on {longDate(award.earned_on)}</> : <>Earned on {longDate(award.earned_on)}</>}
            {award.source === 'direct_award' && award.awarded_by ? ` · given by ${award.awarded_by.name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {badge.template_uuid ? <Link href={getUriWithOrg(orgslug, routePaths.org.discoverPlan(badge.template_uuid))} className={cn(CHUNKY, 'no-underline')}>See how to earn it</Link> : null}
          <a href={badgeAwardsApi.credentialUrl(award.award_uuid)} download={`${badge.name}.json`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold text-foreground no-underline hover:bg-muted">
            <Download size={16} aria-hidden="true" />Credential
          </a>
        </div>
      </div>
    </header>
    <main className="mx-auto flex max-w-[1056px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
      <Certificate
        badge={badge}
        style={badge.style}
        learner={learner}
        awardedBy={org ? { name: org.name, logo_url: org.logo_image && org.org_uuid ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : null } : null}
        date={longDate(award.earned_on)}
        code={award.award_uuid.replace(/^award_/, '').slice(0, 13).toUpperCase()}
        verifyUrl={here || undefined}
      />
      <section aria-labelledby="about-title" className="flex flex-col gap-3 rounded-[28px] bg-card p-6 sm:p-7">
        <h2 id="about-title" className="m-0 text-xl font-semibold">About this {kind}</h2>
        {badge.description ? <p className="m-0">{badge.description}</p> : null}
        {badge.skills.length ? <div className="flex flex-wrap gap-1.5">{badge.skills.map((skill) => <span key={skill} className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold">{skill}</span>)}</div> : null}
        {badge.criteria_narrative ? <p className="m-0 whitespace-pre-line text-muted-foreground">{badge.criteria_narrative}</p> : null}
        {award.statement ? <blockquote className="m-0 border-l-4 border-border pl-4 italic">{award.statement}</blockquote> : null}
        {award.evidence_url ? <a href={award.evidence_url} className="self-start font-bold">See the evidence</a> : null}
        <p className="m-0 text-xs text-muted-foreground">{badge.creator ? `Made by ${badge.creator.name}` : ''}{award.semver ? ` · version ${award.semver}` : ''}</p>
      </section>
    </main>
  </div>
}
