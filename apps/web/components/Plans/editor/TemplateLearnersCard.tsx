'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { LearnerAccessSelect, learnerAccessLabel } from '@components/Learning/BadgeIssuing'
import { templateLearnersApi, templateLearnersKey, type TemplateLearners } from '@services/goals/templateLearners'
import type { LearnerAccess } from '@services/learning/marketplace'

/** The plan's learners and badges for this organization, shared by the Overview badge section and the Settings card. */
export function useTemplateLearners(orgId: number, templateUuid: string, token?: string) {
  return useSWR<TemplateLearners>(orgId && token ? templateLearnersKey(orgId, templateUuid) : null, () => templateLearnersApi.get(orgId, templateUuid, token), { revalidateOnFocus: false })
}

/**
 * "Who can start this plan": the running organization's own setting, so its admins change it even
 * on another organization's template. Learners find plans through the badges they earn on Discover.
 */
export default function TemplateLearnersCard({ orgId, templateUuid, token }: { orgId: number; templateUuid: string; token?: string }) {
  const { data, mutate } = useTemplateLearners(orgId, templateUuid, token)
  const [saving, setSaving] = React.useState(false)
  const change = async (access: LearnerAccess) => {
    setSaving(true)
    try {
      await mutate(await templateLearnersApi.set(orgId, templateUuid, access, token), false)
      toast.success(`Learners: ${learnerAccessLabel(access).toLowerCase()}.`)
    } catch (error: any) { toast.error(error?.message || 'Could not change who can start this plan.') } finally { setSaving(false) }
  }
  return <section aria-labelledby="template-learners-title" className="rounded-xl border border-border bg-card p-6 shadow-xs">
    <h2 id="template-learners-title" className="text-lg font-bold">Learners</h2>
    {!data ? <Loader2 className="mt-4 animate-spin text-muted-foreground" /> : data.earns_badge ? <>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.owned ? 'Learners who find its badge on Discover can start this plan with your organization.' : 'This setting is your organization’s own. The plan’s owner keeps the steps up to date.'}
      </p>
      <div className="mt-5">
        <LearnerAccessSelect label="Who can start this plan" value={data.access} disabled={saving || !data.can_edit} onChange={(value) => void change(value as LearnerAccess)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{data.access === 'invite' ? 'Its badge shows on Discover only if another organization offers it.' : 'Its badge shows on Discover, with your organization as a way to earn it.'}{data.can_edit ? '' : ' Your organization’s admins change this.'}</p>
    </> : <p className="mt-1 text-sm text-muted-foreground">Learners find plans through badges on Discover. This plan doesn’t earn a badge{data.badges.length ? ' your organization can issue' : ''}, so learners only get it when your team assigns it.</p>}
  </section>
}
