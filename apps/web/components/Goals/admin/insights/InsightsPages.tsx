'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ClipboardCheck, ListTree, Users } from 'lucide-react'
import AdminTabPage from '@components/Admin/AdminTabPage'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUserGroups } from '@services/usergroups/usergroups'
import { EmptyState, PageLoader } from '../live/ui'
import GroupRequirementsGrid from './GroupRequirementsGrid'
import { RequirementFrameworkDetail } from './RequirementFrameworkEditor'
import RequirementsExplorer from './RequirementsExplorer'

type InsightsView = 'coverage' | 'evidence'

function useOrgAndToken() {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  return { orgId: Number(org?.id), token: session?.data?.tokens?.access_token }
}

/** Insights: how the org's templates cover its requirement frameworks, and how learners meet them, with the evidence to export. */
function InsightsTabs({ orgslug, view, children }: { orgslug: string; view: InsightsView; children: React.ReactNode }) {
  const tabs = [
    { id: 'coverage', label: 'Coverage', icon: <ListTree size={15} />, href: getUriWithOrg(orgslug, routePaths.org.admin.insights()) },
    { id: 'evidence', label: 'Learner evidence', icon: <ClipboardCheck size={15} />, href: getUriWithOrg(orgslug, routePaths.org.admin.insightsEvidence()) },
  ]
  return <AdminTabPage tab="insights" tabs={tabs} activeTab={view}>{children}</AdminTabPage>
}

export function InsightsCoveragePage({ orgslug }: { orgslug: string }) {
  const { orgId, token } = useOrgAndToken()
  return <InsightsTabs orgslug={orgslug} view="coverage"><RequirementsExplorer orgslug={orgslug} orgId={orgId} token={token} /></InsightsTabs>
}

type Group = { id: number; name: string }

/** One group's learners against its requirement framework: met, planned or a gap, with the evidence export. */
export function InsightsEvidencePage({ orgslug, groupId }: { orgslug: string; groupId: number | null }) {
  const { orgId, token } = useOrgAndToken()
  const router = useRouter()
  const { data: groups, isLoading } = useSWR<Group[]>(orgId && token ? ['insights-groups', orgId] : null, async () => {
    const response = await getUserGroups(orgId, token!)
    return Array.isArray(response?.data) ? response.data : []
  }, { revalidateOnFocus: false })
  const selected = groups?.find((group) => group.id === groupId) || groups?.[0]
  const choose = (id: string) => router.replace(getUriWithOrg(orgslug, routePaths.org.admin.insightsEvidence(id)))
  return <InsightsTabs orgslug={orgslug} view="evidence">
    {isLoading || !groups ? <PageLoader /> : !selected ? <div className="px-10 pb-10 pt-6"><EmptyState icon={<Users size={36} />} title="No groups yet" detail="Learner evidence is reported per group. Make a group in People and assign it a requirement framework." /></div>
      : <div className="space-y-4 px-10 pb-10 pt-6">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-900">Group
          <select aria-label="Group" value={selected.id} onChange={(event) => choose(event.target.value)} className="h-9 max-w-[320px] rounded-lg border border-gray-200 bg-white px-2 text-sm font-semibold">
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <GroupRequirementsGrid key={selected.id} orgslug={orgslug} orgId={orgId} token={token} groupId={selected.id} />
      </div>}
  </InsightsTabs>
}

export function RequirementFrameworkPage({ orgslug, frameworkUuid, subpage }: { orgslug: string; frameworkUuid: string; subpage: 'details' | 'levels' | 'spec' }) {
  const { orgId, token } = useOrgAndToken()
  return <AdminTabPage tab="insights"><RequirementFrameworkDetail orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={frameworkUuid} activeSubpage={subpage} /></AdminTabPage>
}
