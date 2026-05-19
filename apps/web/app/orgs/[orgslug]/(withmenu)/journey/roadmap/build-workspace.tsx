'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ChevronDown, Eye, Loader2, Plus, Route, Search, Sparkles } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createRoadmapBlock,
  createRoadmapPathway,
  createRoadmapPathwayBlock,
  deleteRoadmapPathwayBlock,
  ensureDefaultRoadmapPathway,
  getRoadmapBlocks,
  getRoadmapPathways,
  RoadmapBlock,
  RoadmapBlockPayload,
  RoadmapPathwayBlock,
  RoadmapPathwayBlockPayload,
  RoadmapPathwayDetail,
  updateRoadmapBlock,
  updateRoadmapPathwayBlock,
} from '@services/roadmap/blocks'
import RoadmapTimeline from './roadmap-timeline'
import { JourneyPanel, JourneyWorkspaceHeader, JourneyWorkspaceShell } from '../workspace'
import { BlockMetadataEditor, BlockMetadataSummary, blockTypeLabels } from './block-metadata'

type Props = { orgslug: string; roadmapUuid?: string }
type PanelMode = 'select' | 'detail'

function money(value?: number | null) {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function previousMonth(value: string) {
  const [yearPart, monthPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)
  if (!year || !month) return `${new Date().getFullYear()}-01`
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  return `${previous.year}-${String(previous.month).padStart(2, '0')}`
}

function exploreInsertHref(orgslug: string, pathwayUuid?: string, targetBlockUuid?: string, intent?: 'replace' | 'requirement') {
  const base = getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())
  if (!pathwayUuid || !targetBlockUuid) return base
  return `${base}?insertInto=${encodeURIComponent(pathwayUuid)}&targetBlock=${encodeURIComponent(targetBlockUuid)}${intent ? `&intent=${intent}` : ''}`
}

function PathChooser({ orgslug, paths, selected, onCreate }: { orgslug: string; paths: RoadmapPathwayDetail[]; selected: RoadmapPathwayDetail; onCreate: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative z-50">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-gray-100">
        <span className="truncate text-xl font-semibold text-gray-950">{selected.pathway.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-max mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="max-h-72 overflow-y-auto p-2">
            {paths.map((path) => (
              <Link key={path.pathway.pathway_uuid} href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(path.pathway.pathway_uuid))} className="block rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>
                <div className="truncate text-sm font-semibold text-gray-950">{path.pathway.title}</div>
                <div className="text-xs text-gray-500">{path.summary.total_months || 0} months · {money(path.summary.support_needed)} support</div>
              </Link>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); onCreate() }} className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
            <Plus className="h-4 w-4" />
            New pathway
          </button>
        </div>
      ) : null}
    </div>
  )
}

function BlockLibraryCard({ block, onSelect }: { block: RoadmapBlock; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-950 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-950">{block.title || 'Untitled block'}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{block.description || 'Saved custom block'}</p>
        </div>
        {block.editable ? <Badge variant="outline">Custom</Badge> : <Badge variant="outline">Locked</Badge>}
      </div>
      <span className="mt-3 inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">{blockTypeLabels[block.block_type] || 'Personal'}</span>
    </button>
  )
}

function BlockPanel({
  orgslug,
  path,
  selected,
  blocks,
  mode,
  canBack,
  saving,
  onModeChange,
  onSelectBlock,
  onCreateCustom,
  onSaveAll,
  onAddRequirement,
  onViewTimelineBlock,
  onDeleteInstance,
}: {
  orgslug: string
  path: RoadmapPathwayDetail
  selected?: RoadmapPathwayBlock
  blocks: RoadmapBlock[]
  mode: PanelMode
  canBack: boolean
  saving: boolean
  onModeChange: (mode: PanelMode) => void
  onSelectBlock: (block: RoadmapBlock) => Promise<void>
  onCreateCustom: () => Promise<void>
  onSaveAll: (definition: RoadmapBlockPayload, placement?: RoadmapPathwayBlockPayload) => Promise<void>
  onAddRequirement: (block: { block_uuid: string }) => Promise<void>
  onViewTimelineBlock: (uuid: string) => void
  onDeleteInstance: () => Promise<void>
}) {
  if (mode === 'select') {
    const saved = blocks.filter((block) => block.starred || block.editable)
    return (
      <JourneyPanel>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Choose block</h2>
            <p className="mt-1 text-sm text-gray-500">{selected ? 'Replace the selected timeline block.' : 'Insert a saved block into this pathway.'}</p>
          </div>
          {canBack ? <Button type="button" variant="outline" size="sm" onClick={() => onModeChange('detail')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button> : null}
        </div>
        <div className="mt-5 grid gap-2">
          <Button asChild variant="outline" className="justify-start">
            <Link href={exploreInsertHref(orgslug, path.pathway.pathway_uuid, selected?.pathway_block_uuid)}><Search className="mr-2 h-4 w-4" />Browse blocks</Link>
          </Button>
          <Button type="button" className="justify-start" onClick={onCreateCustom} disabled={saving}><Sparkles className="mr-2 h-4 w-4" />Create custom</Button>
        </div>
        <h3 className="mt-6 text-sm font-semibold text-gray-950">Saved blocks</h3>
        <div className="mt-3 space-y-3">
          {saved.map((block) => <BlockLibraryCard key={block.block_uuid} block={block} onSelect={() => onSelectBlock(block)} />)}
          {!saved.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">No saved blocks yet.</div> : null}
        </div>
        </div>
      </JourneyPanel>
    )
  }

  const editableDefinition = Boolean(selected?.block.editable)
  const requirementStatuses = selected?.requirements || []
  const requirements = selected ? (
    <section className="mt-6 space-y-3 border-t border-gray-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-950">Requirements</h3>
        {editableDefinition ? <Button asChild variant="outline" size="sm"><Link href={exploreInsertHref(orgslug, path.pathway.pathway_uuid, selected.block.block_uuid, 'requirement')}><Plus className="mr-2 h-4 w-4" />Add</Link></Button> : null}
      </div>
      {requirementStatuses.map((requirement) => {
        const timelineMatch = path.blocks.find((item) => item.block.block_uuid === requirement.required_block.block_uuid)
        const correctlyPlaced = Boolean(requirement.met)
        return (
        <div key={requirement.requirement_uuid} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                {correctlyPlaced ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                {requirement.required_block.title}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {correctlyPlaced ? 'Requirement is already placed before this block.' : timelineMatch ? 'On the timeline, but not before this block.' : 'Not on this timeline yet.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {timelineMatch ? <Button type="button" size="sm" variant="outline" onClick={() => onViewTimelineBlock(timelineMatch.pathway_block_uuid)} aria-label="View requirement"><Eye className="h-4 w-4" /></Button> : null}
              {timelineMatch ? <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700" aria-label="Inserted"><CheckCircle2 className="h-4 w-4" /></span> : <Button type="button" size="sm" onClick={() => onAddRequirement(requirement.required_block)} disabled={saving} aria-label="Insert requirement"><Plus className="h-4 w-4" /></Button>}
            </div>
          </div>
        </div>
      )})}
      {!requirementStatuses.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">No direct requirements set for this block.</div> : null}
    </section>
  ) : null

  return (
    <JourneyPanel>
      {selected ? (
        editableDefinition ? (
          <BlockMetadataEditor
            key={selected.pathway_block_uuid}
            block={selected.block}
            instance={selected}
            saving={saving}
            onSave={onSaveAll}
            onDelete={onDeleteInstance}
            actions={<Button type="button" variant="outline" size="sm" onClick={() => onModeChange('select')}>Change</Button>}
          >
            {requirements}
          </BlockMetadataEditor>
        ) : (
          <>
            <div className="shrink-0 border-b border-gray-100 p-4">
              <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => onModeChange('select')}>Change</Button></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <BlockMetadataSummary block={selected.block} />
              {requirements}
            </div>
          </>
        )
      ) : <div className="m-5 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">Select a block on the timeline.</div>}
    </JourneyPanel>
  )
}

export default function RoadmapBuildWorkspaceBlocks({ orgslug, roadmapUuid }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedBlockUuid, setSelectedBlockUuid] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('select')
  const [canBackToDetail, setCanBackToDetail] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [saving, setSaving] = useState(false)

  const { data: paths = [], mutate: mutatePaths, isLoading } = useSWR(
    orgId && accessToken ? ['roadmap-block-paths', orgId, accessToken] : null,
    async ([, currentOrgId, token]) => {
      const list = await getRoadmapPathways(currentOrgId, token)
      if (list.length) return list
      const created = await ensureDefaultRoadmapPathway(currentOrgId, token)
      return [created]
    },
    { revalidateOnFocus: false }
  )
  const { data: library = [], mutate: mutateLibrary } = useSWR(
    orgId && accessToken ? ['roadmap-block-library', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapBlocks(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const selected = useMemo(() => paths.find((path) => path.pathway.pathway_uuid === roadmapUuid) || paths[0], [paths, roadmapUuid])
  const selectedBlock = selected?.blocks.find((block) => block.pathway_block_uuid === selectedBlockUuid) || selected?.blocks[0]

  React.useEffect(() => {
    if (!selected?.pathway.pathway_uuid) return
    if (!roadmapUuid) router.replace(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(selected.pathway.pathway_uuid)))
  }, [orgslug, roadmapUuid, router, selected?.pathway.pathway_uuid])

  React.useEffect(() => {
    if (!selected) return
    const requestedBlock = searchParams.get('block')
    if (requestedBlock && selected.blocks.some((block) => block.pathway_block_uuid === requestedBlock) && selectedBlockUuid !== requestedBlock) {
      setSelectedBlockUuid(requestedBlock)
      setPanelMode('detail')
      setCanBackToDetail(false)
      setPanelOpen(true)
      return
    }
    const stillSelected = selected.blocks.some((block) => block.pathway_block_uuid === selectedBlockUuid)
    if (!selectedBlockUuid || !stillSelected) {
      const first = selected.blocks[0]
      setSelectedBlockUuid(first?.pathway_block_uuid || null)
      setPanelMode(first?.block.is_draft ? 'select' : 'detail')
      setCanBackToDetail(false)
    }
  }, [searchParams, selected, selectedBlockUuid])

  const replacePath = async (next: RoadmapPathwayDetail) => {
    await mutatePaths(paths.map((path) => path.pathway.pathway_uuid === next.pathway.pathway_uuid ? next : path), { revalidate: false })
  }

  const withSaving = async <T,>(message: string, action: () => Promise<T>) => {
    setSaving(true)
    const loading = toast.loading('Saving roadmap')
    try {
      const result = await action()
      toast.success(message, { id: loading })
      return result
    } catch {
      toast.error('Could not save roadmap', { id: loading })
      return undefined
    } finally {
      setSaving(false)
    }
  }

  const addBlankBlock = async () => {
    if (!orgId || !accessToken || !selected) return
    const next = await withSaving('Blank block added', () => createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, { start_date: `${new Date().getFullYear()}-01`, title: 'Blank block' }, accessToken))
    if (next) {
      await replacePath(next)
      setSelectedBlockUuid(next.blocks[next.blocks.length - 1]?.pathway_block_uuid || null)
      setPanelMode('select')
      setCanBackToDetail(false)
    }
  }

  const createNewPathway = async () => {
    if (!orgId || !accessToken) return
    const next = await withSaving('Pathway created', () => createRoadmapPathway(orgId, { title: 'My Pathway' }, accessToken))
    if (next) {
      await mutatePaths([next, ...paths], { revalidate: false })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(next.pathway.pathway_uuid)))
    }
  }

  const selectLibraryBlock = async (block: RoadmapBlock) => {
    if (!orgId || !accessToken || !selected) return
    const target = selectedBlock
    const next = await withSaving('Block added to pathway', () => target
      ? updateRoadmapPathwayBlock(orgId, target.pathway_block_uuid, { block_uuid: block.block_uuid, title_override: null, description_override: null }, accessToken)
      : createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, { block_uuid: block.block_uuid, start_date: `${new Date().getFullYear()}-01` }, accessToken))
    if (next) {
      await replacePath(next)
      const updated = target ? next.blocks.find((item) => item.pathway_block_uuid === target.pathway_block_uuid) : next.blocks[next.blocks.length - 1]
      setSelectedBlockUuid(updated?.pathway_block_uuid || null)
      setPanelMode('detail')
      setCanBackToDetail(false)
    }
  }

  const createCustomForSelection = async () => {
    if (!orgId || !accessToken) return
    const block = await withSaving('Custom block created', () => createRoadmapBlock(orgId, { title: 'Untitled block', block_type: 'personal', starred: true, is_draft: true }, accessToken))
    if (!block) return
    await mutateLibrary([block, ...library], { revalidate: false })
    await selectLibraryBlock(block)
  }

  const saveAll = async (definition: RoadmapBlockPayload, placement?: RoadmapPathwayBlockPayload) => {
    if (!orgId || !accessToken || !selectedBlock) return
    if (!String(definition.title || '').trim()) {
      toast.error('Block title is required')
      return
    }
    if (placement && !placement.start_date) {
      toast.error('Start date is required')
      return
    }
    const result = await withSaving('Block saved', async () => {
      const block = await updateRoadmapBlock(orgId, selectedBlock.block.block_uuid, definition, accessToken)
      const next = placement ? await updateRoadmapPathwayBlock(orgId, selectedBlock.pathway_block_uuid, placement, accessToken) : undefined
      return { block, next }
    })
    if (result?.block) {
      await mutateLibrary(library.map((item) => item.block_uuid === result.block.block_uuid ? result.block : item), { revalidate: false })
    }
    if (result?.next) await replacePath(result.next)
    else await mutatePaths()
  }

  const addRequirement = async (block: { block_uuid: string }) => {
    if (!orgId || !accessToken || !selected || !selectedBlock) return
    const startDate = previousMonth(selectedBlock.start_date)
    const next = await withSaving('Requirement inserted', () => createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, {
      block_uuid: block.block_uuid,
      start_date: startDate,
      end_date: startDate,
      sort_order: selectedBlock.sort_order - 1,
    }, accessToken))
    if (next) {
      await replacePath(next)
      const inserted = next.blocks.find((item) => item.block.block_uuid === block.block_uuid)
      setSelectedBlockUuid(inserted?.pathway_block_uuid || selectedBlock.pathway_block_uuid)
      setPanelMode('detail')
      setCanBackToDetail(false)
    }
  }

  const deleteSelected = async () => {
    if (!orgId || !accessToken || !selectedBlock) return
    const next = await withSaving('Block removed', () => deleteRoadmapPathwayBlock(orgId, selectedBlock.pathway_block_uuid, accessToken))
    if (next) {
      await replacePath(next)
      setSelectedBlockUuid(next.blocks[0]?.pathway_block_uuid || null)
    }
  }

  const viewTimelineBlock = (uuid: string) => {
    setSelectedBlockUuid(uuid)
    setPanelMode('detail')
    setCanBackToDetail(false)
    setPanelOpen(true)
  }

  const moveTimelineBlock = async (uuid: string, placement: { startDate: string; endDate: string; isOngoing: boolean }) => {
    if (!orgId || !accessToken) return
    setSelectedBlockUuid(uuid)
    const next = await withSaving('Block moved', () => updateRoadmapPathwayBlock(orgId, uuid, {
      start_date: placement.startDate,
      end_date: placement.endDate,
      is_ongoing: placement.isOngoing,
    }, accessToken))
    if (next) await replacePath(next)
  }

  if (isLoading || !selected) {
    return (
      <JourneyWorkspaceShell
        header={<JourneyWorkspaceHeader breadcrumbs={[{ label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> }, { label: 'Roadmap' }]} />}
      >
        <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      </JourneyWorkspaceShell>
    )
  }

  return (
    <JourneyWorkspaceShell
      header={(
        <JourneyWorkspaceHeader
          breadcrumbs={[
            { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
            { label: 'Roadmap' },
          ]}
        >
          <PathChooser orgslug={orgslug} paths={paths} selected={selected} onCreate={createNewPathway} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapDetails(selected.pathway.pathway_uuid))}><BarChart3 className="mr-2 h-4 w-4" />Details</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())}><Search className="mr-2 h-4 w-4" />Explore</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setPanelOpen((open) => !open)}>Panel</Button>
            <Button type="button" onClick={addBlankBlock}><Plus className="mr-2 h-4 w-4" />Add block</Button>
          </div>
        </JourneyWorkspaceHeader>
      )}
      panelOpen={panelOpen}
      onPanelClose={() => setPanelOpen(false)}
      mobilePanelLabel="Close roadmap details"
      panel={(
        <BlockPanel
          orgslug={orgslug}
          path={selected}
          selected={selectedBlock}
          blocks={library}
          mode={panelMode}
          canBack={canBackToDetail}
          saving={saving}
          onModeChange={(mode) => { setPanelMode(mode); setCanBackToDetail(mode === 'select') }}
          onSelectBlock={selectLibraryBlock}
          onCreateCustom={createCustomForSelection}
          onSaveAll={saveAll}
          onAddRequirement={addRequirement}
          onViewTimelineBlock={viewTimelineBlock}
          onDeleteInstance={deleteSelected}
        />
      )}
    >
      <div className="h-full min-h-0 bg-white">
        <RoadmapTimeline
          path={selected}
          selectedUuid={selectedBlock?.pathway_block_uuid || null}
          onSelect={(uuid) => { setSelectedBlockUuid(uuid); setPanelMode('detail'); setCanBackToDetail(false); setPanelOpen(true) }}
          onMove={moveTimelineBlock}
        />
      </div>
    </JourneyWorkspaceShell>
  )
}
