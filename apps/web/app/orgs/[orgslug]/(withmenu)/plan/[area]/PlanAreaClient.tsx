'use client'

import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import GridLayout, { type Layout } from 'react-grid-layout'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Compass,
  IdentificationCard,
  Info,
  Lightning,
  Path,
  Plus,
  Toolbox,
  X,
} from '@phosphor-icons/react'
import { Bold, ExternalLink, Heading2, Italic, Link2, List, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  getLaunchPlanCanvases,
  getLaunchPlanWorkspace,
  LaunchPlanCard,
  LaunchPlanCanvas,
  LaunchPlanSectionSummary,
  LaunchPlanWorkspace,
  markLaunchPlanIntroSeen,
  updateLaunchPlanWorkspace,
} from '@services/launchPlan/launchPlan'
import type { PlanArea, PlanAreaSlug } from '../planAreas'

const CANVAS_SPANS = ['md:col-span-2', 'md:col-span-2', 'md:col-span-2', 'md:col-span-3', 'md:col-span-3']
const AREA_ICONS = {
  identity: IdentificationCard,
  skills: Toolbox,
  lifestyle: Compass,
  path: Path,
} satisfies Record<PlanAreaSlug, typeof IdentificationCard>
const CANVAS_THEMES = {
  identity: {
    borderColor: 'border-blue-400',
    headerBg: 'bg-sky-400',
    headerText: 'text-sky-950',
    iconBg: 'bg-blue-100',
    focusRing: 'focus-visible:ring-sky-500',
  },
  skills: {
    borderColor: 'border-emerald-400',
    headerBg: 'bg-emerald-400',
    headerText: 'text-emerald-950',
    iconBg: 'bg-emerald-100',
    focusRing: 'focus-visible:ring-emerald-500',
  },
  lifestyle: {
    borderColor: 'border-amber-400',
    headerBg: 'bg-amber-300',
    headerText: 'text-amber-950',
    iconBg: 'bg-amber-100',
    focusRing: 'focus-visible:ring-amber-500',
  },
  path: {
    borderColor: 'border-rose-300',
    headerBg: 'bg-rose-300',
    headerText: 'text-rose-950',
    iconBg: 'bg-rose-100',
    focusRing: 'focus-visible:ring-rose-500',
  },
} satisfies Record<PlanAreaSlug, {
  borderColor: string
  headerBg: string
  headerText: string
  iconBg: string
  focusRing: string
}>

type SerializablePlanArea = Omit<PlanArea, 'icon'>

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}

function getSectionPreviewText(section: LaunchPlanSectionSummary) {
  return stripHtml(section.notes || '')
}

export default function PlanAreaClient({ orgslug, area }: { orgslug: string; area: SerializablePlanArea }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const AreaIcon = AREA_ICONS[area.slug]
  const canvasTheme = CANVAS_THEMES[area.slug]
  const [canvas, setCanvas] = useState<LaunchPlanCanvas | null>(null)
  const [selected, setSelected] = useState<LaunchPlanSectionSummary | null>(null)
  const [workspace, setWorkspace] = useState<LaunchPlanWorkspace | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)

  const loadCanvas = useCallback(async () => {
    if (!org?.id || !token) return
    const canvases = await getLaunchPlanCanvases(org.id, token)
    setCanvas(canvases.find((item) => item.slug === area.slug) || null)
  }, [area.slug, org?.id, token])

  useEffect(() => {
    loadCanvas().catch(() => toast.error('Failed to load Launch Plan'))
  }, [loadCanvas])

  const openSection = async (section: LaunchPlanSectionSummary) => {
    if (!org?.id || !token) return
    setSelected(section)
    setLoadingWorkspace(true)
    try {
      const next = await getLaunchPlanWorkspace(org.id, section.section_uuid, token)
      setWorkspace(next)
      setShowIntro(!next.intro_seen_at)
    } catch {
      setSelected(null)
      toast.error('Failed to open this canvas area')
    } finally {
      setLoadingWorkspace(false)
    }
  }

  const closeWorkspace = () => {
    setSelected(null)
    setWorkspace(null)
    setShowIntro(false)
  }

  const continueFromIntro = async () => {
    if (!selected || !org?.id || !token) return
    await markLaunchPlanIntroSeen(org.id, selected.section_uuid, token)
    setWorkspace((current) => current ? { ...current, intro_seen_at: current.intro_seen_at || new Date().toISOString() } : current)
    setShowIntro(false)
    await loadCanvas()
  }

  return (
    <GeneralWrapperStyled>
      <main className="mx-auto w-full max-w-5xl">
        <div className="mb-5">
          <Link
            href={getUriWithOrg(orgslug, routePaths.org.plan())}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>

        <section className={`overflow-hidden rounded-2xl border-2 bg-white shadow-[0_5px_0_rgba(15,23,42,0.12)] ${canvasTheme.borderColor}`}>
          <header className={`flex items-center gap-4 px-5 py-4 sm:px-7 ${canvasTheme.headerBg} ${canvasTheme.headerText}`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40 ring-4 ring-black/10">
              <AreaIcon size={27} weight="duotone" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black leading-tight sm:text-2xl">{canvas?.title || area.title} Canvas</h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-5 opacity-80">
                {canvas?.description || area.description}
              </p>
            </div>
            <div className="hidden rounded-full bg-white/45 px-4 py-2 text-center text-xs font-black sm:block">
              {(canvas?.sections || []).reduce((count, section) => count + section.card_count, 0)} cards
            </div>
          </header>

          <div className="bg-[#fbfaf7] p-4 [background-image:radial-gradient(#d8dde6_1px,transparent_1px)] [background-size:18px_18px] sm:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:auto-rows-[260px]">
              {(canvas?.sections || Array.from({ length: 5 }, () => null)).map((section: LaunchPlanSectionSummary | null, index) => {
                const preview = section ? getSectionPreviewText(section) : ''
                return (
                  <button
                    key={section?.section_uuid || index}
                    type="button"
                    disabled={!section?.section_uuid}
                    onClick={() => section?.section_uuid && openSection(section)}
                    className={`group h-[260px] overflow-hidden rounded-2xl border-2 border-gray-200 bg-white text-left shadow-[0_4px_0_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_7px_0_rgba(15,23,42,0.10)] focus:outline-none focus-visible:ring-2 disabled:animate-pulse md:h-full ${canvasTheme.focusRing} ${CANVAS_SPANS[index]}`}
                  >
                    {section?.section_uuid ? (
                      <div className="flex h-full flex-col">
                        <div className="flex items-center gap-3 border-b-2 border-gray-200 bg-white px-4 py-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${canvasTheme.iconBg} ${area.theme.iconColor}`}>
                            <AreaIcon size={22} weight="duotone" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-base font-black text-gray-950">{section.title}</h2>
                            <p className="mt-0.5 text-xs font-bold text-gray-400">
                              {section.card_count > 0 ? `${section.card_count} saved card${section.card_count === 1 ? '' : 's'}` : 'Ready to build'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col p-4">
                          {preview || section.card_summaries?.length ? (
                            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
                              {preview && (
                                <div className="max-h-24 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3">
                                  <p className="line-clamp-3 text-sm font-medium leading-6 text-gray-600">{preview}</p>
                                </div>
                              )}
                              {section.card_summaries?.length ? (
                                <div className="space-y-2 overflow-hidden">
                                  {section.card_summaries.map((card) => (
                                    <div key={card.card_uuid} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                      <p className="line-clamp-1 text-sm font-black text-gray-950">{card.title}</p>
                                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">
                                        {card.outcome_text || card.outcome_link || card.outcome_file || 'Outcome attached to this resource.'}
                                      </p>
                                    </div>
                                  ))}
                                  {section.card_count > section.card_summaries.length && (
                                    <p className={`text-xs font-black ${area.theme.iconColor}`}>
                                      +{section.card_count - section.card_summaries.length} more
                                    </p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-3 text-center">
                              <p className="line-clamp-3 text-sm font-semibold leading-6 text-gray-400">{preview || 'Get started'}</p>
                            </div>
                          )}

                          <div className={`mt-auto pt-4 text-sm font-black ${area.theme.iconColor}`}>
                            Open canvas
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      {selected && workspace && (
        <>
          {workspace.intro_seen_at && (
          <WorkspaceModal
            workspace={workspace}
            orgId={org.id}
            token={token}
            onInfo={() => setShowIntro(true)}
            onClose={closeWorkspace}
            onSaved={async (next) => {
              setWorkspace(next)
              await loadCanvas()
            }}
          />
          )}
          {showIntro && (
            <IntroModal
              workspace={workspace}
              onContinue={continueFromIntro}
              onClose={() => workspace.intro_seen_at ? setShowIntro(false) : closeWorkspace()}
            />
          )}
        </>
      )}
      {selected && loadingWorkspace && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 text-sm font-semibold text-white">Opening canvas area…</div>}
    </GeneralWrapperStyled>
  )
}

function IntroModal({ workspace, onContinue, onClose }: { workspace: LaunchPlanWorkspace; onContinue(): void; onClose(): void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600"><Info size={28} weight="fill" /></div>
        <h2 className="mt-5 text-2xl font-semibold text-gray-950">{workspace.section.title}</h2>
        <p className="mt-3 leading-7 text-gray-600">{workspace.section.explanation}</p>
        <button onClick={onContinue} className="mt-8 w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800">Start building</button>
      </div>
    </div>
  )
}

function WorkspaceModal({ workspace, orgId, token, onInfo, onClose, onSaved }: {
  workspace: LaunchPlanWorkspace
  orgId: number
  token: string
  onInfo(): void
  onClose(): void
  onSaved: Dispatch<LaunchPlanWorkspace>
}) {
  const [notes, setNotes] = useState(workspace.notes)
  const [cards, setCards] = useState<LaunchPlanCard[]>(workspace.cards)
  const [exploreTab, setExploreTab] = useState<'activities' | 'resources'>('activities')
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const initial = useMemo(() => JSON.stringify({ notes: workspace.notes, cards: workspace.cards }), [workspace])
  const dirty = JSON.stringify({ notes, cards }) !== initial
  const addedSources = new Set(cards.map((card) => card.source_uuid))

  useEffect(() => {
    const update = () => setGridWidth(gridRef.current?.clientWidth || 0)
    update()
    const observer = new ResizeObserver(update)
    if (gridRef.current) observer.observe(gridRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(workspace.notes)
    }
    setNotes(workspace.notes)
  }, [workspace.section.section_uuid, workspace.notes])

  const requestClose = () => {
    if (!dirty || window.confirm('Discard your unsaved Launch Plan changes?')) onClose()
  }
  const addResource = (resource: any) => {
    if (!resource.has_outcome || addedSources.has(resource.resource_uuid)) return
    setCards((current) => [...current, {
      card_uuid: `draft-${resource.resource_uuid}`,
      card_type: 'resource_outcome',
      source_uuid: resource.resource_uuid,
      grid: { x: 0, y: cards.length * 2, w: 6, h: 2 },
      source: {
        title: resource.title,
        outcome_text: resource.user_state?.outcome_text,
        outcome_link: resource.user_state?.outcome_link,
        outcome_file: resource.user_state?.outcome_file,
      },
    }])
  }
  const save = async () => {
    setSaving(true)
    try {
      const next = await updateLaunchPlanWorkspace(orgId, workspace.section.section_uuid, { notes: sanitizeHtml(notes), cards }, token)
      setNotes(next.notes)
      setCards(next.cards)
      onSaved(next)
      toast.success('Launch Plan updated')
      onClose()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update Launch Plan')
    } finally {
      setSaving(false)
    }
  }
  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    setNotes(sanitizeHtml(editorRef.current?.innerHTML || ''))
  }
  const addLink = () => {
    const url = window.prompt('Link URL')
    if (!url) return
    editorRef.current?.focus()
    document.execCommand('createLink', false, url)
    setNotes(sanitizeHtml(editorRef.current?.innerHTML || ''))
  }
  const layout: Layout = cards.map((card, index) => ({
    i: card.card_uuid,
    x: Number(card.grid.x ?? 0),
    y: Number(card.grid.y ?? index * 2),
    w: Number(card.grid.w ?? 6),
    h: Number(card.grid.h ?? 2),
    minW: 3,
    maxW: 12,
    minH: 2,
  }))

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 p-0 backdrop-blur-sm md:p-5">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl md:rounded-3xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600"><Check size={20} weight="bold" /></div>
          <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-semibold text-gray-950">{workspace.section.title}</h2><p className="text-xs text-gray-400">{workspace.section.canvas_title}</p></div>
          <button onClick={onInfo} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Area information"><Info size={19} /></button>
          <button onClick={requestClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={19} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-gray-100 bg-white px-5 py-2">
              <button onMouseDown={(e) => { e.preventDefault(); runCommand('bold') }} className="rounded p-2 hover:bg-gray-100" aria-label="Bold"><Bold size={16} /></button>
              <button onMouseDown={(e) => { e.preventDefault(); runCommand('italic') }} className="rounded p-2 hover:bg-gray-100" aria-label="Italic"><Italic size={16} /></button>
              <button onMouseDown={(e) => { e.preventDefault(); runCommand('formatBlock', 'h2') }} className="rounded p-2 hover:bg-gray-100" aria-label="Heading"><Heading2 size={16} /></button>
              <button onMouseDown={(e) => { e.preventDefault(); runCommand('insertUnorderedList') }} className="rounded p-2 hover:bg-gray-100" aria-label="Bullet list"><List size={16} /></button>
              <button onMouseDown={(e) => { e.preventDefault(); addLink() }} className="rounded p-2 hover:bg-gray-100" aria-label="Add link"><Link2 size={16} /></button>
            </div>
            <div className="p-5 sm:p-7">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(event) => setNotes(sanitizeHtml(event.currentTarget.innerHTML))}
                className="min-h-32 rounded-xl border border-transparent p-2 text-base leading-7 text-gray-800 outline-none empty:before:text-gray-400 empty:before:content-['Start_typing_your_next_breakthrough…'] focus:border-gray-200"
              />
              <div ref={gridRef} className="mt-5 min-h-48 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                const uuid = e.dataTransfer.getData('application/x-launch-plan-resource')
                const resource = workspace.resources.find((item) => item.resource_uuid === uuid)
                if (resource) addResource(resource)
              }}>
                {gridWidth > 0 && <GridLayout
                  width={gridWidth - 16}
                  layout={layout}
                  gridConfig={{ cols: 12, rowHeight: 55, margin: [12, 12], containerPadding: [0, 0] }}
                  dragConfig={{ enabled: true, cancel: 'button, a' }}
                  resizeConfig={{ enabled: false }}
                  onLayoutChange={(next) => setCards((current) => current.map((card) => {
                    const item = next.find((entry) => entry.i === card.card_uuid)
                    return item ? { ...card, grid: { x: item.x, y: item.y, w: item.w, h: item.h } } : card
                  }))}
                >
                  {cards.map((card) => <div key={card.card_uuid}><OutcomeCard card={card} onRemove={() => setCards((current) => current.filter((item) => item.card_uuid !== card.card_uuid))} /></div>)}
                </GridLayout>}
                {cards.length === 0 && <div className="flex min-h-44 items-center justify-center text-center text-sm text-gray-400">Drag a completed resource here or add it from Explore.</div>}
              </div>
            </div>
          </section>
          <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-t border-gray-200 bg-gray-50/60 md:max-h-none md:w-80 md:border-l md:border-t-0">
            <div className="border-b border-gray-200 bg-white px-4 pt-4"><h3 className="text-lg font-semibold">Explore</h3><div className="mt-3 flex gap-4 text-sm font-semibold">
              {(['activities', 'resources'] as const).map((tab) => <button key={tab} onClick={() => setExploreTab(tab)} className={`border-b-2 pb-2 capitalize ${exploreTab === tab ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500'}`}>{tab}</button>)}
            </div></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {exploreTab === 'activities' ? <ActivityCard /> : <div className="space-y-3">{workspace.resources.length ? workspace.resources.map((resource) => <ExploreResource key={resource.resource_uuid} resource={resource} added={addedSources.has(resource.resource_uuid)} onAdd={() => addResource(resource)} />) : <p className="py-8 text-center text-sm text-gray-400">No resources are tagged for this area yet.</p>}</div>}
            </div>
          </aside>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4">
          <button onClick={requestClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancel</button>
          <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"><Save size={16} /> {saving ? 'Updating…' : 'Update Launch Plan'}</button>
        </footer>
      </div>
    </div>
  )
}

function OutcomeCard({ card, onRemove }: { card: LaunchPlanCard; onRemove(): void }) {
  return <div className="group relative h-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <button onClick={onRemove} className="absolute right-2 top-2 rounded-full bg-gray-100 p-1 text-gray-400 opacity-0 group-hover:opacity-100" aria-label="Remove card"><X size={14} /></button>
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Resource outcome</p>
    <h4 className="mt-1 pr-6 font-semibold text-gray-900">{card.source?.title || 'Resource outcome'}</h4>
    <p className="mt-2 text-sm leading-5 text-gray-600">{card.source?.outcome_text || card.source?.outcome_link || 'Outcome attached to this resource.'}</p>
  </div>
}

function ActivityCard() {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Lightning size={20} weight="fill" /></div><h4 className="mt-3 font-semibold">Strengths quick activity</h4><p className="mt-1 text-sm leading-5 text-gray-500">A playful guided reflection for discovering what already works well.</p><button disabled className="mt-4 w-full rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-400">Coming soon</button></div>
}

function ExploreResource({ resource, added, onAdd }: { resource: any; added: boolean; onAdd(): void }) {
  return <div draggable={resource.has_outcome && !added} onDragStart={(event) => event.dataTransfer.setData('application/x-launch-plan-resource', resource.resource_uuid)} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
    <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><BookOpen size={17} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-900">{resource.title}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{resource.description}</p></div></div>
    <div className="mt-3 flex items-center gap-2"><a href={resource.external_url} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">Open <ExternalLink size={12} /></a><button onClick={onAdd} disabled={!resource.has_outcome || added} className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:bg-gray-100 disabled:text-gray-400">{added ? <Check size={12} /> : <Plus size={12} />}{added ? 'Added' : resource.has_outcome ? 'Add outcome' : 'No outcome'}</button></div>
  </div>
}
