'use client'

import { useRouter } from 'next/navigation'
import React from 'react'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Hand,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Layers3,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  Monitor,
  MousePointer2,
  Plus,
  Quote,
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
  uploadLearningPageMedia,
} from '@services/learning/learning'
import {
  findQuestionBlock,
  type LearningBlock,
  type LearningImageBlock,
  type LearningPageType,
  type LearningQuestionBlock,
  type LearningTextBlock,
} from '@components/Learning/schema'
import type { ActivityGradingMode, DeviceMode, EditorViewMode, SaveState, Selection } from './types'
import {
  EMPTY_PARAGRAPH,
  blockLabel,
  cloneJson,
  createBlockId,
  createImageBlock,
  createInputId,
  createOptionId,
  createQuestionBlock,
  createTextBlock,
  findPriorQuestionPage,
  getActivityGradingSettings,
  getBlockStyle,
  getDefaultQuestionPagePatch,
  getPageBlocks,
  mergePatch,
  normalizeInitialPages,
  normalizeQuestionInputs,
  normalizeQuestionOptions,
  withSequentialOrder,
} from './utils'
import {
  DeviceModeButton,
  FieldLabel,
  IconButton,
  InspectorSection,
  SaveStateLabel,
  SegmentedControl,
  TextField,
  TopModeButton,
} from './ui'
import { DEVICE_FRAMES, MOBILE_FRAME_CAP } from './constants'
import { PageListPanel } from './PageListPanel'

export default function LearningActivityEditor({
  orgslug: _orgslug,
  badgePath,
  activity,
}: {
  orgslug: string
  badgePath: any
  activity: any
}) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const [activityState, setActivityState] = React.useState(activity)
  const [viewMode, setViewMode] = React.useState<EditorViewMode>('editor')
  const [pages, setPages] = React.useState<any[]>(() => normalizeInitialPages(activity.pages || []))
  const [selection, setSelection] = React.useState<Selection>(() => ({
    pageUuid: (activity.pages || [])[0]?.page_uuid,
    blockId: null,
  }))
  const [device, setDevice] = React.useState<DeviceMode>('mobile')
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = React.useState(1)
  const [handMode, setHandMode] = React.useState(false)
  const [saveState, setSaveState] = React.useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [publishing, setPublishing] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [uploadingBlockId, setUploadingBlockId] = React.useState<string | null>(null)
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const mediaInputRef = React.useRef<HTMLInputElement | null>(null)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const activitySaveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const pendingPagePatchesRef = React.useRef<Record<string, any>>({})
  const pendingActivityPatchRef = React.useRef<Record<string, any>>({})

  const selectedPage = pages.find((page) => page.page_uuid === selection.pageUuid) || pages[0]
  const selectedIndex = Math.max(0, pages.findIndex((page) => page.page_uuid === selectedPage?.page_uuid))
  const selectedBlock = selectedPage ? getPageBlocks(selectedPage).find((block) => block.id === selection.blockId) || null : null
  const frame = DEVICE_FRAMES[device]
  const frameShellHeight = device === 'mobile' ? frame.height + MOBILE_FRAME_CAP * 2 : frame.height
  const gradingSettings = getActivityGradingSettings(activityState)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const syncFit = () => {
      const controlsSpace = 128
      setFitScale(Math.min(
        1,
        Math.max(0.25, (canvas.clientWidth - 112) / frame.width),
        Math.max(0.25, (canvas.clientHeight - controlsSpace - 80) / frameShellHeight)
      ))
    }
    syncFit()
    const observer = new ResizeObserver(syncFit)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [device, frame.height, frame.width, frameShellHeight, viewMode])

  React.useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [device, selection.pageUuid])

  const flushPendingPages = React.useCallback(async (options?: { rethrow?: boolean }) => {
    const entries = Object.entries(pendingPagePatchesRef.current)
    if (!entries.length) return
    pendingPagePatchesRef.current = {}
    setSaveState('saving')
    try {
      const savedPages = await Promise.all(entries.map(([pageUuid, patch]) => updateLearningPage(pageUuid, patch, accessToken)))
      setPages((current) => current.map((page) => savedPages.find((saved) => saved.page_uuid === page.page_uuid) || page))
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (error: any) {
      pendingPagePatchesRef.current = entries.reduce((acc: Record<string, any>, [pageUuid, patch]) => ({
        ...acc,
        [pageUuid]: mergePatch(pendingPagePatchesRef.current[pageUuid] || {}, patch),
      }), {})
      setSaveState('error')
      toast.error(error?.message || 'Autosave failed')
      if (options?.rethrow) throw error
    }
  }, [accessToken])

  const flushPendingActivity = React.useCallback(async (options?: { rethrow?: boolean }) => {
    const patch = pendingActivityPatchRef.current
    if (!Object.keys(patch).length) return
    pendingActivityPatchRef.current = {}
    setSaveState('saving')
    try {
      const saved = await updateLearningActivity(activityState.activity_uuid, patch, accessToken)
      setActivityState((current: any) => ({ ...current, ...(saved || {}), ...patch }))
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (error: any) {
      pendingActivityPatchRef.current = mergePatch(pendingActivityPatchRef.current, patch)
      setSaveState('error')
      toast.error(error?.message || 'Autosave failed')
      if (options?.rethrow) throw error
    }
  }, [accessToken, activityState.activity_uuid])

  React.useEffect(() => {
    const flush = () => {
      void flushPendingPages()
      void flushPendingActivity()
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (activitySaveTimerRef.current) clearTimeout(activitySaveTimerRef.current)
      flush()
    }
  }, [flushPendingActivity, flushPendingPages])

  const schedulePageSave = React.useCallback((pageUuid: string, patch: any) => {
    pendingPagePatchesRef.current[pageUuid] = mergePatch(pendingPagePatchesRef.current[pageUuid] || {}, patch)
    setSaveState('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushPendingPages(), 800)
  }, [flushPendingPages])

  const scheduleActivitySave = React.useCallback((patch: any) => {
    pendingActivityPatchRef.current = mergePatch(pendingActivityPatchRef.current, patch)
    setSaveState('dirty')
    if (activitySaveTimerRef.current) clearTimeout(activitySaveTimerRef.current)
    activitySaveTimerRef.current = setTimeout(() => void flushPendingActivity(), 800)
  }, [flushPendingActivity])

  const patchPage = React.useCallback((pageUuid: string, patch: any) => {
    setPages((current) => current.map((page) => page.page_uuid === pageUuid ? mergePatch(page, patch) : page))
    schedulePageSave(pageUuid, patch)
  }, [schedulePageSave])

  const patchSelectedPage = React.useCallback((patch: any) => {
    if (!selectedPage) return
    patchPage(selectedPage.page_uuid, patch)
  }, [patchPage, selectedPage])

  const setBlocks = React.useCallback((pageUuid: string, blocks: LearningBlock[]) => {
    const page = pages.find((item) => item.page_uuid === pageUuid)
    if (!page) return
    patchPage(pageUuid, {
      content: {
        ...(page.content || {}),
        version: 2,
        blocks,
      },
    })
  }, [pages, patchPage])

  const insertBlock = (type: 'text' | 'image' | 'multiple_choice' | 'text_input', afterBlockId?: string | null) => {
    if (!selectedPage || selectedPage.page_type !== 'standard') return
    if ((type === 'multiple_choice' || type === 'text_input') && findQuestionBlock(selectedPage)) {
      toast.error('A page can only have one question block')
      return
    }
    if ((type === 'multiple_choice' || type === 'text_input') && selectedPage.content?.variants) {
      toast.error('Variant pages cannot contain question blocks')
      return
    }
    const blocks = getPageBlocks(selectedPage)
    const block = type === 'text'
      ? createTextBlock()
      : type === 'image'
        ? createImageBlock()
        : createQuestionBlock(type)
    const index = afterBlockId ? blocks.findIndex((item) => item.id === afterBlockId) + 1 : blocks.length
    const nextBlocks = [...blocks]
    nextBlocks.splice(index >= 0 ? index : blocks.length, 0, block)
    if (block.type === 'question') {
      patchPage(selectedPage.page_uuid, {
        content: {
          ...(selectedPage.content || {}),
          version: 2,
          blocks: nextBlocks,
        },
        ...getDefaultQuestionPagePatch(block),
      })
    } else {
      setBlocks(selectedPage.page_uuid, nextBlocks)
    }
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: block.id })
  }

  const patchBlock = React.useCallback((blockId: string, patch: Partial<LearningBlock>) => {
    if (!selectedPage || selectedPage.page_type !== 'standard') return
    setBlocks(selectedPage.page_uuid, getPageBlocks(selectedPage).map((block) => block.id === blockId ? ({ ...block, ...patch } as LearningBlock) : block))
  }, [selectedPage, setBlocks])

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return
    const removed = getPageBlocks(selectedPage).find((block) => block.id === blockId)
    const blocks = getPageBlocks(selectedPage).filter((block) => block.id !== blockId)
    if (removed?.type === 'question') {
      patchPage(selectedPage.page_uuid, {
        content: { ...(selectedPage.content || {}), version: 2, blocks },
        scoring: {},
        completion: {},
      })
    } else {
      setBlocks(selectedPage.page_uuid, blocks)
    }
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })
  }

  const duplicateBlock = (blockId: string) => {
    if (!selectedPage) return
    const blocks = getPageBlocks(selectedPage)
    const index = blocks.findIndex((block) => block.id === blockId)
    if (index < 0) return
    if (blocks[index]?.type === 'question') {
      toast.error('Question blocks cannot be duplicated on the same page')
      return
    }
    const clone = { ...cloneJson(blocks[index]), id: createBlockId() } as LearningBlock
    const nextBlocks = [...blocks]
    nextBlocks.splice(index + 1, 0, clone)
    setBlocks(selectedPage.page_uuid, nextBlocks)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: clone.id })
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    if (!selectedPage) return
    const blocks = getPageBlocks(selectedPage)
    const index = blocks.findIndex((block) => block.id === blockId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return
    const nextBlocks = [...blocks]
    const [item] = nextBlocks.splice(index, 1)
    nextBlocks.splice(nextIndex, 0, item)
    setBlocks(selectedPage.page_uuid, nextBlocks)
  }

  const addPage = async (pageType: LearningPageType = 'standard') => {
    try {
      await saveBeforeAction()
      const content = pageType === 'video'
        ? { video_url: '', heading: '', allow_scrubbing: true }
        : { version: 2, blocks: [createTextBlock({ type: 'heading', attrs: { level: 1 } })] }
      const page = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: pageType,
        title: pageType === 'video' ? 'New video page' : 'New page',
        content,
        design: {},
        scoring: {},
        completion: {},
      }, accessToken)
      setPages((current) => [...current, page])
      setSelection({ pageUuid: page.page_uuid, blockId: null })
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add page')
    }
  }

  const duplicatePage = async (page: any) => {
    try {
      await saveBeforeAction()
      const duplicate = await createLearningPage({
        activity_uuid: activity.activity_uuid,
        page_type: page.page_type,
        title: `${page.title || 'Untitled page'} copy`,
        required: page.required ?? true,
        content: cloneJson(page.content || {}),
        design: cloneJson(page.design || {}),
        scoring: cloneJson(page.scoring || {}),
        completion: cloneJson(page.completion || {}),
      }, accessToken)
      const sourceIndex = pages.findIndex((item) => item.page_uuid === page.page_uuid)
      const nextPages = [...pages]
      nextPages.splice(sourceIndex + 1, 0, duplicate)
      const ordered = withSequentialOrder(nextPages)
      setPages(ordered)
      setSelection({ pageUuid: duplicate.page_uuid, blockId: null })
      await persistPageOrder(ordered)
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to duplicate page')
    }
  }

  const removePage = async (page: any) => {
    if (!confirm(`Delete "${page.title || 'Untitled page'}"?`)) return
    try {
      await deleteLearningPage(page.page_uuid, accessToken)
      const ordered = withSequentialOrder(pages.filter((item) => item.page_uuid !== page.page_uuid))
      setPages(ordered)
      setSelection({ pageUuid: ordered[0]?.page_uuid, blockId: null })
      await persistPageOrder(ordered)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete page')
    }
  }

  const reorderPages = async (nextPages: any[]) => {
    const ordered = withSequentialOrder(nextPages)
    setPages(ordered)
    setSaveState('saving')
    try {
      await persistPageOrder(ordered)
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (error: any) {
      setSaveState('error')
      toast.error(error?.message || 'Failed to reorder pages')
    }
  }

  const persistPageOrder = async (orderedPages: any[]) => {
    await Promise.all(orderedPages.map((page, index) => updateLearningPage(page.page_uuid, { order: index + 1 }, accessToken)))
  }

  const patchActivityBasics = (patch: Record<string, any>) => {
    setActivityState((current: any) => ({ ...current, ...patch }))
    scheduleActivitySave(patch)
  }

  const patchGradingSettings = (patch: Record<string, any>) => {
    const settings = {
      ...(activityState.settings || {}),
      grading: {
        ...gradingSettings,
        ...patch,
      },
    }
    setActivityState((current: any) => ({ ...current, settings }))
    scheduleActivitySave({ settings })
  }

  const saveBeforeAction = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (activitySaveTimerRef.current) {
      clearTimeout(activitySaveTimerRef.current)
      activitySaveTimerRef.current = null
    }
    await flushPendingPages({ rethrow: true })
    await flushPendingActivity({ rethrow: true })
  }

  const goBack = async () => {
    try {
      await saveBeforeAction()
      router.back()
    } catch (error: any) {
      toast.error(error?.message || 'Save failed')
    }
  }

  const publishActivity = async () => {
    const nextPublished = !activityState.published
    setPublishing(true)
    try {
      await saveBeforeAction()
      const saved = await updateLearningActivity(activityState.activity_uuid, { published: nextPublished }, accessToken)
      setActivityState((current: any) => ({ ...current, ...(saved || {}), published: nextPublished }))
      toast.success(nextPublished ? 'Activity published' : 'Activity unpublished')
    } catch (error: any) {
      toast.error(error?.message || 'Could not update publish status')
    } finally {
      setPublishing(false)
    }
  }

  const handleMediaPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedPage || !uploadingBlockId || !accessToken) return
    const formData = new FormData()
    formData.append('media', file)
    try {
      const result = await uploadLearningPageMedia(selectedPage.page_uuid, formData, accessToken)
      patchBlock(uploadingBlockId, {
        content: {
          ...((selectedBlock as LearningImageBlock | null)?.content || {}),
          src: result.url,
          alt: file.name.replace(/\.[^.]+$/, ''),
        },
      } as Partial<LearningImageBlock>)
    } catch (error: any) {
      toast.error(error?.message || 'Image upload failed')
    } finally {
      setUploadingBlockId(null)
    }
  }

  const requestImageUpload = (blockId: string) => {
    setUploadingBlockId(blockId)
    mediaInputRef.current?.click()
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
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-gray-50 text-gray-950">
      <input ref={mediaInputRef} type="file" accept="image/*" className="hidden" onChange={handleMediaPicked} />
      <EditorHeader
        badgeName={badge.name}
        activity={activityState}
        viewMode={viewMode}
        setViewMode={setViewMode}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        publishing={publishing}
        onBack={goBack}
        onPreview={() => setPreviewOpen(true)}
        onPublish={publishActivity}
      />

      {viewMode === 'settings' ? (
        <ActivitySettingsView
          activity={activityState}
          gradingSettings={gradingSettings}
          onPatchActivity={patchActivityBasics}
          onPatchGrading={patchGradingSettings}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <PageListPanel
            pages={pages}
            selectedPage={selectedPage}
            onSelectPage={(pageUuid: string) => setSelection({ pageUuid, blockId: null })}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onRemovePage={removePage}
            onReorderPages={reorderPages}
          />
          <main className="relative min-w-0 flex-1 overflow-hidden">
            <BlockPalette
              selectedPage={selectedPage}
              selectedBlock={selectedBlock}
              onAddText={() => insertBlock('text', selection.blockId)}
              onAddImage={() => insertBlock('image', selection.blockId)}
              onAddQuestion={(kind: 'multiple_choice' | 'text_input') => insertBlock(kind, selection.blockId)}
              onDuplicate={() => selectedBlock && duplicateBlock(selectedBlock.id)}
              onDelete={() => selectedBlock && removeBlock(selectedBlock.id)}
              onMoveUp={() => selectedBlock && moveBlock(selectedBlock.id, -1)}
              onMoveDown={() => selectedBlock && moveBlock(selectedBlock.id, 1)}
            />
            <div
              ref={canvasRef}
              onPointerDown={startPan}
              className={`h-full w-full overflow-hidden ${handMode && zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{
                backgroundColor: '#f4f5f7',
                backgroundImage: 'radial-gradient(circle, rgba(15,23,42,.12) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            >
              <div className="flex h-full w-full items-center justify-center px-14 pb-36 pt-20">
                <CanvasFrame
                  page={selectedPage}
                  pages={pages}
                  selectedBlockId={selection.blockId}
                  device={device}
                  frame={frame}
                  frameShellHeight={frameShellHeight}
                  fitScale={fitScale}
                  zoom={zoom}
                  pan={pan}
                  onSelectPage={() => selectedPage && setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })}
                  onSelectBlock={(blockId: string) => selectedPage && setSelection({ pageUuid: selectedPage.page_uuid, blockId })}
                  onPatchPage={patchSelectedPage}
                  onPatchBlock={patchBlock}
                  onInsertAfter={(blockId: string) => insertBlock('text', blockId)}
                  onDuplicateBlock={duplicateBlock}
                  onRemoveBlock={removeBlock}
                  onRequestImageUpload={requestImageUpload}
                />
              </div>
            </div>
            <CanvasControls
              device={device}
              setDevice={setDevice}
              zoom={zoom}
              setZoom={setZoom}
              handMode={handMode}
              setHandMode={setHandMode}
            />
          </main>
            <InspectorPanel
              page={selectedPage}
              block={selectedBlock}
              pages={pages}
              onPatchPage={patchSelectedPage}
            onPatchBlock={patchBlock}
            onRequestImageUpload={requestImageUpload}
          />
        </div>
      )}

      {previewOpen && (
        <PreviewModal pages={pages} selectedPage={selectedPage} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}

function EditorHeader({ badgeName, activity, viewMode, setViewMode, saveState, lastSavedAt, publishing, onBack, onPreview, onPublish }: any) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100" title="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{activity.title || 'Untitled activity'}</p>
          <p className="truncate text-xs text-gray-500">{badgeName}</p>
        </div>
      </div>
      <div className="flex h-full items-center gap-6">
        <TopModeButton active={viewMode === 'editor'} onClick={() => setViewMode('editor')} label="Editor" />
        <TopModeButton active={viewMode === 'settings'} onClick={() => setViewMode('settings')} label="Settings" />
      </div>
      <div className="flex items-center gap-3">
        <SaveStateLabel state={saveState} lastSavedAt={lastSavedAt} />
        <button onClick={onPreview} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
          <Eye size={16} />
          Preview
        </button>
        <button
          onClick={onPublish}
          disabled={publishing}
          className={`inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-bold transition disabled:opacity-70 ${
            activity.published
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              : 'border-gray-950 bg-gray-950 text-white hover:bg-black'
          }`}
        >
          {publishing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {activity.published ? 'Published' : 'Publish'}
        </button>
      </div>
    </div>
  )
}

function BlockPalette({ selectedPage, selectedBlock, onAddText, onAddImage, onAddQuestion, onDuplicate, onDelete, onMoveUp, onMoveDown }: any) {
  const canEditBlocks = selectedPage?.page_type === 'standard'
  const canAddQuestion = canEditBlocks && !findQuestionBlock(selectedPage) && !selectedPage?.content?.variants
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2">
      <div className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-gray-200 bg-white/95 px-2 shadow-sm backdrop-blur">
        <button disabled={!canEditBlocks} onClick={onAddText} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40">
          <FileText size={15} />
          Text
        </button>
        <button disabled={!canEditBlocks} onClick={onAddImage} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40">
          <ImageIcon size={15} />
          Image
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button disabled={!canAddQuestion} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:opacity-50">
              <ListChecks size={15} />
              Question
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => onAddQuestion('multiple_choice')}>
              <ListChecks size={16} className="mr-2" />
              Multiple choice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddQuestion('text_input')}>
              <FileText size={16} className="mr-2" />
              Text input
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {selectedBlock && (
        <div className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-gray-200 bg-white/95 px-2 shadow-sm backdrop-blur">
          <IconButton title="Move up" onClick={onMoveUp}><ChevronDown size={15} className="rotate-180" /></IconButton>
          <IconButton title="Move down" onClick={onMoveDown}><ChevronDown size={15} /></IconButton>
          <IconButton title="Duplicate" onClick={onDuplicate}><Copy size={15} /></IconButton>
          <IconButton title="Delete" onClick={onDelete}><Trash2 size={15} /></IconButton>
        </div>
      )}
    </div>
  )
}

function CanvasFrame({
  page,
  pages,
  selectedBlockId,
  device,
  frame,
  frameShellHeight,
  fitScale,
  zoom,
  pan,
  onSelectPage,
  onSelectBlock,
  onPatchPage,
  onPatchBlock,
  onInsertAfter,
  onDuplicateBlock,
  onRemoveBlock,
  onRequestImageUpload,
}: any) {
  if (!page) {
    return (
      <div className="flex h-[420px] w-[390px] items-center justify-center rounded-xl bg-white text-sm text-gray-400 shadow-xl">
        No page selected
      </div>
    )
  }
  return (
    <div
      data-learning-editor-frame
      style={{
        width: frame.width,
        height: frameShellHeight,
        minWidth: frame.width,
        minHeight: frameShellHeight,
        transform: `translate(${zoom > 1 ? pan.x : 0}px, ${zoom > 1 ? pan.y : 0}px) scale(${fitScale * zoom})`,
        transformOrigin: 'center center',
      }}
      className={`${device === 'mobile' ? 'rounded-[2rem] bg-black p-[10px]' : 'rounded-xl bg-white'} relative shrink-0 shadow-2xl ring-1 ring-black/10`}
    >
      <div
        className={`${device === 'mobile' ? 'rounded-[1.45rem]' : 'rounded-xl'} h-full overflow-hidden bg-[var(--org-page-background)]`}
        style={device === 'mobile' ? { height: frame.height, marginTop: MOBILE_FRAME_CAP - 10 } : { height: frame.height }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onSelectPage()
        }}
      >
        {page.page_type === 'video' ? (
          <VideoCanvasPage page={page} onPatchPage={onPatchPage} />
        ) : (
          <StandardCanvasPage
            page={page}
            pages={pages}
            selectedBlockId={selectedBlockId}
            onSelectPage={onSelectPage}
            onSelectBlock={onSelectBlock}
            onPatchPage={onPatchPage}
            onPatchBlock={onPatchBlock}
            onInsertAfter={onInsertAfter}
            onDuplicateBlock={onDuplicateBlock}
            onRemoveBlock={onRemoveBlock}
            onRequestImageUpload={onRequestImageUpload}
          />
        )}
      </div>
    </div>
  )
}

function StandardCanvasPage({ page, selectedBlockId, onSelectPage, onSelectBlock, onPatchPage, onPatchBlock, onInsertAfter, onDuplicateBlock, onRemoveBlock, onRequestImageUpload }: any) {
  const blocks = getPageBlocks(page)
  return (
    <div className="h-full overflow-y-auto px-7 py-10" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onSelectPage()
    }}>
      <div className="mx-auto flex min-h-full w-full max-w-[620px] flex-col justify-center py-8">
        {blocks.length ? (
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <React.Fragment key={block.id}>
                <CanvasBlock
                  block={block}
                  page={page}
                  selected={block.id === selectedBlockId}
                  onSelect={() => onSelectBlock(block.id)}
                  onPatch={(patch) => onPatchBlock(block.id, patch)}
                  onPatchPage={onPatchPage}
                  onDuplicate={() => onDuplicateBlock(block.id)}
                  onRemove={() => onRemoveBlock(block.id)}
                  onRequestImageUpload={() => onRequestImageUpload(block.id)}
                />
                {index < blocks.length - 1 && (
                  <InlineInsertButton onClick={() => onInsertAfter(block.id)} />
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white/70 p-8 text-center">
            <Layers3 size={26} className="text-gray-400" />
            <p className="text-sm font-bold text-gray-700">Start with a text or image block.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CanvasBlock({ block, page, selected, onSelect, onPatch, onPatchPage, onDuplicate, onRemove, onRequestImageUpload }: {
  block: LearningBlock
  page: any
  selected: boolean
  onSelect: () => void
  onPatch: (patch: any) => void
  onPatchPage: (patch: any) => void
  onDuplicate: () => void
  onRemove: () => void
  onRequestImageUpload: () => void
}) {
  const style = getBlockStyle(block)
  return (
    <section
      className={`group relative rounded-md transition ${selected ? 'outline outline-2 outline-offset-4 outline-[var(--org-primary-color)]' : 'hover:outline hover:outline-1 hover:outline-offset-4 hover:outline-gray-300'}`}
      style={style}
      onMouseDown={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      {selected && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 -translate-y-[calc(100%+10px)] rounded-md bg-[var(--org-primary-color)] px-2 py-1 text-[11px] font-bold uppercase text-white shadow-sm">
          {block.type}
        </div>
      )}
      {selected && (
        <div className="absolute right-0 top-0 z-20 flex -translate-y-[calc(100%+10px)] items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-lg shadow-gray-950/10">
          <IconButton title="Duplicate" onClick={onDuplicate}><Copy size={14} /></IconButton>
          <IconButton title="Delete" onClick={onRemove}><Trash2 size={14} /></IconButton>
        </div>
      )}
      {block.type === 'text' && (
        <TextBlockEditor
          block={block}
          selected={selected}
          onPatch={onPatch}
        />
      )}
      {block.type === 'image' && (
        <ImageBlockEditor
          block={block}
          onPatch={onPatch}
          onRequestImageUpload={onRequestImageUpload}
        />
      )}
      {block.type === 'question' && <QuestionBlockEditor block={block} page={page} onPatch={onPatch} onPatchPage={onPatchPage} />}
    </section>
  )
}

function TextBlockEditor({ block, selected, onPatch }: { block: LearningTextBlock; selected: boolean; onPatch: (patch: Partial<LearningTextBlock>) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: 'Type here...',
        showOnlyWhenEditable: false,
      }),
      LearningTextAlign,
    ],
    content: { type: 'doc', content: [block.content?.node || EMPTY_PARAGRAPH] },
    editorProps: {
      attributes: {
        class: 'learning-block-text prose prose-sm max-w-none focus:outline-none',
      },
    },
    onFocus: () => null,
    onUpdate: ({ editor }) => {
      const node = editor.getJSON().content?.[0] || EMPTY_PARAGRAPH
      onPatch({ content: { ...(block.content || {}), node } })
    },
  }, [block.id])

  React.useEffect(() => {
    if (!editor || editor.isFocused) return
    const next = { type: 'doc', content: [block.content?.node || EMPTY_PARAGRAPH] }
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next)
    }
  }, [block.content?.node, editor])

  return (
    <div className="rounded-lg px-2 py-1">
      {selected && editor && <FloatingTextToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function FloatingTextToolbar({ editor }: { editor: any }) {
  return (
    <div className="absolute left-1/2 top-0 z-30 flex -translate-x-1/2 -translate-y-[calc(100%+12px)] items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
      <IconButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></IconButton>
      <IconButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></IconButton>
      <IconButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></IconButton>
      <IconButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></IconButton>
      <IconButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></IconButton>
      <span className="mx-1 h-5 w-px bg-gray-200" />
      <IconButton title="Left" active={getEditorAlign(editor) === 'left'} onClick={() => setEditorAlign(editor, 'left')}><AlignLeft size={14} /></IconButton>
      <IconButton title="Center" active={getEditorAlign(editor) === 'center'} onClick={() => setEditorAlign(editor, 'center')}><AlignCenter size={14} /></IconButton>
      <IconButton title="Right" active={getEditorAlign(editor) === 'right'} onClick={() => setEditorAlign(editor, 'right')}><AlignRight size={14} /></IconButton>
    </div>
  )
}

function ImageBlockEditor({ block, onPatch, onRequestImageUpload }: { block: LearningImageBlock; onPatch: (patch: Partial<LearningImageBlock>) => void; onRequestImageUpload: () => void }) {
  const src = block.content?.src || ''
  const height = Math.max(80, Number(block.design?.height) || 220)
  return (
    <figure className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100" style={{ height }}>
      {src ? (
        <img src={src} alt={block.content?.alt || ''} className="h-full w-full object-cover" />
      ) : (
        <button onClick={onRequestImageUpload} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:bg-gray-50">
          <Upload size={22} />
          Add image
        </button>
      )}
      {src && (
        <button onClick={onRequestImageUpload} className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-white">
          Replace
        </button>
      )}
      <div
        className="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize bg-transparent"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const startY = event.clientY
          const startHeight = height
          const onMove = (moveEvent: PointerEvent) => {
            onPatch({ design: { ...(block.design || {}), height: Math.max(80, Math.min(620, startHeight + moveEvent.clientY - startY)) } })
          }
          const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }}
      />
    </figure>
  )
}

function QuestionBlockEditor({ block, page, onPatch, onPatchPage }: { block: LearningQuestionBlock; page: any; onPatch: (patch: Partial<LearningQuestionBlock>) => void; onPatchPage: (patch: any) => void }) {
  const content = block.content || {}
  const patchContent = (patch: any) => onPatch({ content: { ...content, ...patch } })

  if (block.kind === 'multiple_choice') {
    const options = normalizeQuestionOptions(content.options)
    const updateOption = (id: string, patch: any) => {
      patchContent({ options: options.map((option) => option.id === id ? { ...option, ...patch } : option) })
    }
    const addOption = () => {
      patchContent({ options: [...options, { id: createOptionId(), text: `Option ${options.length + 1}` }] })
    }
    const removeOption = (id: string) => {
      if (options.length <= 2) return
      const nextOptions = options.filter((option) => option.id !== id)
      const correctIds = new Set<string>(page.scoring?.correct_option_ids || page.scoring?.correctOptionIds || [])
      const minSelections = Math.max(1, Number(page.completion?.min_selections ?? 1))
      const maxSelections = Math.max(minSelections, Number(page.completion?.max_selections ?? 1))
      patchContent({ options: nextOptions })
      onPatchPage({
        scoring: {
          ...(page.scoring || {}),
          correct_option_ids: Array.from(correctIds).filter((item) => item !== id),
        },
        completion: {
          ...(page.completion || {}),
          min_selections: Math.min(minSelections, nextOptions.length),
          max_selections: Math.min(maxSelections, nextOptions.length),
        },
      })
    }
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <ListChecks size={16} />
            Multiple choice
          </div>
          <button onClick={addOption} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100">
            <Plus size={14} />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold">{String.fromCharCode(65 + index)}</span>
              <input
                value={option.text || ''}
                onChange={(event) => updateOption(option.id, { text: event.target.value })}
                placeholder={`Option ${index + 1}`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button disabled={options.length <= 2} onClick={() => removeOption(option.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const inputs = normalizeQuestionInputs(content.inputs)
  const updateInput = (id: string, patch: any) => {
    patchContent({ inputs: inputs.map((input) => input.id === id ? { ...input, ...patch } : input) })
  }
  const addInput = () => {
    const id = createInputId()
    patchContent({ inputs: [...inputs, { id, section_id: id, label: `Response ${inputs.length + 1}`, placeholder: '', variant: 'short_answer', width: 'full', height: 160 }] })
    onPatchPage({
      completion: {
        ...(page.completion || {}),
        inputs: {
          ...(page.completion?.inputs || {}),
          [id]: { required: true, min_words: 1, max_words: 0, points: 1 },
        },
      },
    })
  }
  const removeInput = (id: string) => {
    if (inputs.length <= 1) return
    const nextRules = { ...(page.completion?.inputs || {}) }
    delete nextRules[id]
    patchContent({ inputs: inputs.filter((input) => input.id !== id) })
    onPatchPage({
      completion: {
        ...(page.completion || {}),
        inputs: nextRules,
      },
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <FileText size={16} />
          Text input
        </div>
        <button onClick={addInput} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100">
          <Plus size={14} />
          Add
        </button>
      </div>
      <div className="space-y-3">
        {inputs.map((input) => {
          const height = Math.max(48, Number(input.height) || 160)
          const singleLine = input.variant === 'single_line' || height <= 56
          return (
            <div key={input.id} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={input.label || ''}
                  onChange={(event) => updateInput(input.id, { label: event.target.value })}
                  placeholder="Input label"
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                />
                <button disabled={inputs.length <= 1} onClick={() => removeInput(input.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
              </div>
              {singleLine ? (
                <input
                  value={input.placeholder || ''}
                  onChange={(event) => updateInput(input.id, { placeholder: event.target.value })}
                  placeholder="Placeholder"
                  className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
              ) : (
                <textarea
                  value={input.placeholder || ''}
                  onChange={(event) => updateInput(input.id, { placeholder: event.target.value })}
                  placeholder="Placeholder"
                  style={{ height }}
                  className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InlineInsertButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="group flex h-4 w-full items-center justify-center"
    >
      <span className="h-px flex-1 bg-transparent group-hover:bg-[var(--org-primary-color)]" />
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-transparent text-transparent group-hover:border-[var(--org-primary-color)] group-hover:bg-white group-hover:text-[var(--org-primary-color)]">
        <Plus size={12} />
      </span>
      <span className="h-px flex-1 bg-transparent group-hover:bg-[var(--org-primary-color)]" />
    </button>
  )
}

function VideoCanvasPage({ page, onPatchPage }: any) {
  const videoUrl = page.content?.video_url || ''
  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex h-14 shrink-0 items-center gap-4 px-5">
        <X size={18} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-1/3 rounded-full bg-[var(--org-primary-color)]" />
        </div>
        <span className="text-xs font-bold text-white/70">Video</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex aspect-video w-full max-w-3xl items-center justify-center rounded-xl border border-white/10 bg-white/5 text-center">
          {videoUrl ? (
            <div className="px-6">
              <Video size={42} className="mx-auto mb-3 text-white/60" />
              <p className="break-all text-sm font-bold text-white/80">{videoUrl}</p>
            </div>
          ) : (
            <p className="text-sm font-bold text-white/50">Set a video URL in the inspector</p>
          )}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-6">
        <input
          value={videoUrl}
          onChange={(event) => onPatchPage({ content: { ...(page.content || {}), video_url: event.target.value } })}
          placeholder="Video URL"
          className="h-10 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
        />
      </div>
    </div>
  )
}

function CanvasControls({ device, setDevice, zoom, setZoom, handMode, setHandMode }: any) {
  return (
    <>
      <div className="absolute bottom-20 left-1/2 grid w-52 -translate-x-1/2 grid-cols-2 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <DeviceModeButton active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={<Smartphone size={15} />} label="Mobile" />
        <DeviceModeButton active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={<Monitor size={15} />} label="Desktop" />
      </div>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <button onClick={() => setHandMode(!handMode)} className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm ${handMode ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700'}`} title="Pan">
          {handMode ? <Hand size={17} /> : <MousePointer2 size={17} />}
        </button>
        <div className="flex h-10 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 shadow-sm">
          <IconButton title="Zoom out" onClick={() => setZoom((current: number) => Math.max(1, Number((current - 0.1).toFixed(2))))}><ZoomOut size={15} /></IconButton>
          <button onClick={() => setZoom(1)} className="h-8 min-w-16 rounded-lg px-2 text-xs font-bold text-gray-700 hover:bg-gray-100">{Math.round(zoom * 100)}%</button>
          <IconButton title="Zoom in" onClick={() => setZoom((current: number) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}><ZoomIn size={15} /></IconButton>
        </div>
      </div>
    </>
  )
}

function InspectorPanel({ page, block, pages, onPatchPage, onPatchBlock, onRequestImageUpload }: any) {
  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[11px] font-bold uppercase text-gray-500">{block ? block.type : page?.page_type || 'Page'}</p>
        <p className="mt-1 truncate text-base font-bold">{block ? blockLabel(block) : page?.title || 'Untitled page'}</p>
      </div>
      {block ? (
        <BlockInspector block={block} page={page} onPatchBlock={onPatchBlock} onPatchPage={onPatchPage} onRequestImageUpload={onRequestImageUpload} />
      ) : (
        <PageInspector page={page} pages={pages} onPatchPage={onPatchPage} />
      )}
    </aside>
  )
}

function PageInspector({ page, pages, onPatchPage }: any) {
  if (!page) return null
  const hasVariants = Boolean(page.content?.variants)
  return (
    <div className="space-y-6 p-5">
      <InspectorSection label="Page">
        <TextField label="Title" value={page.title || ''} onChange={(value) => onPatchPage({ title: value })} />
        <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="font-bold text-gray-700">Required</span>
          <input type="checkbox" checked={page.required !== false} onChange={(event) => onPatchPage({ required: event.target.checked })} />
        </label>
      </InspectorSection>
      {page.page_type === 'video' && (
        <InspectorSection label="Video">
          <TextField label="URL" value={page.content?.video_url || ''} onChange={(value) => onPatchPage({ content: { ...(page.content || {}), video_url: value } })} />
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="font-bold text-gray-700">Allow scrubbing</span>
            <input type="checkbox" checked={page.content?.allow_scrubbing !== false} onChange={(event) => onPatchPage({ content: { ...(page.content || {}), allow_scrubbing: event.target.checked } })} />
          </label>
        </InspectorSection>
      )}
      {page.page_type === 'standard' && (
        <InspectorSection label="Variants">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="font-bold text-gray-700">Variant page</span>
            <input
              type="checkbox"
              checked={hasVariants}
              disabled={Boolean(findQuestionBlock(page))}
              onChange={(event) => {
                if (event.target.checked) {
                  const source = findPriorQuestionPage(pages, page)
                  onPatchPage({
                    content: {
                      ...(page.content || {}),
                      variants: {
                        source: source ? { page_uuid: source.page_uuid, block_id: findQuestionBlock(source)?.id } : {},
                        overrides: {},
                      },
                    },
                  })
                } else {
                  const { variants: _variants, ...content } = page.content || {}
                  onPatchPage({ content })
                }
              }}
            />
          </label>
          {findQuestionBlock(page) && <p className="text-xs font-medium text-amber-700">Pages with question blocks cannot also have variants.</p>}
          {hasVariants && (
            <select
              value={page.content?.variants?.source?.page_uuid || ''}
              onChange={(event) => {
                const source = pages.find((item: any) => item.page_uuid === event.target.value)
                onPatchPage({
                  content: {
                    ...(page.content || {}),
                    variants: {
                      ...(page.content?.variants || {}),
                      source: source ? { page_uuid: source.page_uuid, block_id: findQuestionBlock(source)?.id } : {},
                    },
                  },
                })
              }}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
            >
              <option value="">Choose source</option>
              {pages.filter((item: any) => item.order < page.order && findQuestionBlock(item)?.kind === 'multiple_choice').map((item: any) => (
                <option key={item.page_uuid} value={item.page_uuid}>{item.title || 'Untitled question'}</option>
              ))}
            </select>
          )}
        </InspectorSection>
      )}
    </div>
  )
}

function BlockInspector({ block, page, onPatchBlock, onPatchPage, onRequestImageUpload }: any) {
  const design = block.design || {}
  const patchDesign = (patch: any) => onPatchBlock(block.id, { design: { ...design, ...patch } })
  return (
    <div className="space-y-6 p-5">
      <InspectorSection label="Layout">
        <div>
          <FieldLabel>Width</FieldLabel>
          <input
            type="range"
            min={25}
            max={100}
            value={Number(design.width) || 100}
            onChange={(event) => patchDesign({ width: Number(event.target.value) })}
            className="w-full accent-[var(--org-primary-color)]"
          />
          <div className="mt-1 text-xs font-bold text-gray-500">{Number(design.width) || 100}%</div>
        </div>
        <SegmentedControl
          label="Align"
          value={design.align || 'left'}
          options={[
            { value: 'left', icon: <AlignLeft size={15} /> },
            { value: 'center', icon: <AlignCenter size={15} /> },
            { value: 'right', icon: <AlignRight size={15} /> },
          ]}
          onChange={(value) => patchDesign({ align: value })}
        />
      </InspectorSection>
      {block.type === 'image' && (
        <InspectorSection label="Image">
          <button onClick={() => onRequestImageUpload(block.id)} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">
            <Upload size={16} />
            {block.content?.src ? 'Replace image' : 'Upload image'}
          </button>
          <TextField label="Alt text" value={block.content?.alt || ''} onChange={(value) => onPatchBlock(block.id, { content: { ...(block.content || {}), alt: value } })} />
          <div>
            <FieldLabel>Height</FieldLabel>
            <input
              type="number"
              value={Number(design.height) || 220}
              onChange={(event) => patchDesign({ height: Number(event.target.value) })}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
            />
          </div>
        </InspectorSection>
      )}
      {block.type === 'question' && (
        <QuestionInspector block={block} page={page} onPatchBlock={onPatchBlock} onPatchPage={onPatchPage} />
      )}
    </div>
  )
}

function QuestionInspector({ block, page, onPatchBlock, onPatchPage }: any) {
  const content = block.content || {}
  const scoring = page.scoring || {}
  const completion = page.completion || {}
  const patchContent = (patch: any) => onPatchBlock(block.id, { content: { ...content, ...patch } })
  const patchScoring = (patch: any) => onPatchPage({ scoring: { ...scoring, ...patch } })
  const patchCompletion = (patch: any) => onPatchPage({ completion: { ...completion, ...patch } })

  if (block.kind === 'multiple_choice') {
    const options = normalizeQuestionOptions(content.options)
    const correctIds = new Set<string>(scoring.correct_option_ids || scoring.correctOptionIds || [])
    const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
    const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 1))
    const updateOption = (id: string, patch: any) => patchContent({ options: options.map((option) => option.id === id ? { ...option, ...patch } : option) })
    const addOption = () => patchContent({ options: [...options, { id: createOptionId(), text: `Option ${options.length + 1}` }] })
    const removeOption = (id: string) => {
      if (options.length <= 2) return
      const nextOptions = options.filter((option) => option.id !== id)
      patchContent({ options: nextOptions })
      patchScoring({ correct_option_ids: Array.from(correctIds).filter((item) => item !== id) })
      patchCompletion({
        min_selections: Math.min(minSelections, nextOptions.length),
        max_selections: Math.min(maxSelections, nextOptions.length),
      })
    }
    const toggleCorrect = (id: string) => {
      const next = new Set(correctIds)
      if (next.has(id)) next.delete(id)
      else {
        if (maxSelections <= 1) next.clear()
        next.add(id)
      }
      patchScoring({ mode: 'points', score_policy: 'exact_match', correct_option_ids: Array.from(next) })
    }

    return (
      <>
        <InspectorSection label="Answers">
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.id} className="grid grid-cols-[2rem_1fr_2rem_2rem] items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold">{String.fromCharCode(65 + index)}</span>
                <input
                  value={option.text || ''}
                  onChange={(event) => updateOption(option.id, { text: event.target.value })}
                  className="h-9 min-w-0 rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
                <button
                  onClick={() => toggleCorrect(option.id)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${correctIds.has(option.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                  title="Correct answer"
                >
                  <Check size={15} />
                </button>
                <button disabled={options.length <= 2} onClick={() => removeOption(option.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addOption} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">
            <Plus size={15} />
            Add answer
          </button>
        </InspectorSection>
        <InspectorSection label="Scoring">
          <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ mode: 'points', points: Number(value), score_policy: 'exact_match' })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Min" type="number" value={String(minSelections)} onChange={(value) => patchCompletion({ min_selections: Math.max(1, Number(value)) })} />
            <TextField label="Max" type="number" value={String(maxSelections)} onChange={(value) => patchCompletion({ max_selections: Math.max(1, Number(value)) })} />
          </div>
        </InspectorSection>
      </>
    )
  }

  const inputs = normalizeQuestionInputs(content.inputs)
  const rules = completion.inputs || {}
  const patchInput = (id: string, patch: any) => patchContent({ inputs: inputs.map((input) => input.id === id ? { ...input, ...patch } : input) })
  const addInput = () => {
    const id = createInputId()
    patchContent({ inputs: [...inputs, { id, section_id: id, label: `Response ${inputs.length + 1}`, placeholder: '', variant: 'short_answer', width: 'full', height: 160 }] })
    patchCompletion({ inputs: { ...rules, [id]: { required: true, min_words: 1, max_words: 0, points: 1 } } })
  }
  const removeInput = (id: string) => {
    if (inputs.length <= 1) return
    const nextRules = { ...rules }
    delete nextRules[id]
    patchContent({ inputs: inputs.filter((input) => input.id !== id) })
    patchCompletion({ inputs: nextRules })
  }
  const patchInputRule = (id: string, patch: any) => patchCompletion({ inputs: { ...rules, [id]: { ...(rules[id] || {}), ...patch } } })

  return (
    <>
      <InspectorSection label="Inputs">
        <div className="space-y-3">
          {inputs.map((input) => {
            const rule = rules[input.id] || {}
            return (
              <div key={input.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={input.label || ''}
                    onChange={(event) => patchInput(input.id, { label: event.target.value })}
                    placeholder="Label"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-[var(--org-primary-color)]"
                  />
                  <button disabled={inputs.length <= 1} onClick={() => removeInput(input.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30">
                    <Trash2 size={15} />
                  </button>
                </div>
                <input
                  value={input.placeholder || ''}
                  onChange={(event) => patchInput(input.id, { placeholder: event.target.value })}
                  placeholder="Placeholder"
                  className="h-9 w-full rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input type="checkbox" checked={rule.required !== false} onChange={(event) => patchInputRule(input.id, { required: event.target.checked })} />
                    Required
                  </label>
                  <select
                    value={input.variant || 'short_answer'}
                    onChange={(event) => patchInput(input.id, { variant: event.target.value, height: event.target.value === 'single_line' ? 48 : Number(input.height) || 160 })}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs font-bold outline-none focus:border-[var(--org-primary-color)]"
                  >
                    <option value="single_line">Single</option>
                    <option value="short_answer">Long</option>
                  </select>
                  <input type="number" value={Number(rule.min_words || 0)} onChange={(event) => patchInputRule(input.id, { min_words: Number(event.target.value) })} className="h-8 rounded-lg border border-gray-200 px-2 text-xs outline-none" aria-label="Minimum words" />
                  <input type="number" value={Number(rule.max_words || 0)} onChange={(event) => patchInputRule(input.id, { max_words: Number(event.target.value) })} className="h-8 rounded-lg border border-gray-200 px-2 text-xs outline-none" aria-label="Maximum words" />
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={addInput} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">
          <Plus size={15} />
          Add input
        </button>
      </InspectorSection>
      <InspectorSection label="Scoring">
        <SegmentedControl
          label="Mode"
          value={scoring.mode || 'completion'}
          options={[
            { value: 'completion', label: 'Completion' },
            { value: 'manual', label: 'Manual' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(value) => patchScoring({ mode: value })}
        />
        <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ points: Number(value) })} />
      </InspectorSection>
    </>
  )
}

function ActivitySettingsView({ activity, gradingSettings, onPatchActivity, onPatchGrading }: any) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto max-w-3xl space-y-8 px-8 py-8">
        <section>
          <h2 className="text-lg font-bold">Activity settings</h2>
          <div className="mt-5 space-y-4">
            <TextField label="Title" value={activity.title || ''} onChange={(value) => onPatchActivity({ title: value })} />
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={activity.description || ''}
                onChange={(event) => onPatchActivity({ description: event.target.value })}
                className="min-h-28 w-full resize-y rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
              />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <span>
                <span className="block text-sm font-bold text-gray-800">Required activity</span>
                <span className="block text-xs text-gray-500">Learners must complete it to finish the badge path.</span>
              </span>
              <input type="checkbox" checked={activity.required !== false} onChange={(event) => onPatchActivity({ required: event.target.checked })} />
            </label>
          </div>
        </section>
        <section>
          <h2 className="text-lg font-bold">Grading</h2>
          <div className="mt-5 space-y-4">
            <SegmentedControl
              label="Mode"
              value={gradingSettings.mode}
              options={[
                { value: 'completion', label: 'Completion' },
                { value: 'pass_fail', label: 'Pass/fail' },
              ]}
              onChange={(value) => onPatchGrading({ mode: value as ActivityGradingMode })}
            />
            {gradingSettings.mode === 'pass_fail' && (
              <>
                <TextField label="Passing score" type="number" value={String(gradingSettings.passing_score ?? 1)} onChange={(value) => onPatchGrading({ passing_score: Number(value) })} />
                <TextField label="Success message" value={gradingSettings.success_message || ''} onChange={(value) => onPatchGrading({ success_message: value })} />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function PreviewModal({ pages, selectedPage, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
      <div className="flex h-full max-h-[820px] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
          <p className="text-sm font-bold">Preview</p>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100 p-4">
          <div className="mx-auto h-full overflow-hidden rounded-[1.5rem] bg-[var(--org-page-background)] shadow-xl">
            <StandardCanvasPage
              page={selectedPage || pages[0]}
              selectedBlockId={null}
              onSelectPage={() => null}
              onSelectBlock={() => null}
              onPatchBlock={() => null}
              onInsertAfter={() => null}
              onDuplicateBlock={() => null}
              onRemoveBlock={() => null}
              onRequestImageUpload={() => null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const LearningTextAlign = Extension.create({
  name: 'learningTextAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.textAlign || null,
            renderHTML: (attributes: any) => {
              if (!attributes.textAlign || attributes.textAlign === 'left') return {}
              return { style: `text-align: ${attributes.textAlign}` }
            },
          },
        },
      },
    ]
  },
})

function getEditorAlign(editor: any) {
  const attrs = editor?.isActive?.('heading') ? editor.getAttributes('heading') : editor?.getAttributes?.('paragraph')
  return attrs?.textAlign || 'left'
}

function setEditorAlign(editor: any, align: 'left' | 'center' | 'right') {
  const attrs = align === 'left' ? { textAlign: null } : { textAlign: align }
  if (editor?.isActive?.('heading')) editor.chain().focus().updateAttributes('heading', attrs).run()
  else editor?.chain?.().focus().updateAttributes('paragraph', attrs).run()
}
