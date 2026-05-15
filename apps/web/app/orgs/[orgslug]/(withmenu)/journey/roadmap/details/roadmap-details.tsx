'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, BarChart3, Loader2, Plus, Route, X } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { ensureDefaultRoadmapPathway, getRoadmapPathways, RoadmapPathwayDetail } from '@services/roadmap/blocks'

type Props = { orgslug: string; initialPathUuid?: string }

function money(value?: number | null) {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function monthLabel(value?: string | null) {
  if (!value) return 'Open'
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function titleFor(block: RoadmapPathwayDetail['blocks'][number]) {
  return block.title_override || block.block.title || 'Blank block'
}

function DetailStack({ path, paths, onChange, onRemove }: { path?: RoadmapPathwayDetail; paths: RoadmapPathwayDetail[]; onChange: (uuid: string) => void; onRemove: () => void }) {
  if (!path) {
    return (
      <div className="min-w-[360px] rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6">
        <Select onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Choose a pathway" /></SelectTrigger>
          <SelectContent>{paths.map((item) => <SelectItem key={item.pathway.pathway_uuid} value={item.pathway.pathway_uuid}>{item.pathway.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <section className="min-w-[380px] rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">{path.pathway.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{path.pathway.description || 'Pathway details'}</p>
        </div>
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Total time</div><div className="font-semibold">{path.summary.total_months} mo</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">First income</div><div className="font-semibold">{path.summary.months_until_first_income ? `${path.summary.months_until_first_income} mo` : 'Not set'}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Support needed</div><div className="font-semibold">{money(path.summary.support_needed)}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Total cost</div><div className="font-semibold">{money(path.summary.total_estimated_cost)}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Income total</div><div className="font-semibold">{money(path.summary.total_estimated_income)}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Unmet reqs</div><div className="font-semibold">{path.summary.unmet_requirement_count}</div></div>
      </div>
      <div className="mt-5 rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-950">Cash position</h3>
        <p className="mt-2 text-sm text-gray-600">Lowest projected cash position: {money(path.summary.lowest_projected_cash_position)}</p>
      </div>
      <div className="mt-5">
        <h3 className="font-semibold text-gray-950">Timeline blocks</h3>
        <div className="mt-3 space-y-2">
          {path.blocks.map((block) => (
            <div key={block.pathway_block_uuid} className="rounded-lg border border-gray-100 p-3">
              <div className="text-sm font-semibold text-gray-950">{titleFor(block)}</div>
              <div className="mt-1 text-xs text-gray-500">{monthLabel(block.start_date)} to {block.is_ongoing ? 'ongoing' : monthLabel(block.end_date)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function RoadmapDetailsBlocksClient({ orgslug, initialPathUuid }: Props) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const { data: paths = [], isLoading } = useSWR(
    orgId && accessToken ? ['roadmap-detail-block-paths', orgId, accessToken] : null,
    async ([, currentOrgId, token]) => {
      const list = await getRoadmapPathways(currentOrgId, token)
      if (list.length) return list
      return [await ensureDefaultRoadmapPathway(currentOrgId, token)]
    },
    { revalidateOnFocus: false }
  )
  const initial = useMemo(() => initialPathUuid || paths[0]?.pathway.pathway_uuid || '', [initialPathUuid, paths])
  const [stackUuids, setStackUuids] = useState<string[]>(initial ? [initial] : [''])

  React.useEffect(() => {
    if (initial && stackUuids.length === 1 && !stackUuids[0]) setStackUuids([initial])
  }, [initial, stackUuids])

  return (
    <GeneralWrapperStyled>
      <Breadcrumbs items={[
        { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
        { label: 'Roadmap', href: getUriWithOrg(orgslug, routePaths.org.journeyRoadmap()) },
        { label: 'Details' },
      ]} />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmap())} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800"><ArrowLeft className="mr-2 h-4 w-4" />Build workspace</Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-gray-950"><BarChart3 className="h-7 w-7" />Pathway Details</h1>
        </div>
        <Button type="button" onClick={() => setStackUuids([...stackUuids, ''])}><Plus className="mr-2 h-4 w-4" />Add comparison</Button>
      </div>
      {isLoading ? (
        <div className="mt-10 flex min-h-[300px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="mt-8 flex gap-5 overflow-x-auto pb-6">
          {stackUuids.map((uuid, index) => (
            <DetailStack
              key={`${uuid}-${index}`}
              path={paths.find((path) => path.pathway.pathway_uuid === uuid)}
              paths={paths}
              onChange={(nextUuid) => setStackUuids(stackUuids.map((item, itemIndex) => itemIndex === index ? nextUuid : item))}
              onRemove={() => setStackUuids(stackUuids.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
          {!stackUuids.length ? <DetailStack path={undefined} paths={paths} onChange={(nextUuid) => setStackUuids([nextUuid])} onRemove={() => {}} /> : null}
        </div>
      )}
    </GeneralWrapperStyled>
  )
}
