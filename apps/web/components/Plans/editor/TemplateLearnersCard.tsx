'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { LEARNER_ACCESS_OPTIONS, learnerAccessLabel, templateLearnersApi, templateLearnersKey, type LearnerAccess, type TemplateLearners } from '@services/goals/templateLearners'

/** The plan's learner setting for this organization, shared by the badge card and the Settings card. */
export function useTemplateLearners(orgId: number, templateUuid: string, token?: string) {
  return useSWR<TemplateLearners>(orgId && token ? templateLearnersKey(orgId, templateUuid) : null, () => templateLearnersApi.get(orgId, templateUuid, token), { revalidateOnFocus: false })
}

/**
 * "Who can start this plan": the running organization's own setting, so its admins change it even
 * on another organization's template. Open and by-request plans show on Discover.
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
  const selected = LEARNER_ACCESS_OPTIONS.find((option) => option.value === data?.access)
  return <section aria-labelledby="template-learners-title" className="rounded-xl border border-border bg-card p-6 shadow-xs">
    <h2 id="template-learners-title" className="text-lg font-bold">Learners</h2>
    {!data ? <Loader2 className="mt-4 animate-spin text-muted-foreground" /> : <>
      <p className="mt-1 text-sm text-muted-foreground">
        {data.owned ? 'Learners can find this plan on Discover and start it with your organization.' : 'This setting is your organization’s own. The plan’s owner keeps the steps up to date.'}
        {data.badge ? data.earns_badge ? ' Finishing it here earns its badge.' : ' Its badge isn’t awarded here.' : ''}
      </p>
      <div className="mt-5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Who can start this plan</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{selected?.description}{data.can_edit ? '' : ' Your organization’s admins change this.'}</p>
        </div>
        <Select value={data.access} onValueChange={(next) => void change(next as LearnerAccess)} disabled={saving || !data.can_edit}>
          <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Who can start this plan"><SelectValue /></SelectTrigger>
          <SelectContent>{LEARNER_ACCESS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </>}
  </section>
}
