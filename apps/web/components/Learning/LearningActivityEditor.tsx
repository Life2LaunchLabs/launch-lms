'use client'

import { useRouter } from 'next/navigation'
import React from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Hand,
  ListChecks,
  Link as LinkIcon,
  Loader2,
  Maximize2,
  MoreVertical,
  Monitor,
  MousePointer2,
  PencilLine,
  Plus,
  Smartphone,
  Trash2,
  Upload,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { LearningActivitySurface, LearningPageContent } from '@components/Learning/LearningBadgeViews'
import ReorderableList from '@components/Objects/ReorderableList'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import {
  createLearningPage,
  deleteLearningPage,
  updateLearningActivity,
  updateLearningPage,
  type LearningPageType,
} from '@services/learning/learning'

const addablePageTypes: Array<{ value: LearningPageType; label: string; icon: React.ReactNode }> = [
  { value: 'info', label: 'Info', icon: <FileText size={22} /> },
  { value: 'video', label: 'Video', icon: <Video size={22} /> },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: <ListChecks size={22} /> },
  { value: 'text_input', label: 'Text Input', icon: <PencilLine size={22} /> },
]

const deviceFrames = {
  mobile: { width: 390, height: 760 },
  desktop: { width: 960, height: 640 },
}
const mobileFrameCap = 32

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

type PageGroup = {
  id: string
  pages: any[]
}

const pageTypeStyles: Record<LearningPageType, { label: string; card: string; note: string; border: string }> = {
  video: {
    label: 'Video',
    card: 'bg-rose-50',
    note: 'bg-rose-200 text-rose-950',
    border: 'border-rose-200',
  },
  info: {
    label: 'Info',
    card: 'bg-sky-50',
    note: 'bg-sky-200 text-sky-950',
    border: 'border-sky-200',
  },
  multiple_choice: {
    label: 'Multiple Choice',
    card: 'bg-violet-50',
    note: 'bg-violet-200 text-violet-950',
    border: 'border-violet-200',
  },
  text_input: {
    label: 'Text Input',
    card: 'bg-amber-50',
    note: 'bg-amber-200 text-amber-950',
    border: 'border-amber-200',
  },
  question_response: {
    label: 'Question Response',
    card: 'bg-emerald-50',
    note: 'bg-emerald-200 text-emerald-950',
    border: 'border-emerald-200',
  },
}

export default function LearningActivityEditor({
  badgePath,
  activity,
}: {
  orgslug: string
  badgePath: any
  activity: any
}) {
  const session = useLHSession() as any
  const router = useRouter()
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const [activityState, setActivityState] = React.useState(activity)
  const [pages, setPages] = React.useState<any[]>(activity.pages || [])
  const [selectedPageUuid, setSelectedPageUuid] = React.useState(pages[0]?.page_uuid)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewMode, setPreviewMode] = React.useState<'mobile' | 'desktop'>('mobile')
  const [leftWidth, setLeftWidth] = React.useState(320)
  const [rightWidth, setRightWidth] = React.useState(360)
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [handMode, setHandMode] = React.useState(false)
  const [fitScale, setFitScale] = React.useState(1)
  const [saveState, setSaveState] = React.useState<SaveState>('saved')
  const [publishing, setPublishing] = React.useState(false)
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const pendingSavesRef = React.useRef<Record<string, any>>({})
  const selectedPage = pages.find((page) => page.page_uuid === selectedPageUuid) || pages[0]
  const selectedIndex = Math.max(0, pages.findIndex((page) => page.page_uuid === selectedPage?.page_uuid))
  const selectedLinkedResponse = selectedPage ? findResponseForPage(pages, selectedPage.page_uuid) : null
  const frame = deviceFrames[previewMode]
  const frameShellHeight = previewMode === 'mobile' ? frame.height + mobileFrameCap * 2 : frame.height

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const syncFit = () => {
      const horizontalPadding = 96
      const verticalPadding = 72
      const controlsSpace = 132
      const nextScale = Math.min(
        1,
        Math.max(0.25, (canvas.clientWidth - horizontalPadding) / frame.width),
        Math.max(0.25, (canvas.clientHeight - verticalPadding - controlsSpace) / frameShellHeight)
      )
      setFitScale(nextScale)
    }

    syncFit()
    const observer = new ResizeObserver(syncFit)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [frame.height, frame.width, frameShellHeight, leftWidth, rightWidth, previewMode])

  React.useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [previewMode, selectedPageUuid])

  const flushPendingSaves = React.useCallback(async (options?: { rethrow?: boolean }) => {
    const entries = Object.entries(pendingSavesRef.current)
    if (!entries.length) return
    pendingSavesRef.current = {}
    setSaveState('saving')
    try {
      const savedPages = await Promise.all(entries.map(([pageUuid, patch]) => updateLearningPage(pageUuid, patch, accessToken)))
      setPages((current) => current.map((page) => savedPages.find((saved) => saved.page_uuid === page.page_uuid) || page))
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (error: any) {
      pendingSavesRef.current = entries.reduce((acc: Record<string, any>, [pageUuid, patch]) => ({ ...acc, [pageUuid]: mergePatch(pendingSavesRef.current[pageUuid] || {}, patch) }), {})
      setSaveState('error')
      toast.error(error?.message || 'Autosave failed')
      if (options?.rethrow) throw error
    }
  }, [accessToken])

  React.useEffect(() => {
    const flush = () => {
      if (!Object.keys(pendingSavesRef.current).length) return
      void flushPendingSaves()
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      flush()
    }
  }, [flushPendingSaves])

  const schedulePageSave = React.useCallback((pageUuid: string, patch: any) => {
    pendingSavesRef.current[pageUuid] = mergePatch(pendingSavesRef.current[pageUuid] || {}, patch)
    setSaveState('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushPendingSaves()
    }, 800)
  }, [flushPendingSaves])

  const patchSelectedPage = (patch: any) => {
    if (!selectedPage) return
    setPages((current) => current.map((page) => page.page_uuid === selectedPage.page_uuid ? mergePatch(page, patch) : page))
    schedulePageSave(selectedPage.page_uuid, patch)
  }

  const addPage = async (type: LearningPageType = 'info') => {
    try {
      const page = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: type,
        title: `New ${type.replace('_', ' ')} page`,
        content: {},
        design: {},
        scoring: {},
        completion: { mode: 'manual' },
      }, accessToken)
      setPages((current) => [...current, page])
      setSelectedPageUuid(page.page_uuid)
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add page')
    }
  }

  const duplicatePage = async (page: any) => {
    try {
      await flushPendingSaves()
      const duplicate = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: page.page_type,
        title: `${page.title || 'Untitled page'} copy`,
        required: page.required ?? true,
        content: cloneJson(page.content || {}),
        design: cloneJson(page.design || {}),
        scoring: cloneJson(page.scoring || {}),
        completion: cloneJson(page.completion || { mode: 'manual' }),
      }, accessToken)
      const sourceIndex = pages.findIndex((item) => item.page_uuid === page.page_uuid)
      const nextPages = [...pages]
      nextPages.splice(sourceIndex + 1, 0, duplicate)
      const orderedPages = withSequentialOrder(nextPages)
      setPages(orderedPages)
      setSelectedPageUuid(duplicate.page_uuid)
      await persistPageOrder(orderedPages)
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to duplicate page')
    }
  }

  const reorderPages = async (nextPages: any[]) => {
    const orderedPages = withSequentialOrder(nextPages)
    setPages(orderedPages)
    setSaveState('saving')
    try {
      await persistPageOrder(orderedPages)
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (error: any) {
      setSaveState('error')
      toast.error(error?.message || 'Failed to reorder pages')
    }
  }

  const reorderPageGroups = (nextGroups: PageGroup[]) => {
    void reorderPages(nextGroups.flatMap((group) => group.pages))
  }

  const addQuestionResponse = async (page: any) => {
    if (!isQuestionPage(page) || findResponseForPage(pages, page.page_uuid)) return
    try {
      await flushPendingSaves()
      const response = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: 'question_response',
        title: `${page.title || 'Question'}: response`,
        content: {
          linked_page_uuid: page.page_uuid,
          variants: {
            default: {
              title: 'Response',
              body: '',
            },
          },
        },
        design: {},
        scoring: {},
        completion: { mode: 'manual' },
      }, accessToken)
      const sourceIndex = pages.findIndex((item) => item.page_uuid === page.page_uuid)
      const nextPages = [...pages]
      nextPages.splice(sourceIndex + 1, 0, response)
      const orderedPages = withSequentialOrder(nextPages)
      setPages(orderedPages)
      setSelectedPageUuid(response.page_uuid)
      await persistPageOrder(orderedPages)
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add response page')
    }
  }

  const removeQuestionResponse = async (page: any) => {
    const response = findResponseForPage(pages, page.page_uuid)
    if (!response) return
    if (!confirm(`Remove "${response.title}"?`)) return
    await deleteLearningPage(response.page_uuid, accessToken)
    const nextPages = pages.filter((item) => item.page_uuid !== response.page_uuid)
    const orderedPages = withSequentialOrder(nextPages)
    setPages(orderedPages)
    if (selectedPageUuid === response.page_uuid) setSelectedPageUuid(page.page_uuid)
    await persistPageOrder(orderedPages)
  }

  const persistPageOrder = async (orderedPages: any[]) => {
    await Promise.all(orderedPages.map((page, index) => {
      return updateLearningPage(page.page_uuid, { order: index + 1 }, accessToken)
    }))
  }

  const removePage = async (page: any) => {
    if (!confirm(`Delete "${page.title}"?`)) return
    const linkedResponse = isQuestionPage(page) ? findResponseForPage(pages, page.page_uuid) : null
    await deleteLearningPage(page.page_uuid, accessToken)
    if (linkedResponse) await deleteLearningPage(linkedResponse.page_uuid, accessToken)
    const nextPages = pages.filter((item) => item.page_uuid !== page.page_uuid && item.page_uuid !== linkedResponse?.page_uuid)
    const orderedPages = withSequentialOrder(nextPages)
    setPages(orderedPages)
    setSelectedPageUuid(orderedPages[0]?.page_uuid)
    await persistPageOrder(orderedPages)
  }

  const saveBeforeAction = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await flushPendingSaves({ rethrow: true })
  }

  const goBack = async () => {
    try {
      await saveBeforeAction()
      router.back()
    } catch (error: any) {
      toast.error(error?.message || 'Save failed')
    }
  }

  const openPreview = async () => {
    try {
      await saveBeforeAction()
      setPreviewOpen(true)
    } catch (error: any) {
      toast.error(error?.message || 'Save failed')
    }
  }

  const publishActivity = async () => {
    const nextPublished = !activityState.published
    setPublishing(true)
    try {
      await saveBeforeAction()
      const savedActivity = await updateLearningActivity(activityState.activity_uuid, { published: nextPublished }, accessToken)
      setActivityState((current: any) => ({ ...current, ...(savedActivity || {}), published: nextPublished }))
      toast.success(nextPublished ? 'Activity published' : 'Activity unpublished')
    } catch (error: any) {
      toast.error(error?.message || 'Could not update publish status')
    } finally {
      setPublishing(false)
    }
  }

  const resizePanel = (side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth

    const onMove = (moveEvent: PointerEvent) => {
      const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      const next = Math.min(520, Math.max(240, startWidth + delta))
      if (side === 'left') setLeftWidth(next)
      else setRightWidth(next)
    }

    const onUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onWheelCanvas = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      setZoom((current) => clamp(Number((current + (event.deltaY > 0 ? -0.08 : 0.08)).toFixed(2)), 1, 2.5))
      return
    }
    if (zoom > 1) {
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
    }
  }

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom === 1 || (!handMode && event.button !== 1)) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, pan }

    const onMove = (moveEvent: PointerEvent) => {
      setPan({
        x: start.pan.x + moveEvent.clientX - start.x,
        y: start.pan.y + moveEvent.clientY - start.y,
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-[#f6f7f8] text-gray-950">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={goBack} className="rounded-lg p-2 hover:bg-gray-100" title="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{activityState.title}</p>
            <p className="text-xs text-gray-500">{badge.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveStateLabel state={saveState} lastSavedAt={lastSavedAt} />
          <button onClick={openPreview} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950">
            <Eye size={16} />
            Preview
          </button>
          <button
            onClick={publishActivity}
            disabled={publishing}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
              activityState.published
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-gray-950 bg-gray-950 text-white shadow-sm hover:bg-black'
            }`}
          >
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {activityState.published ? 'Published' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1">
        <aside style={{ width: leftWidth }} className="relative min-h-0 shrink-0 overflow-hidden border-r border-gray-200 bg-white">
          <PageList
            pages={pages}
            selectedPage={selectedPage}
            addPage={addPage}
            selectPage={setSelectedPageUuid}
            reorderPageGroups={reorderPageGroups}
            duplicatePage={duplicatePage}
            removePage={removePage}
          />
          <ResizeHandle side="right" onPointerDown={(event) => resizePanel('left', event)} />
        </aside>

        <main className="relative min-w-0 flex-1 basis-0 overflow-hidden">
          <div
            ref={canvasRef}
            onWheel={onWheelCanvas}
            onPointerDown={startPan}
            className={`h-full w-full overflow-hidden ${handMode && zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{
              backgroundColor: '#f2f3f5',
              backgroundImage: 'radial-gradient(circle, rgba(15,23,42,.12) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            <div className="flex h-full w-full items-center justify-center px-12 pb-32 pt-8">
              <div
                style={{
                  width: frame.width,
                  height: frameShellHeight,
                  minWidth: frame.width,
                  minHeight: frameShellHeight,
                  transform: `translate(${zoom > 1 ? pan.x : 0}px, ${zoom > 1 ? pan.y : 0}px) scale(${fitScale * zoom})`,
                  transformOrigin: 'center center',
                }}
                className={`${previewMode === 'mobile' ? 'rounded-[2rem] bg-[var(--org-page-background)]' : 'rounded-xl bg-white'} shrink-0 overflow-hidden shadow-2xl ring-1 ring-black/10`}
              >
                <div
                  style={previewMode === 'mobile' ? { height: frame.height, marginTop: mobileFrameCap, marginBottom: mobileFrameCap } : { height: frame.height }}
                  className="overflow-hidden"
                >
                  <LearningActivitySurface
                    pages={pages}
                    page={selectedPage}
                    pageIndex={selectedIndex}
                    onBack={() => null}
                    actionLabel={selectedIndex === pages.length - 1 ? 'Finish' : 'Continue'}
                    actionDisabled
                    className="h-full"
                  >
                    <LearningPageContent page={selectedPage} pages={pages} editable onPagePatch={patchSelectedPage} answer={{}} setAnswer={() => null} setUnlocked={() => null} />
                  </LearningActivitySurface>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-20 left-1/2 grid w-52 -translate-x-1/2 grid-cols-2 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
            <DeviceModeButton active={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} icon={<Smartphone size={15} />} label="Mobile" />
            <DeviceModeButton active={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} icon={<Monitor size={15} />} label="Desktop" />
          </div>

          <div className="absolute bottom-5 right-[calc(50%+112px)] flex items-center rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
            <ToolbarButton title={handMode ? 'Hand mode' : 'Pointer mode'} active={handMode} onClick={() => setHandMode((current) => !current)}>
              {handMode ? <Hand size={16} /> : <MousePointer2 size={16} />}
            </ToolbarButton>
          </div>

          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
            <ToolbarButton title="Zoom out" onClick={() => setZoom((current) => clamp(Number((current - 0.1).toFixed(2)), 1, 2.5))}><ZoomOut size={16} /></ToolbarButton>
            <span className="w-14 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span>
            <ToolbarButton title="Zoom in" onClick={() => setZoom((current) => clamp(Number((current + 0.1).toFixed(2)), 1, 2.5))}><ZoomIn size={16} /></ToolbarButton>
          </div>

          {zoom > 1 && (
            <div className="absolute bottom-5 left-[calc(50%+112px)] flex items-center rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
              <ToolbarButton title="Center" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><Maximize2 size={16} /></ToolbarButton>
            </div>
          )}
        </main>

        <aside style={{ width: rightWidth }} className="relative min-h-0 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
          <ResizeHandle side="left" onPointerDown={(event) => resizePanel('right', event)} />
          {selectedPage ? (
            <PageSettings
              page={selectedPage}
              pages={pages}
              linkedResponse={selectedLinkedResponse}
              patchPage={patchSelectedPage}
              removePage={removePage}
              addQuestionResponse={addQuestionResponse}
              removeQuestionResponse={removeQuestionResponse}
            />
          ) : (
            <button onClick={() => addPage()} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white">
              <Plus size={16} />
              Add first page
            </button>
          )}
        </aside>
      </div>
      {previewOpen && (
        <LearningActivityPreviewOverlay
          pages={pages}
          onClose={() => setPreviewOpen(false)}
          initialMode={previewMode}
        />
      )}
    </div>
  )
}

function LearningActivityPreviewOverlay({ pages, onClose, initialMode }: { pages: any[]; onClose: () => void; initialMode: 'mobile' | 'desktop' }) {
  const [mode, setMode] = React.useState<'mobile' | 'desktop'>(initialMode)
  const [index, setIndex] = React.useState(0)
  const [answer, setAnswer] = React.useState<any>({})
  const [unlocked, setUnlocked] = React.useState(false)
  const [attempts, setAttempts] = React.useState<any[]>([])
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 })
  const page = pages[index]
  const mobileFrame = deviceFrames.mobile
  const mobileShellHeight = mobileFrame.height + mobileFrameCap * 2
  const mobileScale = viewport.width && viewport.height
    ? Math.min(1, (viewport.width - 32) / mobileFrame.width, (viewport.height - 64) / mobileShellHeight)
    : 1

  React.useEffect(() => {
    setAnswer({})
    setUnlocked(page?.page_type === 'info' || page?.page_type === 'question_response')
  }, [page?.page_type, page?.page_uuid])

  React.useEffect(() => {
    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const completeAndNext = () => {
    if (!page) return
    if (page.page_type === 'multiple_choice' || page.page_type === 'text_input') {
      setAttempts((current) => [
        ...current,
        {
          result: {
            page_uuid: page.page_uuid,
            answer,
          },
          is_correct: answer?.is_correct,
        },
      ])
    }
    if (index < pages.length - 1) {
      setIndex((current) => current + 1)
    } else {
      onClose()
    }
  }

  const surface = (
        <LearningActivitySurface
          pages={pages}
          page={page}
          pageIndex={index}
          onBack={onClose}
          actionLabel={index === pages.length - 1 ? 'Finish preview' : 'Continue'}
          actionDisabled={!unlocked}
          onAction={completeAndNext}
          interactionState={answer}
          className="h-full"
        >
      <LearningPageContent
        page={page}
        pages={pages}
        answer={answer}
        setAnswer={setAnswer}
        setUnlocked={setUnlocked}
        run={{ attempts }}
      />
    </LearningActivitySurface>
  )

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950">
      <div className="absolute right-5 top-5 z-20 grid w-48 grid-cols-2 rounded-xl border border-white/10 bg-white/10 p-1 shadow-2xl backdrop-blur">
        <DeviceModeButton active={mode === 'desktop'} onClick={() => setMode('desktop')} icon={<Monitor size={15} />} label="Desktop" />
        <DeviceModeButton active={mode === 'mobile'} onClick={() => setMode('mobile')} icon={<Smartphone size={15} />} label="Mobile" />
      </div>
      {mode === 'desktop' ? (
        surface
      ) : (
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,.16),transparent_32rem)] px-5 py-8">
          <div
            style={{
              width: mobileFrame.width * mobileScale,
              height: mobileShellHeight * mobileScale,
            }}
          >
            <div
              style={{
                width: mobileFrame.width,
                height: mobileShellHeight,
                borderRadius: 36,
                boxShadow: '0 24px 80px rgba(0,0,0,.55), 0 0 0 8px rgba(255,255,255,.10)',
                transform: `scale(${mobileScale})`,
                transformOrigin: 'top left',
              }}
              className="overflow-hidden bg-[var(--org-page-background)]"
            >
              <div style={{ height: mobileFrame.height, marginTop: mobileFrameCap, marginBottom: mobileFrameCap }} className="overflow-hidden">
                {surface}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PageList({ pages, selectedPage, addPage, selectPage, reorderPageGroups, duplicatePage, removePage }: any) {
  const [addPanelOpen, setAddPanelOpen] = React.useState(false)
  const groups = React.useMemo(() => buildPageGroups(pages), [pages])
  const pageNumberByUuid = React.useMemo(() => {
    return pages.reduce((acc: Record<string, number>, page: any, index: number) => ({ ...acc, [page.page_uuid]: index + 1 }), {})
  }, [pages])

  const selectType = async (type: LearningPageType) => {
    await addPage(type)
    setAddPanelOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-4 pt-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-gray-400">Pages</p>
        <span className="text-xs font-semibold text-gray-400">{pages.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-1 [scrollbar-gutter:stable]">
        <ReorderableList
          droppableId="learning-editor-pages"
          items={groups}
          getId={(group: PageGroup) => group.id}
          onReorder={reorderPageGroups}
          className="space-y-3 [&_[data-rfd-placeholder-context-id]]:rounded-lg [&_[data-rfd-placeholder-context-id]]:bg-gray-950/5 [&_[data-rfd-placeholder-context-id]]:shadow-inner"
          itemClassName={(_group, _index, isDragging) => isDragging ? 'rounded-xl shadow-2xl shadow-gray-950/20' : 'rounded-xl'}
          renderItem={({ item: group, isDragging, dragHandleProps }) => (
            <PageNavGroup
              group={group}
              pageNumberByUuid={pageNumberByUuid}
              isDragging={isDragging}
              dragHandleProps={dragHandleProps}
              selectedPageUuid={selectedPage?.page_uuid}
              onSelect={selectPage}
              onDuplicate={duplicatePage}
              onDelete={removePage}
            />
          )}
        />
      </div>

      <div className="relative shrink-0 p-4">
        {addPanelOpen && (
          <div className="absolute bottom-[4.25rem] left-4 right-4 z-50 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl shadow-gray-950/20">
            <div className="grid grid-cols-2 gap-2">
              {addablePageTypes.map((type) => {
                const style = pageTypeStyles[type.value]
                return (
                  <button key={type.value} onClick={() => void selectType(type.value)} className={`rounded-lg border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-sm ${style.card} ${style.border}`}>
                    <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-lg ${style.note}`}>
                      {type.icon}
                    </span>
                    <span className="mt-2 block text-xs font-black text-gray-950">{type.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <button onClick={() => setAddPanelOpen((current) => !current)} className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-bold transition ${addPanelOpen ? 'border-gray-300 bg-gray-950 text-white hover:bg-black' : 'border-dashed border-gray-300 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700'}`}>
          {addPanelOpen ? <X size={16} /> : <Plus size={16} />}
          {addPanelOpen ? 'Cancel' : 'Add page'}
        </button>
      </div>
    </div>
  )
}

function PageNavGroup({ group, pageNumberByUuid, selectedPageUuid, isDragging, dragHandleProps, onSelect, onDuplicate, onDelete }: any) {
  const paired = group.pages.length > 1
  return (
    <div className={`group/page-group relative ${paired ? 'rounded-xl border border-dashed border-purple-300 bg-purple-50/35 p-2' : ''} ${isDragging ? 'rotate-1 shadow-2xl shadow-gray-950/25 ring-2 ring-purple-300' : ''}`}>
      <button
        {...dragHandleProps}
        onClick={(event) => event.stopPropagation()}
        className="absolute -left-3 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition hover:text-gray-900 active:cursor-grabbing group-hover/page-group:opacity-100"
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <div className={paired ? 'space-y-2' : ''}>
        {group.pages.map((page: any) => (
          <PageNavCard
            key={page.page_uuid}
            page={page}
            index={pageNumberByUuid[page.page_uuid] || 1}
            selected={selectedPageUuid === page.page_uuid}
            paired={paired}
            onSelect={() => onSelect(page.page_uuid)}
            onDuplicate={() => onDuplicate(page)}
            onDelete={() => onDelete(page)}
          />
        ))}
      </div>
    </div>
  )
}

function PageNavCard({ page, index, selected, paired, onSelect, onDuplicate, onDelete }: any) {
  const style = pageTypeStyles[page.page_type as LearningPageType] || pageTypeStyles.info
  return (
    <div
      onClick={onSelect}
      className={`group/page-card relative flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${style.card} ${selected ? 'border-purple-500 ring-2 ring-purple-500/10' : style.border} ${paired ? '' : 'hover:-translate-y-0.5 hover:shadow-sm'}`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-sm font-black shadow-sm ${style.note}`}>
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-gray-950">{page.title}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-gray-500">{style.label}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button onClick={(event) => event.stopPropagation()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-0 transition hover:bg-white/70 hover:text-gray-950 group-hover/page-card:opacity-100 data-[state=open]:opacity-100">
            <MoreVertical size={17} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-50 border-gray-200 bg-white text-gray-950 shadow-xl">
          {page.page_type !== 'question_response' && (
            <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onDuplicate() }}>
              <Copy size={15} />
              Duplicate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onDelete() }} className="text-red-600 focus:text-red-600">
            <Trash2 size={15} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function PageSettings({ page, pages, linkedResponse, patchPage, removePage, addQuestionResponse, removeQuestionResponse }: any) {
  const style = pageTypeStyles[page.page_type as LearningPageType] || pageTypeStyles.info
  const tabs = getPageSettingsTabs(page)
  const [activeTab, setActiveTab] = React.useState(tabs[0].key)
  const linkedQuestion = page.page_type === 'question_response'
    ? pages.find((item: any) => item.page_uuid === page.content?.linked_page_uuid)
    : null

  React.useEffect(() => {
    const nextTabs = getPageSettingsTabs(page)
    if (!nextTabs.some((tab) => tab.key === activeTab)) setActiveTab(nextTabs[0].key)
  }, [activeTab, page.page_type])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-gray-400">{style.label}</p>
          <input
            value={page.title || ''}
            onChange={(event) => patchPage({ title: event.target.value })}
            className="mt-2 block w-full truncate border-0 bg-transparent p-0 text-lg font-bold text-gray-950 outline-none placeholder:text-gray-300 focus:text-[var(--org-primary-color)]"
            placeholder="Untitled page"
          />
        </div>
        <button onClick={() => removePage(page)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex items-center gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative py-3 text-sm font-bold transition ${activeTab === tab.key ? 'text-[var(--org-primary-color)]' : 'text-gray-400 hover:text-gray-700'}`}
            >
              {tab.label}
              {activeTab === tab.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--org-primary-color)]" />}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'content' && (
        <PageContentSettings
          page={page}
          pages={pages}
          linkedQuestion={linkedQuestion}
          linkedResponse={linkedResponse}
          patchPage={patchPage}
          addQuestionResponse={addQuestionResponse}
          removeQuestionResponse={removeQuestionResponse}
        />
      )}
      {activeTab === 'design' && <PageDesignSettings page={page} patchPage={patchPage} />}
      {activeTab === 'scoring' && <PageScoringSettings page={page} patchPage={patchPage} />}
    </div>
  )
}

function PageContentSettings({ page, linkedQuestion, linkedResponse, patchPage, addQuestionResponse, removeQuestionResponse }: any) {
  if (page.page_type === 'video') {
    return (
      <div className="space-y-5">
        <label className="block text-sm font-medium">
          Video URL
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-[var(--org-primary-color)] focus-within:ring-2 focus-within:ring-[var(--org-primary-color)]">
            <LinkIcon size={16} className="text-gray-400" />
            <input
              value={page.content?.video_url || ''}
              onChange={(event) => patchPage({ content: { ...(page.content || {}), video_url: event.target.value } })}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
              placeholder="Paste a YouTube or direct video URL"
            />
          </div>
        </label>
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          <div className="flex items-center gap-2 font-bold text-gray-700">
            <Upload size={16} />
            Upload video
          </div>
          <p className="mt-2 text-xs leading-5">Upload support needs the matching learning-media endpoint. URL playback is available now.</p>
          <button disabled className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-gray-200 px-3 text-xs font-bold text-gray-500">
            Upload coming soon
          </button>
        </div>
      </div>
    )
  }

  if (isQuestionPage(page)) {
    return (
      <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
        <span>
          <span className="block text-sm font-bold">Question response</span>
          <span className="mt-1 block text-xs leading-5 text-gray-500">Add a linked response page immediately after this question.</span>
        </span>
        <input
          type="checkbox"
          checked={!!linkedResponse}
          onChange={(event) => {
            if (event.target.checked) void addQuestionResponse(page)
            else void removeQuestionResponse(page)
          }}
          className="h-5 w-5 accent-[var(--org-primary-color)]"
        />
      </label>
    )
  }

  if (page.page_type === 'question_response') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-bold text-emerald-950">Linked question</p>
        <p className="mt-1 text-sm text-emerald-900">{linkedQuestion?.title || 'No linked question'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-bold">Content</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">Text content is edited directly on the canvas.</p>
    </div>
  )
}

function PageDesignSettings({ page, patchPage }: any) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-bold">Design</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">Page-level design controls will live here.</p>
    </div>
  )
}

function PageScoringSettings({ page, patchPage }: any) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-bold">Scoring</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">Scoring and feedback rules for this question will live here.</p>
    </div>
  )
}

function SaveStateLabel({ state, lastSavedAt }: { state: SaveState; lastSavedAt: Date | null }) {
  const label = state === 'saving'
    ? 'Saving...'
    : state === 'dirty'
      ? 'Unsaved changes'
      : state === 'error'
        ? 'Autosave failed'
        : lastSavedAt
          ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Saved'
  return <span className={`text-xs font-medium ${state === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{label}</span>
}

function ToolbarButton({ title, active, onClick, children }: any) {
  return (
    <button title={title} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${active ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}>
      {children}
    </button>
  )
}

function DeviceModeButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`inline-flex h-8 items-center justify-center gap-2 rounded-lg text-xs font-bold transition ${active ? 'bg-black text-white shadow-sm' : 'text-gray-500 hover:text-gray-950'}`}>
      {icon}
      {label}
    </button>
  )
}

function ResizeHandle({ side, onPointerDown }: { side: 'left' | 'right'; onPointerDown: React.PointerEventHandler<HTMLDivElement> }) {
  return (
    <div onPointerDown={onPointerDown} className={`group absolute top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center ${side === 'left' ? '-left-1.5' : '-right-1.5'}`}>
      <div className="h-12 w-1 rounded-full bg-gray-300 opacity-0 transition group-hover:opacity-100" />
    </div>
  )
}

function mergePatch(base: any, patch: any): any {
  const next = { ...(base || {}) }
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergePatch(next[key], value)
    } else {
      next[key] = value
    }
  })
  return next
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isQuestionPage(page: any) {
  return page?.page_type === 'multiple_choice' || page?.page_type === 'text_input'
}

function findResponseForPage(pages: any[], pageUuid: string) {
  return pages.find((page) => page.page_type === 'question_response' && page.content?.linked_page_uuid === pageUuid)
}

function getPageSettingsTabs(page: any) {
  const tabs = [
    { key: 'content', label: 'Content' },
    { key: 'design', label: 'Design' },
  ]
  if (isQuestionPage(page)) tabs.push({ key: 'scoring', label: 'Scoring' })
  return tabs
}

function buildPageGroups(pages: any[]): PageGroup[] {
  const consumed = new Set<string>()

  return pages.reduce((groups: PageGroup[], page) => {
    if (consumed.has(page.page_uuid)) return groups

    if (isQuestionPage(page)) {
      const response = findResponseForPage(pages, page.page_uuid)
      if (response) {
        consumed.add(page.page_uuid)
        consumed.add(response.page_uuid)
        groups.push({ id: `${page.page_uuid}:${response.page_uuid}`, pages: [page, response] })
        return groups
      }
    }

    consumed.add(page.page_uuid)
    groups.push({ id: page.page_uuid, pages: [page] })
    return groups
  }, [])
}

function withSequentialOrder(pages: any[]) {
  return pages.map((page, index) => ({ ...page, order: index + 1 }))
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
