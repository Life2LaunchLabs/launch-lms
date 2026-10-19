'use client'

import React from 'react'
import useSWR from 'swr'
import { Award, Plus } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { AssignmentSection } from '@components/Goals/admin/templates/TemplateAssignments'
import { templateKeys, templatesApi, type IssuerBadgeRoute } from '@services/goals/templates'
import { eligibilityLabel } from '@services/goals/versions'

/**
 * Other organizations' badge templates this one is authorized to run. They're read-only here: the badge's owner
 * publishes new versions, and admins here decide per assignment whether to apply them.
 */
export default function BadgeTemplatesSection({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const { data: routes = [] } = useSWR<IssuerBadgeRoute[]>(orgId && token ? templateKeys.badgeRoutes(orgId) : null, () => templatesApi.badgeRoutes(orgId, token))
  if (!routes.length) return null
  return <section className="mt-6 rounded-xl bg-card p-6 shadow-xs">
    <div className="mb-5"><h2 className="text-lg font-bold text-foreground">Badge templates you run</h2><p className="mt-1 text-sm text-muted-foreground">Templates other organizations authorized you to run. Learners who finish earn their badge. When the owner publishes a new version, each assignment shows it here and you decide whether to apply it.</p></div>
    <div className="space-y-6">{routes.map((route) => <BadgeRouteCard key={route.route_uuid} route={route} orgslug={orgslug} orgId={orgId} token={token} />)}</div>
  </section>
}

function BadgeRouteCard({ route, orgslug, orgId, token }: { route: IssuerBadgeRoute; orgslug: string; orgId: number; token?: string }) {
  const active = route.assignments.filter((item) => item.status !== 'ended')
  return <article className="rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-amber-600">{route.badge.thumbnail_image ? <SafeImage src={route.badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award size={22} />}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-black">{route.template.title}</h3>
        <p className="text-xs text-muted-foreground">Earns {route.badge.name}{route.badge.owner_org ? ` · from ${route.badge.owner_org.name}` : ''} · {route.template.published_version ? `version ${route.template.published_version}` : 'not published yet'}</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{eligibilityLabel(route.rule, route.from_version)}</p>
      </div>
      {route.template.published_version ? <GoalAssignmentModal initialTemplateUuid={route.template.template_uuid}
        trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85"><Plus size={15} />Assign</button>} /> : null}
    </div>
    {route.assignments.length ? <div className="mt-4"><AssignmentSection title={`Assignments${active.length !== route.assignments.length ? ` (${active.length} current)` : ''}`} assignments={route.assignments} orgslug={orgslug} orgId={orgId} token={token} /></div> : null}
  </article>
}
