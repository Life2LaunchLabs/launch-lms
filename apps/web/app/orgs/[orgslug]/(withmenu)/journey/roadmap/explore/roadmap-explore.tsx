'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowLeft, CheckCircle2, Loader2, Plus, Route, Star } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { createRoadmapBlock, createRoadmapBlockRequirement, createRoadmapPathway, createRoadmapPathwayBlock, deleteRoadmapBlock, getRoadmapBlocks, getRoadmapPathways, RoadmapBlock, RoadmapBlockPayload, RoadmapPathwayDetail, updateRoadmapBlock, updateRoadmapPathwayBlock } from '@services/roadmap/blocks'
import { BlockMetadataEditor, BlockMetadataSummary, blockTypeLabels } from '../block-metadata'

type Props = { orgslug: string; insertInto?: string; targetBlock?: string; intent?: string }

function BlockCard({ block, inserting, onOpen, onToggleStar, onInsert }: { block: RoadmapBlock; inserting: boolean; onOpen: () => void; onToggleStar: () => void; onInsert: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-950">{block.title || 'Untitled block'}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{block.description || 'Custom roadmap block'}</p>
          </div>
          <Badge variant="outline">{blockTypeLabels[block.block_type]}</Badge>
        </div>
        <span className="mt-4 inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">{blockTypeLabels[block.block_type]}</span>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.skill_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Skill</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.lifestyle_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Life</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.confidence_score ?? '-'}</div><div className="text-xs text-gray-500">Conf.</div></div>
        </div>
      </button>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onToggleStar} disabled={!block.editable}>
          <Star className={`mr-2 h-4 w-4 ${block.starred ? 'fill-gray-950' : ''}`} />
          {block.starred ? 'Starred' : 'Star'}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={onInsert}>
          {inserting ? <Plus className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          {inserting ? 'Add to pathway' : 'View'}
        </Button>
      </div>
    </div>
  )
}

export default function RoadmapExploreBlocksClient({ orgslug, insertInto, targetBlock, intent }: Props) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const inserting = Boolean(insertInto)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<RoadmapBlock | null>(null)
  const [saving, setSaving] = useState(false)
  const { data: blocks = [], isLoading, mutate } = useSWR(
    orgId && accessToken ? ['roadmap-block-explore', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapBlocks(currentOrgId, token),
    { revalidateOnFocus: false }
  )
  const { data: paths = [], mutate: mutatePaths } = useSWR(
    orgId && accessToken ? ['roadmap-block-explore-paths', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapPathways(currentOrgId, token),
    { revalidateOnFocus: false }
  )
  const selectedFeatured = selected ? paths.filter((path: RoadmapPathwayDetail) => path.blocks.some((item) => item.block.block_uuid === selected.block_uuid)) : []

  const insertBlock = async (block: RoadmapBlock) => {
    if (!orgId || !accessToken || !insertInto) {
      setSelected(block)
      return
    }
    const loading = toast.loading('Adding block')
    try {
      if (intent === 'requirement' && targetBlock) {
        await createRoadmapBlockRequirement(orgId, targetBlock, { required_block_uuid: block.block_uuid }, accessToken)
      } else if (targetBlock) {
        await updateRoadmapPathwayBlock(orgId, targetBlock, { block_uuid: block.block_uuid, title_override: null, description_override: null }, accessToken)
      } else {
        await createRoadmapPathwayBlock(orgId, insertInto, { block_uuid: block.block_uuid, start_date: `${new Date().getFullYear()}-01` }, accessToken)
      }
      toast.success('Block added', { id: loading })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(insertInto)))
    } catch {
      toast.error('Could not add block', { id: loading })
    }
  }

  const createCustom = async () => {
    if (!orgId || !accessToken) return
    setSaving(true)
    const loading = toast.loading('Saving block')
    try {
      const block = await createRoadmapBlock(orgId, {
        title: 'Untitled block',
        block_type: 'personal',
        starred: true,
        is_draft: true,
      }, accessToken)
      await mutate([block, ...blocks], { revalidate: false })
      setCreateOpen(false)
      setSelected(block)
      toast.success('Block saved', { id: loading })
    } catch {
      toast.error('Could not save block', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const saveSelected = async (definition: RoadmapBlockPayload) => {
    if (!orgId || !accessToken || !selected) return
    setSaving(true)
    const loading = toast.loading('Saving block')
    try {
      const updated = await updateRoadmapBlock(orgId, selected.block_uuid, definition, accessToken)
      await mutate(blocks.map((block) => block.block_uuid === updated.block_uuid ? updated : block), { revalidate: false })
      setSelected(updated)
      toast.success('Block saved', { id: loading })
    } catch {
      toast.error('Could not save block', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const deleteSelected = async () => {
    if (!orgId || !accessToken || !selected) return
    const loading = toast.loading('Deleting block')
    try {
      await deleteRoadmapBlock(orgId, selected.block_uuid, accessToken)
      await mutate(blocks.filter((block) => block.block_uuid !== selected.block_uuid), { revalidate: false })
      setSelected(null)
      toast.success('Block deleted', { id: loading })
    } catch {
      toast.error('Could not delete block', { id: loading })
    }
  }

  const createPathwayWithSelected = async () => {
    if (!orgId || !accessToken || !selected) return
    const next = await createRoadmapPathway(orgId, { title: selected.title || 'New pathway' }, accessToken)
    await createRoadmapPathwayBlock(orgId, next.pathway.pathway_uuid, { block_uuid: selected.block_uuid, start_date: `${new Date().getFullYear()}-01` }, accessToken)
    await mutatePaths()
    router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(next.pathway.pathway_uuid)))
  }

  const starred = blocks.filter((block) => block.starred)

  return (
    <GeneralWrapperStyled>
      <Breadcrumbs items={[
        { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
        { label: 'Roadmap', href: getUriWithOrg(orgslug, routePaths.org.journeyRoadmap()) },
        { label: 'Explore' },
      ]} />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={insertInto ? getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(insertInto)) : getUriWithOrg(orgslug, routePaths.org.journeyRoadmap())} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800"><ArrowLeft className="mr-2 h-4 w-4" />Build workspace</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950">{inserting ? 'Choose a Block' : 'Explore Blocks'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Save reusable careers, degrees, jobs, certificates, finances, and life events for roadmap timelines.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create custom</Button>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-950">Starred blocks</h2>
        {isLoading ? <div className="mt-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div> : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {starred.map((block) => (
              <BlockCard
                key={block.block_uuid}
                block={block}
                inserting={inserting}
                onOpen={() => setSelected(block)}
                onInsert={() => insertBlock(block)}
                onToggleStar={async () => {
                  if (!orgId || !accessToken || !block.editable) return
                  const updated = await updateRoadmapBlock(orgId, block.block_uuid, { starred: !block.starred }, accessToken)
                  await mutate(blocks.map((item) => item.block_uuid === updated.block_uuid ? updated : item), { revalidate: false })
                }}
              />
            ))}
            {!starred.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500 md:col-span-2 xl:col-span-3">No starred blocks yet.</div> : null}
          </div>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-950">Discover</h2>
        <p className="mt-2 text-sm text-gray-500">Recommended block discovery is coming soon. For now, create your own custom block.</p>
        <Button type="button" className="mt-4" onClick={() => setCreateOpen(true)}>Create custom</Button>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create custom block</DialogTitle>
            <DialogDescription>Create a blank editable block, then fill out its metadata.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end border-t border-gray-100 pt-4">
            <Button type="button" onClick={createCustom} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create block</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent hideCloseButton className="h-[88vh] max-w-4xl overflow-hidden p-0">
          {selected ? (
            <>
              <DialogHeader className={selected.editable ? 'sr-only' : 'border-b border-gray-100 p-5 pr-14'}>
                <DialogTitle>{selected.title || 'Untitled block'}</DialogTitle>
                <DialogDescription>{selected.description || 'Roadmap block metadata and usage actions.'}</DialogDescription>
              </DialogHeader>
              {selected.editable ? (
                <BlockMetadataEditor
                  block={selected}
                  saving={saving}
                  onSave={(definition) => saveSelected(definition)}
                  onDelete={deleteSelected}
                  actions={(
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={createPathwayWithSelected}>Create pathway</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm">Featured in {selectedFeatured.length} paths</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start" style={{ zIndex: 2147483647 }}>
                          {selectedFeatured.length ? selectedFeatured.map((path) => {
                            const match = path.blocks.find((item) => item.block.block_uuid === selected.block_uuid)
                            const href = `${getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(path.pathway.pathway_uuid))}${match ? `?block=${encodeURIComponent(match.pathway_block_uuid)}` : ''}`
                            return <DropdownMenuItem key={path.pathway.pathway_uuid} asChild><Link href={href}>{path.pathway.title}</Link></DropdownMenuItem>
                          }) : <DropdownMenuItem disabled>No paths yet</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {inserting ? <Button type="button" size="sm" onClick={() => insertBlock(selected)}>{intent === 'requirement' ? 'Add requirement' : 'Insert block'}</Button> : null}
                      <DialogClose asChild><Button type="button" variant="outline" size="sm">Close</Button></DialogClose>
                    </>
                  )}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4 pr-14">
                    <Button type="button" variant="outline" size="sm" onClick={createPathwayWithSelected}>Create pathway</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm">Featured in {selectedFeatured.length} paths</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="start" style={{ zIndex: 2147483647 }}>
                        {selectedFeatured.length ? selectedFeatured.map((path) => {
                          const match = path.blocks.find((item) => item.block.block_uuid === selected.block_uuid)
                          const href = `${getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(path.pathway.pathway_uuid))}${match ? `?block=${encodeURIComponent(match.pathway_block_uuid)}` : ''}`
                          return <DropdownMenuItem key={path.pathway.pathway_uuid} asChild><Link href={href}>{path.pathway.title}</Link></DropdownMenuItem>
                        }) : <DropdownMenuItem disabled>No paths yet</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {inserting ? <Button type="button" size="sm" className="ml-auto" onClick={() => insertBlock(selected)}>{intent === 'requirement' ? 'Add requirement' : 'Insert block'}</Button> : null}
                    <DialogClose asChild><Button type="button" variant="outline" size="sm">Close</Button></DialogClose>
                  </div>
                  <div className="max-h-[calc(88vh-156px)] overflow-y-auto p-5">
                    <BlockMetadataSummary block={selected} />
                  </div>
                </>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </GeneralWrapperStyled>
  )
}
