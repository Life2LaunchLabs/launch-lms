'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Ban, Check, Download, FileDown, Route, ShieldCheck, X } from 'lucide-react'
import Certificate from '@components/Badges/Certificate'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { certificateFileName, downloadCertificatePdf } from '@components/Badges/awardSharing'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { badgeAwardsApi, badgeKindLabel, type AwardCheck, type BadgeAward } from '@services/badges/badges'
import { cn } from '@/lib/utils'

const longDate = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const ACTION = 'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold text-foreground no-underline hover:bg-muted disabled:opacity-60'

/** What the server's check found, as the tag above the heading says it. */
function CheckTag({ revoked, check }: { revoked: boolean; check: AwardCheck | null }) {
  if (revoked) return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-800 dark:bg-red-950 dark:text-red-200"><Ban size={13} aria-hidden="true" />Revoked</span>
  if (check?.verified) return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#DDF1E8] px-2.5 py-1 text-xs font-black text-[#0B5F57]"><ShieldCheck size={13} aria-hidden="true" />Verified Open Badge</span>
  return <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-muted px-2.5 py-1 text-xs font-black text-muted-foreground">Open Badge</span>
}

/** One line of the issuer card: a check the server made, passed or not. */
function CheckLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2">
    <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', ok ? 'bg-[#DDF1E8] text-[#0B5F57]' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200')}>
      {ok ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : <X size={12} strokeWidth={3} aria-hidden="true" />}
    </span>
    <span>{children}</span>
  </li>
}

/**
 * One badge a learner earned, as anyone with its short link sees it: the badge and who earned it over the
 * certificate, the ways to keep and share it, how it's earned, and the issuer's signed, checked record of it.
 */
export default function AwardPage({ orgslug, award, check = null, pageUrl }: { orgslug: string; award: BadgeAward; check?: AwardCheck | null; pageUrl: string }) {
  const badge = award.achievement
  const learner = award.learner?.name || award.learner?.username || 'A learner'
  const org = award.issuing_org
  const kind = badgeKindLabel(badge.kind).toLowerCase()
  const revoked = award.status === 'revoked' || Boolean(check?.revoked)
  const direct = award.source === 'direct_award'
  const certificate = React.useRef<HTMLDivElement>(null)
  const [saving, setSaving] = React.useState(false)

  const savePdf = async () => {
    const element = certificate.current?.querySelector<HTMLElement>('.cert')
    if (!element) return
    setSaving(true)
    try {
      await downloadCertificatePdf(element, certificateFileName(award))
    } catch {
      toast.error('Could not make the PDF. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="min-h-screen bg-background text-[15px] leading-[1.45] text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1056px] flex-wrap items-center gap-5 px-4 py-8 sm:px-6">
        <BadgeMedal badge={badge} size={88} />
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <CheckTag revoked={revoked} check={check} />
          <h1 className="m-0 text-3xl font-bold leading-tight tracking-tight">{learner} earned {badge.name}</h1>
          <p className="m-0 text-muted-foreground">{org ? <>Awarded by {org.name} on {longDate(award.earned_on)}</> : <>Earned on {longDate(award.earned_on)}</>}</p>
        </div>
      </div>
    </header>
    <main className="mx-auto flex max-w-[1056px] flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      {revoked ? <p role="status" className="m-0 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <b>{org?.name || 'The issuer'} revoked this {kind}{award.revoked_at ? ` on ${longDate(award.revoked_at)}` : ''}.</b> It no longer counts as earned.{award.revoked_reason ? ` Reason: ${award.revoked_reason}` : ''}
      </p> : null}
      <div ref={certificate} className={cn(revoked && 'opacity-50 grayscale')} aria-label={`${badge.name} certificate`}>
        <Certificate
          badge={badge}
          style={badge.style}
          learner={learner}
          awardedBy={org ? { name: org.name, logo_url: org.logo_image && org.org_uuid ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : null } : null}
          date={longDate(award.earned_on)}
          code={award.code}
          verifyUrl={pageUrl}
          verified={!revoked}
        />
      </div>
      {!revoked ? <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={savePdf} disabled={saving} className={ACTION}><FileDown size={16} aria-hidden="true" />{saving ? 'Making PDF…' : 'Download PDF'}</button>
        <a href={badgeAwardsApi.credentialUrl(award.award_uuid)} download={`${badge.name}.json`} className={ACTION}><Download size={16} aria-hidden="true" />Download Open Badge</a>
      </div> : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="about-title" className="flex flex-col gap-3 rounded-[28px] bg-card p-6 sm:p-7">
            <h2 id="about-title" className="m-0 text-xl font-semibold">About this {kind}</h2>
            {badge.description ? <p className="m-0">{badge.description}</p> : null}
            {badge.skills.length ? <div className="flex flex-wrap gap-1.5" aria-label="Skills">{badge.skills.map((skill) => <span key={skill} className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold">{skill}</span>)}</div> : null}
            {badge.template_uuid ? <Link href={getUriWithOrg(orgslug, routePaths.org.discoverPlan(badge.template_uuid))} className="inline-flex items-center gap-1.5 self-start font-bold">
              <Route size={16} aria-hidden="true" />How it&rsquo;s earned
            </Link> : null}
          </section>
          {direct ? <section aria-labelledby="equivalent-title" className="flex flex-col gap-2 rounded-[28px] border border-border p-6 sm:p-7">
            <h2 id="equivalent-title" className="m-0 text-base font-semibold">Awarded for equivalent work</h2>
            <p className="m-0 text-sm text-muted-foreground">
              {award.awarded_by ? `${award.awarded_by.name}` : 'Staff'}{org ? ` at ${org.name}` : ''} signed off that {learner} did work equal to the whole plan, outside it.
            </p>
            {award.statement ? <blockquote className="m-0 whitespace-pre-line border-l-4 border-border pl-4">{award.statement}</blockquote> : null}
            {award.evidence_url ? <a href={award.evidence_url} target="_blank" rel="noopener noreferrer" className="self-start font-bold">See the work</a> : null}
          </section> : null}
        </div>
        <aside aria-labelledby="issuer-title" className="flex flex-col gap-3 self-start rounded-[28px] bg-card p-6">
          <h2 id="issuer-title" className="m-0 text-base font-semibold">Issued by {org?.name || 'an organization no longer on Launch LMS'}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            <CheckLine ok={Boolean(check?.proof)}>{check?.proof ? `Signed by ${org?.name || 'the issuer'}, and unchanged since` : 'Its signature could not be checked'}</CheckLine>
            <CheckLine ok={!revoked}>{revoked ? 'Revoked by the issuer' : 'Not revoked'}</CheckLine>
          </ul>
          <p className="m-0 text-xs text-muted-foreground">
            An Open Badges 3.0 credential. Code {award.code}{award.semver ? ` · version ${award.semver}` : ''}{badge.creator && badge.creator.id !== org?.id ? ` · plan by ${badge.creator.name}` : ''}
          </p>
        </aside>
      </div>
    </main>
  </div>
}
