'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { ClipboardCheck } from 'lucide-react'
import { CreateFramework } from './RequirementFrameworkEditor'
import { CoverageExplorer } from '../requirements/FrameworkCoverage'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { frameworksKey, requirementsApi } from '@services/goals/requirements'
import { EmptyState, PageLoader, StatusPill } from '../live/ui'

/**
 * Insights' coverage view: pick a framework, then which published goal templates cover each requirement.
 * The same explorer is a framework's "Coverage by plan" page under Plans › Requirements.
 */
export default function RequirementsExplorer({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const listKey = orgId && token ? frameworksKey(orgId) : null
  const { data: frameworks, isLoading } = useSWR(listKey, () => requirementsApi.list(orgId, token), { revalidateOnFocus: false })
  const [frameworkUuid, setFrameworkUuid] = React.useState('')
  const selectedUuid = frameworkUuid || frameworks?.[0]?.framework_uuid || ''
  const { data: coverage, isLoading: coverageLoading } = useSWR(selectedUuid && token ? ['requirement-coverage', orgId, selectedUuid] : null, () => requirementsApi.coverage(orgId, selectedUuid, token), { revalidateOnFocus: false })
  if (isLoading) return <PageLoader />
  const refresh = () => listKey ? mutate(listKey) : Promise.resolve()
  const openFramework = (uuid: string) => router.push(getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(uuid, 'spec')))
  const create = <CreateFramework orgId={orgId} token={token} refresh={refresh} onCreated={openFramework} />
  if (!frameworks?.length) return <div className="px-10 pb-10 pt-6"><EmptyState icon={<ClipboardCheck size={36} />} title="No requirement frameworks yet" detail="Add a published framework from Plans › Discover (like your state’s graduation requirements) or write your own." /><div className="mt-4 flex justify-center">{create}</div></div>
  const framework = frameworks.find((item: any) => item.framework_uuid === selectedUuid) || frameworks[0]

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-10 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        {frameworks.length > 1 ? <label className="min-w-0"><span className="sr-only">Framework</span><select value={selectedUuid} onChange={(event) => setFrameworkUuid(event.target.value)} className="max-w-[420px] truncate bg-transparent pr-2 text-lg font-black outline-none">{frameworks.map((item: any) => <option key={item.framework_uuid} value={item.framework_uuid}>{item.name}</option>)}</select></label> : <h2 className="text-lg font-black">{framework.name}</h2>}
        <StatusPill tone={framework.status === 'published' ? 'green' : 'amber'}>{framework.status}</StatusPill>
        <span className="text-xs text-gray-500">Version {framework.version}{framework.source_framework_uuid ? ' · from the library' : ''} · {framework.nodes?.length || 0} requirements · {framework.enrollment_count} learner{framework.enrollment_count === 1 ? '' : 's'}</span>
      </div>
      <div className="flex gap-2"><Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(framework.framework_uuid, 'details'))} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50">Edit framework</Link>{create}</div>
    </div>
    {coverageLoading || !coverage ? <PageLoader /> : <CoverageExplorer key={selectedUuid} coverage={coverage} orgslug={orgslug} />}
  </div>
}
