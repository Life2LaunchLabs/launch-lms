'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Award, Loader2, Medal, Plus } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { useFeatures } from '@components/Hooks/useFeatures'
import { Input } from '@components/ui/input'
import { useTemplateLearners } from '@components/Plans/editor/TemplateLearnersCard'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import { smallActionClass, smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { createLearningBadge } from '@services/learning/learning'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import type { TemplateDetail } from '@services/goals/templates'
import type { TemplateEarnedBadge } from '@services/goals/templateLearners'
import { AsideCard, Tag } from './AsideCard'
import PlanDialog from './PlanDialog'

/** The credential learners earn by finishing the plan, or, on your own plan, adding one. */
export default function PlanBadgeCard({ orgslug, orgId, token, template, canEdit }: { orgslug: string; orgId: number; token?: string; template: TemplateDetail; canEdit: boolean }) {
  const { data, mutate } = useTemplateLearners(orgId, template.template_uuid, token)
  const features = useFeatures()
  const [adding, setAdding] = React.useState(false)
  if (!data) return null
  if (!data.badges.length) {
    if (!canEdit) return null
    const canCreate = features.has('badge_publishing')
    return <AsideCard icon={<Medal size={16} />} title="Badge" tag={<Tag>Off</Tag>}>
      <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">{canCreate ? 'Give learners who finish a credential and certificate they keep.' : 'Learners only get this plan when your team assigns it. Badge publishers can give plans a credential.'}</p>
      {canCreate ? <button type="button" className={smallActionClass + ' mt-3'} onClick={() => setAdding(true)}><Plus />Add a badge</button> : null}
      <AddBadge open={adding} setOpen={setAdding} orgslug={orgslug} orgId={orgId} token={token} template={template} onAdded={() => mutate()} />
    </AsideCard>
  }
  return <AsideCard icon={<Medal size={16} />} title={data.badges.length === 1 ? 'Badge' : 'Badges'}>
    <div className="flex flex-col gap-4">{data.badges.map((badge) => <EarnedBadge key={badge.route_uuid} badge={badge} orgslug={orgslug} orgId={orgId} color={coverPalette(template).deep} />)}</div>
  </AsideCard>
}

function EarnedBadge({ badge, orgslug, orgId, color }: { badge: TemplateEarnedBadge; orgslug: string; orgId: number; color: string }) {
  const own = badge.owner_org?.id === orgId || !badge.owner_org
  const facts = [badge.badge_version ? `Version ${badge.badge_version}` : 'Not published yet', own ? null : `From ${badge.owner_org?.name}`].filter(Boolean).join(' · ')
  return <div>
    <div className="mt-3 flex items-center gap-3.5">
      <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full text-white shadow-[inset_0_-4px_0_hsl(0_0%_0%/.18),0_6px_14px_hsl(0_0%_0%/.12)]" style={{ background: badge.thumbnail_image ? undefined : color }}>
        {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt="" className="h-full w-full object-contain" /> : <Award size={30} aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <b className="block truncate text-sm">{badge.name}</b>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">Awarded when a learner finishes every step.</span>
        <span className="block text-[12px] text-muted-foreground">{facts}</span>
      </span>
    </div>
    {badge.earns_here ? null : <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-300">Finishing it here doesn’t earn the badge: your organization isn’t authorized on this plan for it.</p>}
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid))} className={smallActionClass + ' mt-3'}>{own ? 'Edit credential' : 'View credential'}</Link>
  </div>
}

/** A new badge earned by finishing this plan: a name and how it's earned; the rest is on the badge's page. */
function AddBadge({ open, setOpen, orgslug, orgId, token, template, onAdded }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgslug: string; orgId: number; token?: string; template: TemplateDetail; onAdded: () => void
}) {
  const router = useRouter()
  const title = template.document?.template.title || template.title
  const [name, setName] = React.useState('')
  const [criteria, setCriteria] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open) { setName(title); setCriteria(`Finish every step of ${title}`) } }, [open, title])
  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const badge = await createLearningBadge({ org_id: orgId, name: name.trim(), criteria: criteria.trim(), description: '' }, token)
      await badgeRoutesApi.set(badge.badge_uuid, [{ template_uuid: template.template_uuid, recommended: true }], token)
      onAdded()
      setOpen(false)
      toast.success('Badge added. Finish its details and publish it.')
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid)))
    } catch (error: any) { toast.error(error?.message || 'Could not add the badge.') } finally { setBusy(false) }
  }
  return <PlanDialog open={open} onOpenChange={setOpen} title="Add a badge"
    footer={<><button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Cancel</button>
      <button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => void add()} disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : null}Add badge</button></>}>
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full text-white shadow-[inset_0_-4px_0_hsl(0_0%_0%/.18),0_6px_14px_hsl(0_0%_0%/.12)]" style={{ background: coverPalette(template).deep }}><Award size={34} aria-hidden="true" /></span>
        <span><b className="block text-sm">Learners who finish {title} earn this badge</b><span className="text-[12.5px] text-muted-foreground">It follows the Open Badges standard, so they can share it anywhere, and comes with a certificate.</span></span>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold">Badge name<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} /></label>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold">How it’s earned<Input value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={1000} /></label>
      <p className="text-[12.5px] text-muted-foreground">Its image, description and skills are on the badge’s page, where you publish it.</p>
    </div>
  </PlanDialog>
}
