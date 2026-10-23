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

/**
 * The globe: who can find the live version. Other organizations (only on a plan you own, with the
 * publishing package) and learners starting it themselves (your organization's own setting, also on
 * plans you run for another organization).
 */
export default function VisibilityChip({ orgId, token, template, open, setOpen }: {
  orgId: number; token?: string; template: TemplateDetail; open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const features = useFeatures()
  const owned = Number(template.org_id) === orgId
  const publishes = owned && !template.read_only && !template.system_type && (features.has('plan_publishing') || features.has('badge_publishing'))
  const { data: learners } = useTemplateLearners(orgId, template.template_uuid, token)
  const { data: listing } = useSWR(publishes && token ? [MARKETPLACE_KEY, 'listing', orgId, template.template_uuid, token] : null, () => templateMarketplaceApi.listing(orgId, template.template_uuid, token))
  const learnersStart = !!learners?.earns_badge && learners.access !== 'invite'
  // Nothing to show: not a publisher, and learners can't start it here anyway.
  if (!publishes && !learners?.earns_badge) return null
  const orgs = !!listing?.listed
  const live = !!template.live_version
  const label = !live ? 'Not visible' : orgs && learnersStart ? 'Orgs + learners' : orgs ? 'Visible to orgs' : learnersStart ? 'Learners can start' : 'Not visible'
  return <>
    <button type="button" onClick={() => setOpen(true)} data-testid="visibility-chip"
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold', live && (orgs || learnersStart) ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
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
