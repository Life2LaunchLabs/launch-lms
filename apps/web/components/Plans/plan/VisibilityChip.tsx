'use client'

import React from 'react'
import useSWR from 'swr'
import { Globe } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useFeatures } from '@components/Hooks/useFeatures'
import type { TemplateDetail } from '@services/goals/templates'
import { MARKETPLACE_KEY, templateMarketplaceApi } from '@services/learning/marketplace'
import { cn } from '@/lib/utils'
import TemplateLearnersCard, { useTemplateLearners } from '@components/Plans/editor/TemplateLearnersCard'
import TemplatePublish from '@components/Plans/editor/TemplatePublish'

/** Whether this viewer sees who can find the plan, and what they'd see. */
export function useVisibility(orgId: number, token: string | undefined, template: TemplateDetail) {
  const features = useFeatures()
  const owned = Number(template.org_id) === orgId
  const publishes = owned && !template.read_only && !template.system_type && (features.has('plan_publishing') || features.has('badge_publishing'))
  const { data: learners } = useTemplateLearners(orgId, template.template_uuid, token)
  const { data: listing } = useSWR(publishes && token ? [MARKETPLACE_KEY, 'listing', orgId, template.template_uuid, token] : null, () => templateMarketplaceApi.listing(orgId, template.template_uuid, token))
  // Nothing to show: not a publisher, and learners can't start it here anyway.
  return { publishes, learners, listing, shown: publishes || !!learners?.earns_badge }
}

/**
 * The globe: who can find the live version. Other organizations (only on a plan you own, with the
 * publishing package) and learners starting it themselves (your organization's own setting, also on
 * plans you run for another organization).
 */
export default function VisibilityChip({ orgId, token, template, open, setOpen }: {
  orgId: number; token?: string; template: TemplateDetail; open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const { publishes, learners, listing, shown } = useVisibility(orgId, token, template)
  const learnersStart = !!learners?.earns_badge && learners.access !== 'invite'
  if (!shown) return null
  const orgs = !!listing?.listed
  const live = !!template.live_version
  const label = !live ? 'Not visible' : orgs && learnersStart ? 'Orgs + learners' : orgs ? 'Visible to orgs' : learnersStart ? 'Learners can start' : 'Not visible'
  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid="visibility-chip"
      className={cn('inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[12.5px]', live && (orgs || learnersStart)
        ? 'border-transparent bg-[hsl(174_55%_91%)] font-bold text-[#0B6B63] dark:bg-[hsl(174_40%_15%)] dark:text-[hsl(174_60%_66%)]' : 'border-border bg-card font-semibold text-muted-foreground hover:bg-muted')}>
      <Globe size={14} aria-hidden="true" />{label}
    </button>
    <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Who can find it" noPadding
      dialogDescription={live ? `Visibility applies to the live version${template.live_version?.semver ? `, v${template.live_version.semver}` : ''}.` : 'Nothing is visible until a version is live.'}
      dialogContent={<div className="space-y-6 p-5">
        <TemplateLearnersCard orgId={orgId} templateUuid={template.template_uuid} token={token} />
        {publishes ? <TemplatePublish bare orgId={orgId} token={token} template={template} /> : null}
      </div>} />
  </>
}
