'use client'

import React from 'react'
import Link from 'next/link'
import { Award, ShieldCheck, Users } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { SectionCard } from '@components/Goals/admin/live/ui'
import { AccessChip, OfferedBy } from '@components/Learning/PlanAccessList'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { eligibilityLabel } from '@services/goals/versions'
import type { TemplateEarnedBadge } from '@services/goals/templateLearners'
import { useTemplateLearners } from './TemplateLearnersCard'

/** The badge side of a plan: which badge it earns, which versions count, who may run it, and who may start it here. */
export default function TemplateBadgeSection({ orgslug, orgId, token, templateUuid }: { orgslug: string; orgId: number; token?: string; templateUuid: string }) {
  const { data } = useTemplateLearners(orgId, templateUuid, token)
  if (!data) return null
  const settings = getUriWithOrg(orgslug, routePaths.org.admin.templatePage(templateUuid, 'settings'))
  return <SectionCard title={data.badges.length === 1 ? 'Badge' : 'Badges'}>
    {data.badges.length ? <div className="space-y-4">
      {data.badges.map((badge) => <EarnedBadge key={badge.route_uuid} badge={badge} orgslug={orgslug} orgId={orgId} />)}
      {data.earns_badge ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-[13px]">
        <span className="text-gray-500">Who can start it here</span>
        <span className="flex items-center gap-2"><AccessChip access={data.access} />{data.can_edit ? <Link href={settings} className="text-xs font-bold text-gray-900 hover:text-blue-700">Change</Link> : null}</span>
      </div> : null}
    </div> : <p className="text-sm text-gray-500">This plan doesn’t earn a badge. Learners find plans through badges on Discover, so they only get this one when your team assigns it.</p>}
  </SectionCard>
}

function EarnedBadge({ badge, orgslug, orgId }: { badge: TemplateEarnedBadge; orgslug: string; orgId: number }) {
  const ownBadge = badge.owner_org?.id === orgId
  return <div>
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid, 'routes'))} className="group flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-50 text-amber-600">{badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt="" className="h-full w-full object-contain" /> : <Award size={22} aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-950 group-hover:underline">{badge.name}</span>
        <span className="block truncate text-xs text-gray-500">{badge.badge_version ? `Version ${badge.badge_version}` : 'Not published yet'}{ownBadge || !badge.owner_org ? '' : ` · from ${badge.owner_org.name}`}{badge.recommended ? ' · Recommended way' : ''}</span>
      </span>
    </Link>
    <dl className="mt-3 space-y-1.5 text-[13px]">
      <div className="flex gap-2"><dt className="sr-only">Plan versions</dt><dd className="text-gray-700">{eligibilityLabel(badge.eligible_versions.rule, badge.eligible_versions.from_version)}</dd></div>
      <div className="flex items-start gap-2"><dt className="sr-only">Who may run it</dt>{badge.trusted_only ? <ShieldCheck size={14} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" /> : <Users size={14} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />}
        <dd className="text-gray-700">{badge.trusted_only ? `Trusted partners only${badge.partners.length ? `: ${badge.partners.map((partner) => partner.name).join(', ')}` : ''}` : 'Any organization approved to issue the badge'}</dd></div>
      {!badge.earns_here ? <div><dt className="sr-only">Here</dt><dd className="text-amber-800">Finishing it here doesn’t earn the badge: your organization isn’t approved to run this way to earn it.</dd></div> : null}
    </dl>
    <OfferedBy offers={badge.offered_by} className="mt-2" />
  </div>
}
