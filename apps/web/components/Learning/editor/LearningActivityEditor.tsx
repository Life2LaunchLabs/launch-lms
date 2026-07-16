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
  Columns2,
  Copy,
  Eye,
  FileText,
  GitBranch,
  GripVertical,
  Hand,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Layers3,
  ListChecks,
  Lock,
  Loader2,
  Monitor,
  MousePointer2,
  MousePointerClick,
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
  convertLearningPageVariants,
  createLearningVariable,
  deleteLearningVariable,
  deleteLearningPage,
  getLearningVariables,
  updateLearningVariable,
  updateLearningActivity,
  updateLearningPage,
  uploadLearningPageMedia,
} from '@services/learning/learning'
import {
  findQuestionBlock,
  findQuestionBlocks,
  getBlockCompletion,
  getBlockScoring,
  type LearningBlock,
  type LearningImageBlock,
  type LearningPageType,
  type LearningQuestionBlock,
  type LearningTextBlock,
} from '@components/Learning/schema'
import {
  LearningActivitySurface,
  LearningPageContent,
} from '@components/Learning/LearningBadgeViews'
import type { ActivityGradingMode, DeviceMode, EditorViewMode, SaveState, Selection } from './types'
import {
  EMPTY_PARAGRAPH,
  blockLabel,
  cloneBlocksWithFreshIds,
  cloneJson,
  createBlockId,
  createImageBlock,
  createButtonBlock,
  createInputId,
  createOptionId,
  createQuestionBlock,
  createTextBlock,
  getActivityGradingSettings,
  getBlockStyle,
  getEditorBlocks,
  getPageBlocks,
  getTextBlockNodes,
  getEnabledVariantKeys,
  getVariantKeyList,
  getVariantSource,
  getVariantSourceOptions,
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
import { VariablePathPicker } from './VariablePathPicker'
import VisualFlowEditor, { createLinearFlow } from './VisualFlowEditor'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { JourneyCardView, type JourneyEntry } from '@components/Pages/Portfolio/Journey'

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
  const [variantKey, setVariantKey] = React.useState('default')
  const [learningVariables, setLearningVariables] = React.useState<any[]>([])
  const [variableDraftKey, setVariableDraftKey] = React.useState('')
  const [device, setDevice] = React.useState<DeviceMode>('mobile')
  const [leftWidth, setLeftWidth] = React.useState(288)
  const [rightWidth, setRightWidth] = React.useState(340)
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = React.useState(1)
  const [handMode, setHandMode] = React.useState(false)
  const [saveState, setSaveState] = React.useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [publishing, setPublishing] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [uploadingBlockId, setUploadingBlockId] = React.useState<string | null>(null)
  const [hoveredBlockId, setHoveredBlockId] = React.useState<string | null>(null)
  const [draggingBlockId, setDraggingBlockId] = React.useState<string | null>(null)
  const [activeTextEditor, setActiveTextEditor] = React.useState<any>(null)
  const blockElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const mediaInputRef = React.useRef<HTMLInputElement | null>(null)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const activitySaveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const pendingPagePatchesRef = React.useRef<Record<string, any>>({})
  const pendingActivityPatchRef = React.useRef<Record<string, any>>({})

  const selectedPage = pages.find((page) => page.page_uuid === selection.pageUuid) || pages[0]
  const selectedBlock = selectedPage ? getEditorBlocks(selectedPage, variantKey).find((block) => block.id === selection.blockId) || null : null
  const frame = DEVICE_FRAMES[device]
  const frameShellHeight = device === 'mobile' ? frame.height + MOBILE_FRAME_CAP * 2 : frame.height
  const gradingSettings = getActivityGradingSettings(activityState)

  React.useEffect(() => {
    setVariantKey('default')
  }, [selection.pageUuid])

  React.useEffect(() => {
    if (!badge?.org_id || !accessToken) return
    getLearningVariables(badge.org_id, accessToken)
      .then((items) => setLearningVariables(Array.isArray(items) ? items : []))
      .catch(() => setLearningVariables([]))
  }, [accessToken, badge?.org_id])

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
    if (page.content?.variants && variantKey !== 'default') {
      patchPage(pageUuid, {
        content: {
          ...(page.content || {}),
          variants: {
            ...(page.content?.variants || {}),
            overrides: {
              ...(page.content?.variants?.overrides || {}),
              [variantKey]: { blocks },
            },
          },
        },
      })
      return
    }
    patchPage(pageUuid, {
      content: {
        ...(page.content || {}),
        version: 2,
        blocks,
      },
    })
  }, [pages, patchPage, variantKey])

  const insertBlock = (type: 'text' | 'image' | 'button' | 'multiple_choice' | 'categorized_multi_select' | 'text_input' | 'image_upload', afterBlockId?: string | null) => {
    if (!selectedPage || selectedPage.page_type !== 'standard') return
    if ((type === 'multiple_choice' || type === 'categorized_multi_select' || type === 'text_input' || type === 'image_upload') && selectedPage.content?.variants) {
      toast.error('Variant pages cannot contain question blocks')
      return
    }
    const blocks = getEditorBlocks(selectedPage, variantKey)
    const block = type === 'text'
      ? createTextBlock()
      : type === 'image'
        ? createImageBlock()
        : type === 'button'
          ? createButtonBlock()
        : createQuestionBlock(type)
    const index = afterBlockId ? blocks.findIndex((item) => item.id === afterBlockId) + 1 : blocks.length
    const nextBlocks = [...blocks]
    nextBlocks.splice(index >= 0 ? index : blocks.length, 0, block)
    setBlocks(selectedPage.page_uuid, nextBlocks)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: block.id })
  }

  const patchBlock = React.useCallback((blockId: string, patch: Partial<LearningBlock>) => {
    if (!selectedPage || selectedPage.page_type !== 'standard') return
    setBlocks(selectedPage.page_uuid, getEditorBlocks(selectedPage, variantKey).map((block) => block.id === blockId && !block.system?.locked ? ({ ...block, ...patch } as LearningBlock) : block))
  }, [selectedPage, setBlocks, variantKey])

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return
    if (getEditorBlocks(selectedPage, variantKey).find((block) => block.id === blockId)?.system?.locked) return
    const blocks = getEditorBlocks(selectedPage, variantKey).filter((block) => block.id !== blockId)
    setBlocks(selectedPage.page_uuid, blocks)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })
  }

  const duplicateBlock = (blockId: string) => {
    if (!selectedPage) return
    const blocks = getEditorBlocks(selectedPage, variantKey)
    const index = blocks.findIndex((block) => block.id === blockId)
    if (index < 0) return
    if (blocks[index].system?.locked) return
    const clone = { ...cloneJson(blocks[index]), id: createBlockId() } as LearningBlock
    const nextBlocks = [...blocks]
    nextBlocks.splice(index + 1, 0, clone)
    setBlocks(selectedPage.page_uuid, nextBlocks)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: clone.id })
  }

  const moveBlockTo = React.useCallback((blockId: string, toIndex: number) => {
    if (!selectedPage) return
    const blocks = getEditorBlocks(selectedPage, variantKey)
    const index = blocks.findIndex((block) => block.id === blockId)
    if (index < 0 || toIndex < 0 || toIndex >= blocks.length || toIndex === index) return
    if (blocks[index].system?.locked) return
    const nextBlocks = [...blocks]
    const [item] = nextBlocks.splice(index, 1)
    nextBlocks.splice(toIndex, 0, item)
    setBlocks(selectedPage.page_uuid, nextBlocks)
  }, [selectedPage, setBlocks, variantKey])

  const registerBlockEl = React.useCallback((blockId: string, el: HTMLElement | null) => {
    if (el) blockElsRef.current.set(blockId, el)
    else blockElsRef.current.delete(blockId)
  }, [])

  // Pointer-driven reorder: swap with a neighbour when the pointer crosses its
  // vertical midpoint. Runs from the screen-space drag handle in BlockOverlay.
  const moveBlockToRef = React.useRef(moveBlockTo)
  moveBlockToRef.current = moveBlockTo
  const startBlockDrag = React.useCallback((blockId: string, startEvent: React.PointerEvent) => {
    if (getEditorBlocks(selectedPage, variantKey).find((block) => block.id === blockId)?.system?.locked) return
    startEvent.preventDefault()
    startEvent.stopPropagation()
    setDraggingBlockId(blockId)
    document.body.style.cursor = 'grabbing'

    const onMove = (event: PointerEvent) => {
      const rows = Array.from(document.querySelectorAll('[data-learning-editor-frame] [data-canvas-block-id]')) as HTMLElement[]
      const currentIndex = rows.findIndex((row) => row.dataset.canvasBlockId === blockId)
      if (currentIndex < 0) return
      const previous = rows[currentIndex - 1]
      const next = rows[currentIndex + 1]
      if (previous) {
        const rect = previous.getBoundingClientRect()
        if (event.clientY < rect.top + rect.height / 2) {
          moveBlockToRef.current(blockId, currentIndex - 1)
          return
        }
      }
      if (next) {
        const rect = next.getBoundingClientRect()
        if (event.clientY > rect.top + rect.height / 2) {
          moveBlockToRef.current(blockId, currentIndex + 1)
        }
      }
    }
    const onEnd = () => {
      document.body.style.cursor = ''
      setDraggingBlockId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }, [selectedPage, variantKey])

  // A text-input block is one row: either a single input or two side by side.
  const toggleSideBySide = (blockId: string) => {
    if (!selectedPage) return
    const block = getEditorBlocks(selectedPage, variantKey).find((item) => item.id === blockId)
    if (!block || block.type !== 'question' || (block as LearningQuestionBlock).kind !== 'text_input') return
    const question = block as LearningQuestionBlock
    const inputs = normalizeQuestionInputs(question.content?.inputs)
    const completion = { ...(question.completion || {}) }
    const rules = { ...(completion.inputs || {}) }
    const bindings = { ...((completion.variable_bindings || {}).inputs || {}) }

    if (inputs.length > 1) {
      const [keep, ...remove] = inputs
      remove.forEach((input) => {
        delete rules[input.id]
        delete bindings[input.id]
      })
      patchBlock(blockId, {
        content: { ...(question.content || {}), inputs: [{ ...keep, width: 'full' }] },
        completion: { ...completion, inputs: rules, variable_bindings: { ...(completion.variable_bindings || {}), inputs: bindings } },
      })
      return
    }

    const source = inputs[0]
    const newId = createInputId()
    const sectionId = source.section_id || source.id
    patchBlock(blockId, {
      content: {
        ...(question.content || {}),
        inputs: [
          { ...source, section_id: sectionId, width: 'half' },
          { id: newId, section_id: sectionId, label: 'Response', placeholder: '', variant: source.variant || 'short_answer', width: 'half', height: Number(source.height) || 160 },
        ],
      },
      completion: {
        ...completion,
        inputs: { ...rules, [newId]: { ...(rules[source.id] || { required: true, min_words: 1, max_words: 0, points: 1 }) } },
      },
    })
  }

  const selectVariant = (key: string) => {
    if (!selectedPage) return
    const variants = selectedPage.content?.variants || {}
    if (key !== 'default' && !variants.overrides?.[key]) {
      patchSelectedPage({
        content: {
          ...(selectedPage.content || {}),
          variants: {
            ...variants,
            overrides: {
              ...(variants.overrides || {}),
              [key]: { blocks: cloneBlocksWithFreshIds(getPageBlocks(selectedPage)) },
            },
          },
        },
      })
    }
    setVariantKey(key)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })
  }

  const disableVariant = (key: string) => {
    if (!selectedPage || key === 'default') return
    const variants = selectedPage.content?.variants || {}
    const overrides = { ...(variants.overrides || {}) }
    delete overrides[key]
    patchSelectedPage({ content: { ...(selectedPage.content || {}), variants: { ...variants, overrides } } })
    if (variantKey === key) setVariantKey('default')
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

  const patchFlowSettings = (flow: any) => {
    const settings = { ...(activityState.settings || {}), flow }
    setActivityState((current: any) => ({ ...current, settings }))
    scheduleActivitySave({ settings })
  }

  const convertVariants = async (page: any) => {
    if (!accessToken) return
    try {
      await saveBeforeAction()
      const saved = await convertLearningPageVariants(activityState.activity_uuid, page.page_uuid, accessToken)
      setActivityState((current: any) => ({ ...current, ...(saved || {}) }))
      setPages(normalizeInitialPages(saved.pages || []))
      setVariantKey('default')
      toast.success('Variants converted to editable branches')
    } catch (error: any) {
      toast.error(error?.message || 'Could not convert variants')
    }
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
      const targetBlock = getEditorBlocks(selectedPage, variantKey).find((item) => item.id === uploadingBlockId)
      patchBlock(uploadingBlockId, {
        content: {
          ...((targetBlock as LearningImageBlock | undefined)?.content || {}),
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
  }

  const handleMediaAssetPicked = (asset: any) => {
    if (!selectedPage || !uploadingBlockId) return
    const targetBlock = getEditorBlocks(selectedPage, variantKey).find((item) => item.id === uploadingBlockId)
    patchBlock(uploadingBlockId, {
      content: {
        ...((targetBlock as LearningImageBlock | undefined)?.content || {}),
        src: asset.url,
        alt: asset.title || '',
      },
    } as Partial<LearningImageBlock>)
    setUploadingBlockId(null)
  }

  const createVariableFromKey = async (rawKey: string, valueType = 'text') => {
    const key = String(rawKey || '').trim()
    if (!key || !badge?.org_id || !accessToken) return null
    if (learningVariables.some((variable) => String(variable.key) === key)) {
      toast.error('Variable key already exists')
      return null
    }
    try {
      const variable = await createLearningVariable({
        org_id: badge.org_id,
        key,
        label: key.split('.').at(-1) || key,
        value_type: valueType,
        options: [],
      }, accessToken)
      setLearningVariables((current) => [...current, variable].sort((a, b) => String(a.key).localeCompare(String(b.key))))
      return variable
    } catch (error: any) {
      toast.error(error?.message || 'Could not create variable')
      return null
    }
  }

  const createVariable = async () => {
    const variable = await createVariableFromKey(variableDraftKey)
    if (variable) setVariableDraftKey('')
  }

  const patchVariable = async (variable: any, patch: Record<string, any>) => {
    const variableUuid = variable?.variable_uuid || variable?.uuid
    if (!variableUuid) return
    const optimistic = { ...variable, ...patch }
    setLearningVariables((current) => current.map((item) => (item.variable_uuid || item.uuid) === variableUuid ? optimistic : item))
    try {
      const saved = await updateLearningVariable(variableUuid, patch, accessToken)
      setLearningVariables((current) => current.map((item) => (item.variable_uuid || item.uuid) === variableUuid ? saved : item))
    } catch (error: any) {
      setLearningVariables((current) => current.map((item) => (item.variable_uuid || item.uuid) === variableUuid ? variable : item))
      toast.error(error?.message || 'Could not update variable')
    }
  }

  const removeVariable = async (variable: any) => {
    const variableUuid = variable?.variable_uuid || variable?.uuid
    if (!variableUuid || !confirm(`Delete variable "${variable.key}"?`)) return
    const previous = learningVariables
    setLearningVariables((current) => current.filter((item) => (item.variable_uuid || item.uuid) !== variableUuid))
    try {
      await deleteLearningVariable(variableUuid, accessToken)
    } catch (error: any) {
      setLearningVariables(previous)
      toast.error(error?.message || 'Could not delete variable')
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
      <MediaPickerDialog
        open={Boolean(uploadingBlockId)}
        onOpenChange={(open) => {
          if (!open) setUploadingBlockId(null)
        }}
        title="Choose image"
        description="Upload, link, or select an image from the media library."
        onSave={handleMediaAssetPicked}
        owner={{ type: 'org', id: Number(badge?.org_id) }}
        mediaType="image"
        accessToken={accessToken}
      />
      <EditorHeader
        badgeName={badge.name}
        activity={activityState}
        device={device}
        setDevice={setDevice}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        publishing={publishing}
        onBack={goBack}
        onPreview={() => setPreviewOpen(true)}
        onPublish={publishActivity}
      />
      <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-b border-gray-200 bg-white px-5">
        <TopModeButton active={viewMode === 'editor'} onClick={() => setViewMode('editor')} label="Editor" />
        <TopModeButton active={viewMode === 'flow'} onClick={() => setViewMode('flow')} label="Flow" />
        <TopModeButton active={viewMode === 'settings'} onClick={() => setViewMode('settings')} label="Settings" />
      </div>

      {viewMode === 'settings' ? (
        <ActivitySettingsView
          activity={activityState}
          gradingSettings={gradingSettings}
          learningVariables={learningVariables}
          variableDraftKey={variableDraftKey}
          setVariableDraftKey={setVariableDraftKey}
          onPatchActivity={patchActivityBasics}
          onPatchGrading={patchGradingSettings}
          onCreateVariable={createVariable}
          onPatchVariable={patchVariable}
          onDeleteVariable={removeVariable}
        />
      ) : viewMode === 'flow' ? (
        <ActivityFlowView
          activity={activityState}
          pages={pages}
          trusted={badge?.system_type === 'onboarding' || badge?.protected === true}
          onSelectPage={(pageUuid: string) => { setSelection({ pageUuid, blockId: null }); setViewMode('editor') }}
          onPatchFlow={patchFlowSettings}
          onPatchActivity={patchActivityBasics}
          onConvertVariants={convertVariants}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div style={{ width: leftWidth }} className="relative shrink-0">
            <PageListPanel
              pages={pages}
              selectedPage={selectedPage}
              onSelectPage={(pageUuid: string) => setSelection({ pageUuid, blockId: null })}
              onAddPage={addPage}
              onDuplicatePage={duplicatePage}
              onRemovePage={removePage}
              onReorderPages={reorderPages}
            />
            <PanelResizeHandle side="right" onPointerDown={(event) => resizePanel('left', event)} />
          </div>
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <CanvasToolbar
              selectedPage={selectedPage}
              pages={pages}
              variantKey={variantKey}
              onSelectVariant={selectVariant}
              onAddText={() => insertBlock('text', selection.blockId)}
              onAddImage={() => insertBlock('image', selection.blockId)}
              onAddButton={() => insertBlock('button', selection.blockId)}
              onAddQuestion={(kind: 'multiple_choice' | 'categorized_multi_select' | 'text_input' | 'image_upload') => insertBlock(kind, selection.blockId)}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {variantKey !== 'default' && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800 shadow-sm">
                    Editing variant
                  </span>
                </div>
              )}
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
                <div
                  className="flex h-full w-full items-center justify-center px-14 pb-32 pt-10"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget && selectedPage) {
                      setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })
                    }
                  }}
                >
                  <CanvasFrame
                    page={selectedPage}
                    pages={pages}
                    pageIndex={Math.max(0, pages.findIndex((page) => page.page_uuid === selectedPage?.page_uuid))}
                    selectedBlockId={selection.blockId}
                    device={device}
                    frame={frame}
                    frameShellHeight={frameShellHeight}
                    fitScale={fitScale}
                    zoom={zoom}
                    pan={pan}
                    variantKey={variantKey}
                    registerBlockEl={registerBlockEl}
                    onHoverBlock={setHoveredBlockId}
                    onTextEditorReady={setActiveTextEditor}
                    onSelectPage={() => selectedPage && setSelection({ pageUuid: selectedPage.page_uuid, blockId: null })}
                    onSelectBlock={(blockId: string) => selectedPage && setSelection({ pageUuid: selectedPage.page_uuid, blockId })}
                    onPatchPage={patchSelectedPage}
                    onPatchBlock={patchBlock}
                    onInsertBlock={insertBlock}
                    onDuplicateBlock={duplicateBlock}
                    onRemoveBlock={removeBlock}
                    onRequestImageUpload={requestImageUpload}
                  />
                </div>
              </div>
              <BlockOverlay
                selectedPage={selectedPage}
                selectedBlock={selectedBlock}
                hoveredBlockId={hoveredBlockId}
                draggingBlockId={draggingBlockId}
                blockElsRef={blockElsRef}
                activeTextEditor={activeTextEditor}
                onDuplicate={() => selectedBlock && duplicateBlock(selectedBlock.id)}
                onRemove={() => selectedBlock && removeBlock(selectedBlock.id)}
                onToggleSideBySide={() => selectedBlock && toggleSideBySide(selectedBlock.id)}
                onStartDrag={startBlockDrag}
                onPatchBlock={patchBlock}
              />
              <CanvasControls
                zoom={zoom}
                setZoom={setZoom}
                handMode={handMode}
                setHandMode={setHandMode}
              />
            </div>
          </main>
          <div style={{ width: rightWidth }} className="relative shrink-0">
            <PanelResizeHandle side="left" onPointerDown={(event) => resizePanel('right', event)} />
            <InspectorPanel
              page={selectedPage}
              block={selectedBlock}
              pages={pages}
              variantKey={variantKey}
              setVariantKey={setVariantKey}
              onSelectVariant={selectVariant}
              onDisableVariant={disableVariant}
              onToggleSideBySide={() => selectedBlock && toggleSideBySide(selectedBlock.id)}
              learningVariables={learningVariables}
              onCreateVariableKey={createVariableFromKey}
              onPatchPage={patchSelectedPage}
              onPatchBlock={patchBlock}
              onRequestImageUpload={requestImageUpload}
            />
          </div>
        </div>
      )}

      {previewOpen && (
        <PreviewModal pages={pages} selectedPage={selectedPage} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}

function ActivityFlowView({ activity, pages, onSelectPage, onPatchFlow, onConvertVariants }: any) {
  const flow = activity.settings?.flow
  if (!flow) {
    return <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-50 p-8"><div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm"><GitBranch size={24} className="mx-auto text-gray-700"/><h2 className="mt-4 text-lg font-bold">Turn page order into a visual flow</h2><p className="mt-2 text-sm leading-6 text-gray-500">Start with the current page order, then add decision points, rearrange paths, and draw merge connections directly on the canvas.</p><button onClick={() => onPatchFlow(createLinearFlow(pages))} className="mt-6 h-10 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white hover:bg-black">Open visual flow</button>{pages.some((page: any) => page.content?.variants) && <div className="mt-5 border-t border-gray-100 pt-5"><p className="text-xs text-gray-500">This activity also has legacy page variants.</p><div className="mt-2 flex flex-wrap justify-center gap-2">{pages.filter((page: any) => page.content?.variants).map((page: any) => <button key={page.page_uuid} onClick={() => onConvertVariants(page)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Convert {page.title}</button>)}</div></div>}</div></div>
  }
  return <VisualFlowEditor flow={flow} pages={pages} onChange={onPatchFlow} onSelectPage={onSelectPage}/>
}

function LegacyActivityFlowView({ activity, pages, trusted, onSelectPage, onPatchFlow, onPatchActivity, onConvertVariants }: any) {
  const flow = activity.settings?.flow
  const outcomes = activity.settings?.outcomes || { version: 1, actions: [] }
  const enableLinearFlow = () => {
    const nodes: any[] = pages.map((page: any) => ({ id: `page:${page.page_uuid}`, type: 'page', page_uuid: page.page_uuid }))
    nodes.push({ id: 'complete', type: 'complete' })
    const edges = pages.map((page: any, index: number) => ({ from: `page:${page.page_uuid}`, to: index + 1 < pages.length ? `page:${pages[index + 1].page_uuid}` : 'complete', priority: 0 }))
    onPatchFlow({ version: 1, entry: nodes[0]?.id, nodes, edges })
  }
  const patchEdge = (index: number, patch: any) => onPatchFlow({ ...flow, edges: flow.edges.map((edge: any, edgeIndex: number) => edgeIndex === index ? { ...edge, ...patch } : edge) })
  const saveOutcomes = (actions: any[]) => onPatchActivity({ settings: { ...(activity.settings || {}), outcomes: { version: 1, actions } } })
  const patchOutcome = (index: number, patch: any) => saveOutcomes(outcomes.actions.map((action: any, actionIndex: number) => actionIndex === index ? { ...action, ...patch } : action))
  const addOutcome = (type: string) => {
    const defaults: Record<string, any> = { set_portfolio_fields: { fields: { headline: '' } }, create_work_item: { store_as: 'work_item_id', fields: { title: '' } }, create_journey_entry: { store_as: 'journey_entry_id', fields: { title: '' } }, set_traits: { trait_type: 'strength', values: [] }, set_portfolio_links: { links: [] }, set_theme: { theme_id: 'default' }, set_featured_content: { work: { $source: 'binding', key: 'work_item_id' } } }
    saveOutcomes([...outcomes.actions, { id: `${type}-${Date.now()}`, type, ...(defaults[type] || {}) }])
  }
  return <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-6">
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><GitBranch size={18}/><h2 className="font-bold">Learner flow</h2></div><p className="mt-1 text-sm text-gray-500">Split into multi-page paths, join them later, or finish a path early.</p></div>{!flow && <button onClick={enableLinearFlow} className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white">Enable branching</button>}</div>
        {!flow ? <div className="mt-8 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">This activity follows page order. Enable branching to create an editable acyclic flow.</div> : <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{flow.nodes.map((node: any) => node.type === 'complete' ? <div key={node.id} className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-700">Completion</p><p className="mt-1 font-bold">Activity complete</p></div> : <button key={node.id} onClick={() => onSelectPage(node.page_uuid)} className="rounded-xl border border-gray-200 p-4 text-left hover:border-gray-400"><p className="text-xs font-bold uppercase text-gray-400">Page node</p><p className="mt-1 truncate font-bold">{pages.find((page: any) => page.page_uuid === node.page_uuid)?.title || node.page_uuid}</p></button>)}</div>
          <div className="mt-7"><h3 className="text-sm font-bold">Transitions</h3><div className="mt-3 space-y-3">{flow.edges.map((edge: any, index: number) => <div key={`${edge.from}-${edge.to}-${index}`} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_90px]"><div><p className="text-[10px] font-bold uppercase text-gray-400">From → to</p><p className="mt-1 truncate text-xs font-semibold">{edge.from} → {edge.to}</p></div><label className="text-[10px] font-bold uppercase text-gray-400">Answer option<input value={edge.condition?.right || ''} onChange={(event) => patchEdge(index, { condition: event.target.value ? { op: 'contains', left: edge.condition?.left || { source: 'answer', key: '' }, right: event.target.value } : undefined })} placeholder="Fallback" className="mt-1 h-8 w-full rounded border px-2 text-xs font-normal normal-case"/></label><label className="text-[10px] font-bold uppercase text-gray-400">Priority<input type="number" value={edge.priority || 0} onChange={(event) => patchEdge(index, { priority: Number(event.target.value) })} className="mt-1 h-8 w-full rounded border px-2 text-xs font-normal"/></label></div>)}</div></div>
        </>}
        {pages.some((page: any) => page.content?.variants) && <div className="mt-7 border-t pt-5"><h3 className="text-sm font-bold">Page variants</h3><p className="mt-1 text-xs text-gray-500">Convert a single-page variant into separate editable paths.</p><div className="mt-3 flex flex-wrap gap-2">{pages.filter((page: any) => page.content?.variants).map((page: any) => <button key={page.page_uuid} onClick={() => onConvertVariants(page)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Convert {page.title}</button>)}</div></div>}
      </section>
      <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Completion outcomes</h2><p className="mt-1 text-sm text-gray-500">These run atomically after the learner finishes.</p>{trusted ? <><div className="mt-4 space-y-2">{outcomes.actions.map((action: any, index: number) => <div key={action.id} className="rounded-lg border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold">{action.type.replaceAll('_', ' ')}</p><button onClick={() => saveOutcomes(outcomes.actions.filter((_: any, actionIndex: number) => actionIndex !== index))} className="text-gray-400 hover:text-red-600" title="Remove outcome"><Trash2 size={13}/></button></div><p className="mt-1 truncate text-[11px] text-gray-400">{action.id}</p>{action.fields && <label className="mt-3 block text-[10px] font-bold uppercase text-gray-400">Title or headline<input value={typeof (action.fields.title ?? action.fields.headline) === 'string' ? (action.fields.title ?? action.fields.headline) : ''} onChange={(event) => patchOutcome(index, { fields: { ...action.fields, [action.fields.title !== undefined ? 'title' : 'headline']: event.target.value } })} placeholder="Constant value" className="mt-1 h-8 w-full rounded border px-2 text-xs font-normal normal-case"/></label>}{action.type === 'set_theme' && <label className="mt-3 block text-[10px] font-bold uppercase text-gray-400">Theme<select value={typeof action.theme_id === 'string' ? action.theme_id : 'default'} onChange={(event) => patchOutcome(index, { theme_id: event.target.value })} className="mt-1 h-8 w-full rounded border px-2 text-xs font-normal normal-case"><option value="default">Default</option><option value="electric">Electric</option><option value="minimal">Minimal</option><option value="creative">Creative</option></select></label>}</div>)}{!outcomes.actions.length && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No portfolio changes configured.</p>}</div><select defaultValue="" onChange={(event) => { if (event.target.value) addOutcome(event.target.value); event.target.value = '' }} className="mt-4 h-9 w-full rounded-lg border px-2 text-xs font-semibold"><option value="">Add an outcome…</option>{['set_portfolio_fields','create_work_item','create_journey_entry','set_traits','set_portfolio_links','set_theme','set_featured_content','confirm_privacy','publish_portfolio'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></> : <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Portfolio outcomes are available only to trusted system badges. Branching remains available to this activity.</p>}</aside>
    </div>
  </div>
}

function EditorHeader({ badgeName, activity, device, setDevice, saveState, lastSavedAt, publishing, onBack, onPreview, onPublish }: any) {
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
      <div className="flex items-center gap-3">
        <div className="grid w-48 grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <DeviceModeButton active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={<Smartphone size={14} />} label="Mobile" />
          <DeviceModeButton active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={<Monitor size={14} />} label="Desktop" />
        </div>
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

function CanvasToolbar({ selectedPage, pages, variantKey, onSelectVariant, onAddText, onAddImage, onAddButton, onAddQuestion }: any) {
  const canEditBlocks = selectedPage?.page_type === 'standard'
  const hasVariants = Boolean(selectedPage?.content?.variants)
  const canAddQuestion = canEditBlocks && !hasVariants
  const source = hasVariants ? getVariantSource(pages, selectedPage) : null
  const enabledVariants = hasVariants ? getEnabledVariantKeys(selectedPage, source) : []

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-1">
        <span className="flex items-center gap-1.5 pr-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
          <Plus size={13} />
          Insert
        </span>
        <span className="h-5 w-px bg-gray-200" />
        <button disabled={!canEditBlocks} onClick={onAddText} className="ml-1 inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40" title="Add a text block">
          <FileText size={15} />
          Text
        </button>
        <button disabled={!canEditBlocks} onClick={onAddImage} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40" title="Add an image block">
          <ImageIcon size={15} />
          Image
        </button>
        <button disabled={!canEditBlocks} onClick={onAddButton} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40" title="Add a page button">
          <MousePointerClick size={15} />
          Button
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button disabled={!canAddQuestion} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:opacity-50" title={canAddQuestion ? 'Add a question block' : 'Variant pages cannot contain questions'}>
              <ListChecks size={15} />
              Question
              <ChevronDown size={13} className="text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onAddQuestion('multiple_choice')}>
              <ListChecks size={16} className="mr-2" />
              Multiple choice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddQuestion('categorized_multi_select')}>
              <ListChecks size={16} className="mr-2" />
              Categorized multi-select
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddQuestion('text_input')}>
              <FileText size={16} className="mr-2" />
              Text input
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddQuestion('image_upload')}>
              <Upload size={16} className="mr-2" />
              Image upload
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasVariants && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            <Layers3 size={12} />
            Variant
          </span>
          <select
            value={enabledVariants.some((item) => item.key === variantKey) ? variantKey : 'default'}
            onChange={(event) => onSelectVariant(event.target.value)}
            className={`h-8 max-w-52 rounded-lg border px-2 text-xs font-bold outline-none ${variantKey !== 'default' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700'}`}
          >
            {enabledVariants.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function PanelResizeHandle({ side, onPointerDown }: { side: 'left' | 'right'; onPointerDown: React.PointerEventHandler<HTMLDivElement> }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`group absolute top-0 z-20 flex h-full w-2.5 cursor-col-resize items-center justify-center ${side === 'left' ? '-left-1' : '-right-1'}`}
    >
      <div className="h-14 w-1 rounded-full bg-gray-300 opacity-0 transition group-hover:opacity-100" />
    </div>
  )
}

function CanvasFrame({
  page,
  pages,
  selectedBlockId,
  variantKey,
  device,
  frame,
  frameShellHeight,
  fitScale,
  zoom,
  pan,
  pageIndex = 0,
  onSelectPage,
  onSelectBlock,
  onPatchPage,
  onPatchBlock,
  onInsertBlock,
  onRequestImageUpload,
  registerBlockEl,
  onHoverBlock,
  onTextEditorReady,
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
      data-learning-preview-frame
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
        <div className="h-full" onMouseDown={(event) => {
          if (!(event.target as HTMLElement).closest('[data-canvas-block-id]')) onSelectPage()
        }}>
          <LearningActivitySurface
            pages={pages}
            page={page}
            pageIndex={pageIndex}
            onBack={() => null}
            actionLabel={pageIndex === pages.length - 1 ? 'Finish' : 'Continue'}
            actionDisabled
            className="h-full"
          >
            {page.page_type === 'video' ? (
              <VideoCanvasPage page={page} onPatchPage={onPatchPage} />
            ) : (
              <StandardCanvasPage
                page={page}
                pages={pages}
                selectedBlockId={selectedBlockId}
                variantKey={variantKey}
                registerBlockEl={registerBlockEl}
                onHoverBlock={onHoverBlock}
                onTextEditorReady={onTextEditorReady}
                onSelectPage={onSelectPage}
                onSelectBlock={onSelectBlock}
                onPatchPage={onPatchPage}
                onPatchBlock={onPatchBlock}
                onInsertBlock={onInsertBlock}
                onRequestImageUpload={onRequestImageUpload}
              />
            )}
          </LearningActivitySurface>
        </div>
      </div>
    </div>
  )
}

function StandardCanvasPage({
  page,
  selectedBlockId,
  variantKey = 'default',
  registerBlockEl,
  onHoverBlock,
  onTextEditorReady,
  onSelectPage,
  onSelectBlock,
  onPatchBlock,
  onInsertBlock,
  onRequestImageUpload,
  readOnly = false,
}: any) {
  const blocks = getEditorBlocks(page, variantKey)
  const canAddQuestion = !page?.content?.variants

  return (
    <div className="w-full" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onSelectPage?.()
    }}>
      <div className="w-full">
        {blocks.length ? (
          <div>
            {blocks.map((block: LearningBlock, index: number) => (
              <React.Fragment key={block.id}>
                {index > 0 && (
                  readOnly
                    ? <div className="h-4" />
                    : <InlineInsertMenu canAddQuestion={canAddQuestion} onInsert={(type: any) => onInsertBlock(type, blocks[index - 1].id)} />
                )}
                <CanvasBlock
                  block={block}
                  page={page}
                  selected={!readOnly && block.id === selectedBlockId}
                  readOnly={readOnly}
                  registerBlockEl={registerBlockEl}
                  onHoverBlock={onHoverBlock}
                  onTextEditorReady={onTextEditorReady}
                  onSelect={() => onSelectBlock(block.id)}
                  onPatch={(patch: any) => onPatchBlock(block.id, patch)}
                  onRequestImageUpload={() => onRequestImageUpload(block.id)}
                />
              </React.Fragment>
            ))}
            {!readOnly && (
              <InlineInsertMenu canAddQuestion={canAddQuestion} onInsert={(type: any) => onInsertBlock(type, blocks[blocks.length - 1].id)} alwaysVisible={blocks.length <= 2} />
            )}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white/70 p-8 text-center">
            <Layers3 size={26} className="text-gray-400" />
            <p className="text-sm font-bold text-gray-700">Add your first block</p>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <button onClick={() => onInsertBlock('text')} className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"><FileText size={15} />Text</button>
                <button onClick={() => onInsertBlock('image')} className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"><ImageIcon size={15} />Image</button>
                {canAddQuestion && (
                  <button onClick={() => onInsertBlock('multiple_choice')} className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"><ListChecks size={15} />Question</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CanvasBlock({ block, page, selected, readOnly, registerBlockEl, onHoverBlock, onTextEditorReady, onSelect, onPatch, onRequestImageUpload }: {
  block: LearningBlock
  page: any
  selected: boolean
  readOnly?: boolean
  registerBlockEl?: (blockId: string, el: HTMLElement | null) => void
  onHoverBlock?: (blockId: string | null) => void
  onTextEditorReady?: (editor: any) => void
  onSelect: () => void
  onPatch: (patch: any) => void
  onRequestImageUpload: () => void
}) {
  const style = getBlockStyle(block)
  const contentReadOnly = Boolean(readOnly || block.system?.locked)

  const content = block.type === 'text' ? (
    block.content?.nodes?.[0]?.content?.[0]?.type === 'displayBinding'
      ? <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">{block.content.nodes[0].content[0].attrs?.binding?.fallback || 'Dynamic value'}</div>
      : <TextBlockEditor block={block} selected={selected} readOnly={contentReadOnly} onEditorReady={onTextEditorReady} onPatch={onPatch} />
  ) : block.type === 'image' ? (
    <ImageBlockEditor
      block={block}
      selected={selected}
      readOnly={contentReadOnly}
      onPatch={onPatch}
      onRequestImageUpload={onRequestImageUpload}
    />
  ) : block.type === 'button' ? (
    <button type="button" disabled className={`pointer-events-none min-h-11 rounded-full px-5 py-3 text-sm font-bold ${block.design?.variant === 'primary' ? 'bg-[var(--org-primary-color)] text-white' : 'border border-gray-200 bg-white text-gray-700 shadow-sm'}`}>{block.content?.label || 'Go to page'}</button>
  ) : block.type === 'portfolio_preview' ? (
    <JourneyCardView preview entry={{ journey_uuid: 'preview', slug: 'preview', entry_type: 'education', title: 'Your current chapter', organization: 'Your school or organization', location_label: 'Your location', summary: 'Your story will appear here.', start_date: '2026-01', start_precision: 'month', is_current: true, revision: 1, cover_url: '', blocks: [], work: [] } as JourneyEntry} />
  ) : ['multiple_choice', 'categorized_multi_select'].includes((block as LearningQuestionBlock).kind) ? (
    <McqBlockCanvas block={block as LearningQuestionBlock} page={page} selected={selected} readOnly={contentReadOnly} onPatch={onPatch} />
  ) : (block as LearningQuestionBlock).kind === 'image_upload' ? (
    <ImageUploadBlockCanvas block={block as LearningQuestionBlock} readOnly={contentReadOnly} onPatch={onPatch} />
  ) : (
    <TextInputBlockCanvas block={block as LearningQuestionBlock} page={page} selected={selected} readOnly={contentReadOnly} onPatch={onPatch} />
  )

  if (readOnly) {
    return <section style={style} className="rounded-md py-1">{content}</section>
  }

  return (
    <section
      ref={(el) => registerBlockEl?.(block.id, el)}
      data-canvas-block-id={block.id}
      className={`relative rounded-md transition ${selected ? 'outline outline-2 outline-offset-4 outline-[var(--org-primary-color)]' : 'hover:outline hover:outline-1 hover:outline-offset-4 hover:outline-gray-300'}`}
      style={style}
      onMouseEnter={() => onHoverBlock?.(block.id)}
      onMouseLeave={() => onHoverBlock?.(null)}
      onMouseDown={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      {block.system?.locked && <span className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm"><Lock size={11} /> System</span>}
      {content}
    </section>
  )
}

// Screen-space chrome for the selected/hovered block: a unified toolbar above
// the block (label, text formatting, row actions), a drag handle on the left,
// and width pills on the sides. Lives OUTSIDE the scaled frame so nothing gets
// clipped and everything renders at constant size.
function BlockOverlay({ selectedPage, selectedBlock, hoveredBlockId, draggingBlockId, blockElsRef, activeTextEditor, onDuplicate, onRemove, onToggleSideBySide, onStartDrag, onPatchBlock }: any) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const targetId = draggingBlockId || selectedBlock?.id || hoveredBlockId
  const isSelected = Boolean(selectedBlock && targetId === selectedBlock.id)
  const isDragging = Boolean(draggingBlockId)

  React.useLayoutEffect(() => {
    if (!targetId) {
      setRect(null)
      return
    }
    let frameId = 0
    const measure = () => {
      const container = containerRef.current
      const el = blockElsRef.current.get(targetId)
      if (!container || !el || !el.isConnected) {
        setRect((prev) => (prev === null ? prev : null))
      } else {
        const containerRect = container.getBoundingClientRect()
        const blockRect = el.getBoundingClientRect()
        const next = {
          top: blockRect.top - containerRect.top,
          left: blockRect.left - containerRect.left,
          width: blockRect.width,
          height: blockRect.height,
        }
        setRect((prev) => (
          prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5
            && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
            ? prev
            : next
        ))
      }
      frameId = window.requestAnimationFrame(measure)
    }
    measure()
    return () => window.cancelAnimationFrame(frameId)
  }, [targetId, blockElsRef])

  const startWidthResize = (edge: 'left' | 'right') => (startEvent: React.PointerEvent) => {
    if (!selectedBlock) return
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const el = blockElsRef.current.get(selectedBlock.id)
    const container = el?.parentElement
    if (!el || !container) return
    const containerWidth = container.getBoundingClientRect().width
    const startX = startEvent.clientX
    const startWidth = Math.max(25, Math.min(100, Number(selectedBlock.design?.width) || 100))
    const align = selectedBlock.design?.align || 'left'
    // Which direction grows the block depends on the grabbed edge and alignment.
    const factor = (edge === 'right' ? 1 : -1) * (align === 'center' ? 2 : 1)
    const onMove = (event: PointerEvent) => {
      const deltaPercent = ((event.clientX - startX) / containerWidth) * 100 * factor
      const next = Math.round(Math.max(25, Math.min(100, startWidth + deltaPercent)))
      onPatchBlock(selectedBlock.id, { design: { ...(selectedBlock.design || {}), width: next } })
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

  const isTextBlock = isSelected && selectedBlock?.type === 'text'
  const isTextInputQuestion = isSelected && selectedBlock?.type === 'question' && selectedBlock?.kind === 'text_input'
  const sideBySideActive = isTextInputQuestion && (selectedBlock?.content?.inputs || []).length > 1
  const locked = Boolean(selectedBlock?.system?.locked)

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {rect && targetId && selectedPage && (
        <>
          {isSelected && !isDragging && (
            <div
              className="pointer-events-auto absolute flex h-9 items-center gap-1 rounded-xl border border-gray-200 bg-white px-1.5 shadow-lg shadow-gray-950/10"
              style={{
                top: Math.max(6, rect.top - 44),
                left: rect.left + rect.width / 2,
                transform: 'translateX(-50%)',
              }}
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault()
                event.stopPropagation()
              }}
            >
              <span className="px-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{blockLabel(selectedBlock)}</span>
              {isTextBlock && activeTextEditor && (
                <>
                  <span className="h-5 w-px bg-gray-200" />
                  <IconButton title="Heading 1" active={activeTextEditor.isActive('heading', { level: 1 })} onClick={() => activeTextEditor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></IconButton>
                  <IconButton title="Heading 2" active={activeTextEditor.isActive('heading', { level: 2 })} onClick={() => activeTextEditor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></IconButton>
                  <IconButton title="Bold" active={activeTextEditor.isActive('bold')} onClick={() => activeTextEditor.chain().focus().toggleBold().run()}><Bold size={14} /></IconButton>
                  <IconButton title="Italic" active={activeTextEditor.isActive('italic')} onClick={() => activeTextEditor.chain().focus().toggleItalic().run()}><Italic size={14} /></IconButton>
                  <IconButton title="Quote" active={activeTextEditor.isActive('blockquote')} onClick={() => activeTextEditor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></IconButton>
                  <span className="h-5 w-px bg-gray-200" />
                  <IconButton title="Align left" active={getEditorAlign(activeTextEditor) === 'left'} onClick={() => setEditorAlign(activeTextEditor, 'left')}><AlignLeft size={14} /></IconButton>
                  <IconButton title="Align center" active={getEditorAlign(activeTextEditor) === 'center'} onClick={() => setEditorAlign(activeTextEditor, 'center')}><AlignCenter size={14} /></IconButton>
                  <IconButton title="Align right" active={getEditorAlign(activeTextEditor) === 'right'} onClick={() => setEditorAlign(activeTextEditor, 'right')}><AlignRight size={14} /></IconButton>
                </>
              )}
              {isTextInputQuestion && (
                <>
                  <span className="h-5 w-px bg-gray-200" />
                  <IconButton title={sideBySideActive ? 'Back to one input' : 'Two inputs side by side'} active={sideBySideActive} onClick={onToggleSideBySide}><Columns2 size={14} /></IconButton>
                </>
              )}
              <span className="h-5 w-px bg-gray-200" />
              {locked ? <span title={selectedBlock.system?.reason || 'Managed by the system'} className="flex items-center gap-1 px-1.5 text-[11px] font-bold text-gray-500"><Lock size={13} /> Locked</span> : <><IconButton title="Duplicate" onClick={onDuplicate}><Copy size={14} /></IconButton><IconButton title="Delete" onClick={onRemove}><Trash2 size={14} /></IconButton></>}
            </div>
          )}

          {!locked && <button
            type="button"
            title="Drag to reorder"
            onPointerDown={(event) => onStartDrag(targetId, event)}
            className="pointer-events-auto absolute flex h-8 w-6 cursor-grab items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 shadow-sm transition hover:text-gray-700 active:cursor-grabbing"
            style={{ top: rect.top + rect.height / 2 - 16, left: Math.max(2, rect.left - 30) }}
          >
            <GripVertical size={14} />
          </button>}

          {isSelected && !isDragging && !locked && (
            <>
              <div
                title="Drag to resize width"
                onPointerDown={startWidthResize('left')}
                className="pointer-events-auto absolute h-9 w-[6px] cursor-col-resize rounded-full border border-white bg-[var(--org-primary-color)] shadow-sm"
                style={{ top: rect.top + rect.height / 2 - 18, left: rect.left - 3 }}
              />
              <div
                title="Drag to resize width"
                onPointerDown={startWidthResize('right')}
                className="pointer-events-auto absolute h-9 w-[6px] cursor-col-resize rounded-full border border-white bg-[var(--org-primary-color)] shadow-sm"
                style={{ top: rect.top + rect.height / 2 - 18, left: rect.left + rect.width - 3 }}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// Native WYSIWYG multiple-choice editing: option rows styled exactly like the
// player, inline-editable text, hover controls inside the row.
function McqBlockCanvas({ block, page, selected, readOnly, onPatch }: any) {
  const content = block.content || {}
  const options = normalizeQuestionOptions(content.options)
  const scoring = getBlockScoring(page, block)
  const completion = getBlockCompletion(page, block)
  const correctIds = new Set<string>((scoring.correct_option_ids || scoring.correctOptionIds || []).map(String))
  const variableBindings = completion.variable_bindings || completion.variableBindings || {}
  const isVariableMode = (completion.question_mode || (Object.values(variableBindings.options || {}).some(Boolean) ? 'variable' : 'scored')) === 'variable'

  const updateOption = (id: string, text: string) => {
    onPatch({ content: { ...content, options: options.map((option) => option.id === id ? { ...option, text } : option) } })
  }
  const addOption = () => {
    onPatch({ content: { ...content, options: [...options, { id: createOptionId(), text: `Option ${options.length + 1}` }] } })
  }
  const removeOption = (id: string) => {
    if (options.length <= 2) return
    const nextOptions = options.filter((option) => option.id !== id)
    const variableBindings = completion.variable_bindings || completion.variableBindings || {}
    const nextOptionBindings = { ...(variableBindings.options || {}) }
    delete nextOptionBindings[id]
    onPatch({
      content: { ...content, options: nextOptions },
      scoring: { ...scoring, correct_option_ids: Array.from(correctIds).filter((item) => item !== id) },
      completion: {
        ...completion,
        min_selections: Math.min(Math.max(1, Number(completion.min_selections ?? 1)), nextOptions.length),
        max_selections: Math.min(Math.max(1, Number(completion.max_selections ?? 1)), nextOptions.length),
        variable_bindings: { ...variableBindings, options: nextOptionBindings },
      },
    })
  }
  const toggleCorrect = (id: string) => {
    const maxSelections = Math.max(1, Number(completion.max_selections ?? 1))
    const next = new Set(correctIds)
    if (next.has(id)) next.delete(id)
    else {
      if (maxSelections <= 1) next.clear()
      next.add(id)
    }
    onPatch({ scoring: { ...scoring, mode: 'points', score_policy: 'exact_match', correct_option_ids: Array.from(next) } })
  }

  return (
    <div className="space-y-3 py-1">
      {readOnly ? (
        content.label ? <p className="text-lg font-bold text-gray-900">{content.label}</p> : null
      ) : (
        <AutoGrowTextarea
          value={content.label || ''}
          onChange={(event) => onPatch({ content: { ...content, label: event.target.value } })}
          placeholder="Question label"
          minRows={1}
          className="w-full resize-none overflow-hidden bg-transparent text-lg font-bold leading-7 text-gray-900 outline-none placeholder:text-gray-300"
        />
      )}
      {options.map((option: any, index: number) => {
        const correct = !isVariableMode && correctIds.has(option.id)
        return (
          <div
            key={option.id}
            className={`group/option flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition ${correct ? 'border-emerald-300' : 'border-gray-200'}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${correct ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'}`}>
              {String.fromCharCode(65 + index)}
            </span>
            {readOnly ? (
              <span className="min-w-0 flex-1 whitespace-pre-wrap text-gray-900">{option.text || `Option ${index + 1}`}</span>
            ) : (
              <AutoGrowTextarea
                value={option.text || ''}
                onChange={(event) => updateOption(option.id, event.target.value)}
                placeholder={`Option ${index + 1}`}
                minRows={1}
                className="min-h-6 min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-gray-900 outline-none placeholder:text-gray-400"
              />
            )}
            {!readOnly && (
              <span className={`flex shrink-0 items-center gap-1 transition ${correct && !isVariableMode ? '' : 'opacity-0 group-hover/option:opacity-100'}`}>
                {!isVariableMode && (
                  <button
                    type="button"
                    title={correct ? 'Correct answer' : 'Mark as correct'}
                    onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); toggleCorrect(option.id) }}
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${correct ? 'bg-emerald-100 text-emerald-700' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-600'}`}
                  >
                    <Check size={15} />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete option"
                  disabled={options.length <= 2}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); removeOption(option.id) }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 hover:bg-gray-100 hover:text-red-600 disabled:opacity-0"
                >
                  <Trash2 size={15} />
                </button>
              </span>
            )}
          </div>
        )
      })}
      {!readOnly && selected && (
        <button
          type="button"
          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); addOption() }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white/60 p-3 text-sm font-bold text-gray-500 transition hover:border-gray-400 hover:text-gray-700"
        >
          <Plus size={15} />
          Add option
        </button>
      )}
    </div>
  )
}

// Native WYSIWYG text-input editing. One block is one row: a single input, or
// two side by side (toggled from the block toolbar).
function TextInputBlockCanvas({ block, page, selected: _selected, readOnly, onPatch }: any) {
  const content = block.content || {}
  const inputs = normalizeQuestionInputs(content.inputs)
  const scoring = getBlockScoring(page, block)
  const sideBySide = inputs.length > 1

  const patchInput = (id: string, patch: any) => {
    onPatch({ content: { ...content, inputs: inputs.map((input) => input.id === id ? { ...input, ...patch } : input) } })
  }

  const startHeightResize = (startEvent: React.PointerEvent) => {
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const startHeight = Math.max(48, Number(inputs[0]?.height) || 160)
    document.body.style.cursor = 'row-resize'
    const onMove = (event: PointerEvent) => {
      const nextHeight = Math.round(Math.max(48, Math.min(420, startHeight + event.clientY - startY)))
      onPatch({
        content: {
          ...content,
          inputs: inputs.map((input) => ({
            ...input,
            height: nextHeight,
            variant: nextHeight <= 56 ? 'single_line' : 'short_answer',
          })),
        },
      })
    }
    const onUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="group/inputs relative py-1">
      {readOnly ? (
        content.label ? <p className="mb-2 text-lg font-bold leading-7 text-gray-900">{content.label}</p> : null
      ) : (
        <AutoGrowTextarea
          value={content.label || ''}
          onChange={(event) => onPatch({ content: { ...content, label: event.target.value } })}
          placeholder="Question label"
          minRows={1}
          className="mb-2 w-full resize-none overflow-hidden bg-transparent text-lg font-bold leading-7 text-gray-900 outline-none placeholder:text-gray-300"
        />
      )}
      <div className={`grid gap-3 ${sideBySide ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {inputs.map((input: any, index: number) => {
          const height = Math.max(48, Number(input.height) || 160)
          const singleLine = input.variant === 'single_line' || height <= 56
          const fieldClassName = 'w-full rounded-xl border border-gray-200 bg-white text-gray-950 shadow-sm outline-none placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]'
          return (
            <div key={input.id} className="min-w-0">
              {readOnly ? (
                input.label ? <p className="mb-2 text-lg font-bold leading-7 text-gray-900">{input.label}</p> : null
              ) : (
                <AutoGrowTextarea
                  value={input.label || ''}
                  onChange={(event) => patchInput(input.id, { label: event.target.value })}
                  placeholder={`Input label ${sideBySide ? index + 1 : ''}`.trim()}
                  minRows={1}
                  className="mb-2 w-full resize-none overflow-hidden bg-transparent text-lg font-bold leading-7 text-gray-900 outline-none placeholder:text-gray-300"
                />
              )}
              {singleLine ? (
                <input
                  readOnly={readOnly}
                  value={input.placeholder || ''}
                  onChange={(event) => patchInput(input.id, { placeholder: event.target.value })}
                  placeholder="Placeholder text"
                  style={{ height }}
                  className={`${fieldClassName} px-4`}
                />
              ) : (
                <textarea
                  readOnly={readOnly}
                  value={input.placeholder || ''}
                  onChange={(event) => patchInput(input.id, { placeholder: event.target.value })}
                  placeholder="Placeholder text"
                  style={{ height }}
                  className={`${fieldClassName} resize-none p-4`}
                />
              )}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <div
          title="Drag to resize height"
          onPointerDown={startHeightResize}
          className="absolute inset-x-0 -bottom-1 z-10 flex h-4 cursor-row-resize items-end justify-center"
        >
          <span className="h-1.5 w-12 rounded-full bg-gray-950/40 opacity-0 shadow-sm ring-1 ring-white/70 transition group-hover/inputs:opacity-100" />
        </div>
      )}
      {!readOnly && scoring.mode === 'manual' && (
        <p className="mt-2 text-xs font-semibold text-gray-500">Reviewed manually after submission.</p>
      )}
    </div>
  )
}

function ImageUploadBlockCanvas({ block, readOnly, onPatch }: any) {
  const content = block.content || {}
  return (
    <div className="py-1">
      {readOnly ? (
        content.label ? <p className="mb-2 text-lg font-bold leading-7 text-gray-900">{content.label}</p> : null
      ) : (
        <AutoGrowTextarea
          value={content.label || ''}
          onChange={(event) => onPatch({ content: { ...content, label: event.target.value } })}
          placeholder="Question label"
          minRows={1}
          className="mb-2 w-full resize-none overflow-hidden bg-transparent text-lg font-bold leading-7 text-gray-900 outline-none placeholder:text-gray-300"
        />
      )}
      <div className="flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white text-sm font-bold text-gray-500 shadow-sm">
        <Upload size={22} />
        Image upload
      </div>
    </div>
  )
}

function AutoGrowTextarea({
  value,
  minRows = 1,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null)

  React.useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={minRows}
      style={{ ...style, minHeight: `${minRows * 1.75}rem` }}
    />
  )
}

function TextBlockEditor({ block, selected, readOnly = false, onEditorReady, onPatch }: { block: LearningTextBlock; selected: boolean; readOnly?: boolean; onEditorReady?: (editor: any) => void; onPatch: (patch: Partial<LearningTextBlock>) => void }) {
  const nodes = React.useMemo(() => getTextBlockNodes(block), [block])
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        codeBlock: false,
        trailingNode: false,
      }),
      Placeholder.configure({
        placeholder: 'Type here...',
        showOnlyWhenEditable: false,
      }),
      LearningTextAlign,
    ],
    content: { type: 'doc', content: nodes },
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
    },
    onFocus: () => null,
    onUpdate: ({ editor }) => {
      const nextNodes = editor.getJSON().content || [EMPTY_PARAGRAPH]
      onPatch({ content: { ...(block.content || {}), node: nextNodes[0] || EMPTY_PARAGRAPH, nodes: nextNodes } })
    },
  }, [block.id])

  React.useEffect(() => {
    if (!editor || editor.isFocused) return
    const next = { type: 'doc', content: nodes }
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next)
    }
  }, [editor, nodes])

  // Surface the tiptap instance to the screen-space overlay's format toolbar.
  React.useEffect(() => {
    if (!selected || !editor || readOnly) return
    onEditorReady?.(editor)
    return () => onEditorReady?.(null)
  }, [selected, editor, readOnly, onEditorReady])

  return (
    <div className="rounded-lg px-2 py-1">
      {/* Same typography class the player uses so the canvas stays WYSIWYG. */}
      <EditorContent editor={editor} className="learning-info-text-block" />
    </div>
  )
}

function ImageBlockEditor({ block, selected = false, readOnly = false, onPatch, onRequestImageUpload }: { block: LearningImageBlock; selected?: boolean; readOnly?: boolean; onPatch: (patch: any) => void; onRequestImageUpload: () => void }) {
  const src = block.content?.src || ''
  const height = Math.max(80, Number(block.design?.height) || 220)
  const circle = (block.design as any)?.shape === 'circle'
  const fit = circle || (block.design as any)?.fit === 'cover' ? 'object-cover' : 'object-contain'
  return (
    <figure className={`relative max-w-full overflow-hidden border border-gray-200 bg-gray-100 ${circle ? 'mx-auto aspect-square rounded-full' : 'w-full rounded-lg'}`} style={circle ? { width: height, height } : { height }}>
      {src ? (
        <img src={src} alt={block.content?.alt || ''} className={`h-full w-full max-w-full ${fit}`} />
      ) : block.content?.binding ? (
        <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm font-bold text-violet-700">Dynamic image<br/>{block.content.binding.fallback || block.content.binding.path}</div>
      ) : (
        <button onClick={onRequestImageUpload} disabled={readOnly} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:bg-gray-50">
          <Upload size={22} />
          Add image
        </button>
      )}
      {src && !readOnly && (
        <button onClick={onRequestImageUpload} className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-700 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100">
          Replace
        </button>
      )}
      {!readOnly && (
        <div
          title="Drag to resize height"
          className="absolute inset-x-0 bottom-0 z-10 flex h-4 cursor-row-resize items-end justify-center pb-1"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const startY = event.clientY
            const startHeight = height
            document.body.style.cursor = 'row-resize'
            const onMove = (moveEvent: PointerEvent) => {
              onPatch({ design: { ...(block.design || {}), height: Math.max(80, Math.min(620, startHeight + moveEvent.clientY - startY)) } })
            }
            const onUp = () => {
              document.body.style.cursor = ''
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
        >
          <span className={`h-1.5 w-12 rounded-full bg-gray-950/40 shadow-sm ring-1 ring-white/70 transition ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
        </div>
      )}
    </figure>
  )
}

function InlineInsertMenu({ onInsert, canAddQuestion, alwaysVisible = false }: { onInsert: (type: 'text' | 'image' | 'button' | 'multiple_choice' | 'categorized_multi_select' | 'text_input' | 'image_upload') => void; canAddQuestion: boolean; alwaysVisible?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const revealed = open || alwaysVisible
  return (
    <div className="group/insert flex h-5 w-full items-center justify-center" onMouseDown={(event) => event.stopPropagation()}>
      <span className={`h-px flex-1 transition ${revealed ? 'bg-[var(--org-primary-color)]' : 'bg-transparent group-hover/insert:bg-[var(--org-primary-color)]'}`} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={`mx-1 flex h-5 w-5 items-center justify-center rounded-full border transition ${
              revealed
                ? 'border-[var(--org-primary-color)] bg-white text-[var(--org-primary-color)]'
                : 'border-transparent bg-transparent text-transparent group-hover/insert:border-[var(--org-primary-color)] group-hover/insert:bg-white group-hover/insert:text-[var(--org-primary-color)]'
            }`}
            title="Insert block here"
          >
            <Plus size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => onInsert('text')}>
            <FileText size={15} className="mr-2" />
            Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert('image')}>
            <ImageIcon size={15} className="mr-2" />
            Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert('button')}>
            <MousePointerClick size={15} className="mr-2" />
            Page button
          </DropdownMenuItem>
          {canAddQuestion && (
            <>
              <DropdownMenuItem onClick={() => onInsert('multiple_choice')}>
                <ListChecks size={15} className="mr-2" />
                Multiple choice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert('categorized_multi_select')}>
                <ListChecks size={15} className="mr-2" />
                Categorized multi-select
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert('text_input')}>
                <FileText size={15} className="mr-2" />
                Text input
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert('image_upload')}>
                <Upload size={15} className="mr-2" />
                Image upload
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className={`h-px flex-1 transition ${revealed ? 'bg-[var(--org-primary-color)]' : 'bg-transparent group-hover/insert:bg-[var(--org-primary-color)]'}`} />
    </div>
  )
}

// The surrounding LearningActivitySurface already draws the theater chrome
// (progress bar, footer) for video pages — this is just the editable body.
function VideoCanvasPage({ page, onPatchPage }: any) {
  const videoUrl = page.content?.video_url || ''
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 px-6 text-white">
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 text-center">
        {videoUrl ? (
          <div className="px-6">
            <Video size={42} className="mx-auto mb-3 text-white/60" />
            <p className="break-all text-sm font-bold text-white/80">{videoUrl}</p>
          </div>
        ) : (
          <p className="text-sm font-bold text-white/50">Paste a video URL below</p>
        )}
      </div>
      <input
        value={videoUrl}
        onChange={(event) => onPatchPage({ content: { ...(page.content || {}), video_url: event.target.value } })}
        placeholder="Video URL"
        className="h-10 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
      />
    </div>
  )
}

function CanvasControls({ zoom, setZoom, handMode, setHandMode }: any) {
  return (
    <>
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

function InspectorPanel({
  page,
  block,
  pages,
  variantKey,
  setVariantKey,
  onSelectVariant,
  onDisableVariant,
  onToggleSideBySide,
  learningVariables,
  onCreateVariableKey,
  onPatchPage,
  onPatchBlock,
  onRequestImageUpload,
}: any) {
  return (
    <aside className="h-full w-full overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[11px] font-bold uppercase text-gray-500">{block ? block.type : page?.page_type || 'Page'}</p>
        <p className="mt-1 truncate text-base font-bold">{block ? blockLabel(block) : page?.title || 'Untitled page'}</p>
      </div>
      {block ? (
        <BlockInspector
          block={block}
          page={page}
          pages={pages}
          learningVariables={learningVariables}
          onCreateVariableKey={onCreateVariableKey}
          onPatchBlock={onPatchBlock}
          onPatchPage={onPatchPage}
          onToggleSideBySide={onToggleSideBySide}
          onRequestImageUpload={onRequestImageUpload}
        />
      ) : (
        <PageInspector page={page} pages={pages} variantKey={variantKey} setVariantKey={setVariantKey} onSelectVariant={onSelectVariant} onDisableVariant={onDisableVariant} onPatchPage={onPatchPage} />
      )}
    </aside>
  )
}

function PageInspector({ page, pages, variantKey, setVariantKey, onSelectVariant, onDisableVariant, onPatchPage }: any) {
  if (!page) return null
  const hasVariants = Boolean(page.content?.variants)
  const design = page.design || {}
  const patchDesign = (patch: any) => onPatchPage({ design: { ...design, ...patch } })
  return (
    <div className="space-y-6 p-5">
      <InspectorSection label="Page">
        <TextField label="Title" value={page.title || ''} onChange={(value) => onPatchPage({ title: value })} />
        <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="font-bold text-gray-700">Required</span>
          <input type="checkbox" checked={page.required !== false} onChange={(event) => onPatchPage({ required: event.target.checked })} />
        </label>
      </InspectorSection>
      {page.page_type !== 'video' && (
        <InspectorSection label="Appearance">
          <ColorField
            label="Background accent"
            value={design.background_accent_color || ''}
            fallback="#f8fafc"
            onChange={(value) => patchDesign({ background_accent_color: value })}
          />
        </InspectorSection>
      )}
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
          {findQuestionBlock(page) ? (
            <p className="text-xs font-medium leading-5 text-gray-500">Pages with question blocks cannot have variants. Variants show different content based on an earlier question&apos;s answer.</p>
          ) : (
            <VariantControls
              page={page}
              pages={pages}
              variantKey={variantKey}
              setVariantKey={setVariantKey}
              onSelectVariant={onSelectVariant}
              onDisableVariant={onDisableVariant}
              onPatchPage={onPatchPage}
            />
          )}
        </InspectorSection>
      )}
    </div>
  )
}

function VariantControls({ page, pages, variantKey, setVariantKey, onSelectVariant, onDisableVariant, onPatchPage }: any) {
  const variants = page.content?.variants || {}
  const overrides = variants.overrides || {}
  const hasVariants = Boolean(page.content?.variants)
  const availableSources = getVariantSourceOptions(pages, page)
  const activeSource = getVariantSource(pages, page)
  const sourceValue = hasVariants && activeSource ? `${activeSource.pageUuid}::${activeSource.blockId}` : ''
  const enabled = hasVariants ? getEnabledVariantKeys(page, activeSource) : []
  const enabledKeys = new Set(enabled.map((item) => item.key))
  const addable = getVariantKeyList(activeSource).filter((item) => !enabledKeys.has(item.key))

  const setSource = (value: string) => {
    if (!value) {
      // "None" turns variants off entirely.
      const { variants: _variants, ...content } = page.content || {}
      onPatchPage({ content })
      setVariantKey('default')
      return
    }
    const [pageUuid, blockId] = value.split('::')
    onPatchPage({
      content: {
        ...(page.content || {}),
        variants: {
          source: { page_uuid: pageUuid, block_id: blockId },
          overrides,
        },
      },
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Source question</FieldLabel>
        <select
          value={sourceValue}
          onChange={(event) => setSource(event.target.value)}
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
        >
          <option value="">None</option>
          {availableSources.map((item) => (
            <option key={`${item.pageUuid}::${item.blockId}`} value={`${item.pageUuid}::${item.blockId}`}>
              {item.label}{item.isPrior ? '' : ' (after this page)'}
            </option>
          ))}
        </select>
        {!availableSources.length && (
          <p className="mt-2 text-xs font-medium text-gray-500">Add a single-select multiple choice question to an earlier page first.</p>
        )}
      </div>
      {hasVariants && activeSource && !activeSource.isPrior && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Source question is after this page. Move it earlier for learner variants to resolve.
        </p>
      )}
      {hasVariants && (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {enabled.map((item) => (
              <span
                key={item.key}
                className={`flex h-8 items-center overflow-hidden rounded-lg border text-xs font-bold ${variantKey === item.key ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
              >
                <button onClick={() => onSelectVariant(item.key)} className="h-full px-2">
                  {item.label}
                </button>
                {item.key !== 'default' && (
                  <button
                    title="Disable this variant"
                    onClick={() => onDisableVariant(item.key)}
                    className={`flex h-full items-center pr-1.5 ${variantKey === item.key ? 'text-white/60 hover:text-white' : 'text-gray-300 hover:text-red-600'}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {addable.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Enable a variant" className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700">
                    <Plus size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {addable.map((item) => (
                    <DropdownMenuItem key={item.key} onClick={() => onSelectVariant(item.key)}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <p className="text-xs leading-5 text-gray-500">Learners see the variant matching their answer on the source question; unmatched answers fall back to Default.</p>
        </>
      )}
    </div>
  )
}

function BlockInspector({ block, page, pages, learningVariables, onCreateVariableKey, onPatchBlock, onPatchPage, onToggleSideBySide, onRequestImageUpload }: any) {
  const design = block.design || {}
  const patchDesign = (patch: any) => onPatchBlock(block.id, { design: { ...design, ...patch } })
  if (block.system?.locked) {
    return <div className="p-5"><div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="flex items-center gap-2 text-sm font-bold text-gray-800"><Lock size={15} /> Locked system block</div><p className="mt-2 text-xs leading-5 text-gray-600">{block.system.reason || 'This block is managed by the portfolio activity and cannot be configured in the editor.'}</p></div></div>
  }
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
          <SegmentedControl
            label="Fit"
            value={design.fit === 'cover' ? 'cover' : 'contain'}
            options={[
              { value: 'contain', label: 'Contain' },
              { value: 'cover', label: 'Cover' },
            ]}
            onChange={(value) => patchDesign({ fit: value })}
          />
          <SegmentedControl
            label="Frame"
            value={design.shape === 'circle' ? 'circle' : 'rounded'}
            options={[{ value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }]}
            onChange={(value) => patchDesign({ shape: value })}
          />
          <FieldLabel>Dynamic source</FieldLabel>
          <select value={block.content?.binding?.source || ''} onChange={(event) => onPatchBlock(block.id, { content: { ...(block.content || {}), binding: event.target.value ? { source: event.target.value, path: '', fallback: '' } : undefined } })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm">
            <option value="">Static image</option><option value="answer">Prior answer</option><option value="variable">User variable</option>
          </select>
          {block.content?.binding && <><TextField label="Source path" value={block.content.binding.path || ''} onChange={(value) => onPatchBlock(block.id, { content: { ...(block.content || {}), binding: { ...block.content.binding, path: value } } })} /><TextField label="Fallback URL" value={block.content.binding.fallback || ''} onChange={(value) => onPatchBlock(block.id, { content: { ...(block.content || {}), binding: { ...block.content.binding, fallback: value } } })} /></>}
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
      {block.type === 'text' && (
        <InspectorSection label="Appearance">
          <ColorField
            label="Text color"
            value={design.text_color || ''}
            fallback="#4b5563"
            onChange={(value) => patchDesign({ text_color: value })}
          />
          <button type="button" onClick={() => onPatchBlock(block.id, { content: { node: { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding: { source: 'answer', path: '', fallback: 'Your answer' } } }] }, nodes: [{ type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding: { source: 'answer', path: '', fallback: 'Your answer' } } }] }] } })} className="h-10 w-full rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">Use a dynamic value</button>
          {block.content?.nodes?.[0]?.content?.[0]?.type === 'displayBinding' && <><select value={block.content.nodes[0].content[0].attrs?.binding?.source || 'answer'} onChange={(event) => { const binding = { ...block.content.nodes[0].content[0].attrs.binding, source: event.target.value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"><option value="answer">Prior answer</option><option value="variable">User variable</option></select><TextField label="Source path" value={block.content.nodes[0].content[0].attrs?.binding?.path || ''} onChange={(value) => { const binding = { ...block.content.nodes[0].content[0].attrs.binding, path: value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} /><TextField label="Fallback text" value={block.content.nodes[0].content[0].attrs?.binding?.fallback || ''} onChange={(value) => { const binding = { ...block.content.nodes[0].content[0].attrs.binding, fallback: value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} /></>}
        </InspectorSection>
      )}
      {block.type === 'button' && <InspectorSection label="Page button"><TextField label="Label" value={block.content?.label || ''} onChange={(value) => onPatchBlock(block.id, { content: { ...(block.content || {}), label: value } })} /><label className="grid gap-2 text-xs font-bold text-gray-500">Destination page<select value={block.content?.destination_page_uuid || ''} onChange={(event) => onPatchBlock(block.id, { content: { ...(block.content || {}), destination_page_uuid: event.target.value } })} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-normal text-gray-900"><option value="">Choose a page</option>{(pages || []).map((item: any) => <option key={item.page_uuid} value={item.page_uuid}>{item.title}</option>)}</select></label><SegmentedControl label="Style" value={design.variant === 'primary' ? 'primary' : 'secondary'} options={[{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }]} onChange={(value) => patchDesign({ variant: value })} /><SegmentedControl label="Layout" value={design.group ? 'grouped' : 'solo'} options={[{ value: 'solo', label: 'Solo' }, { value: 'grouped', label: 'Side by side' }]} onChange={(value) => patchDesign({ group: value === 'grouped' ? `button_group_${page.page_uuid}` : undefined })} /><p className="text-xs leading-5 text-gray-500">Grouped page buttons share one responsive row. Direction icons are added automatically.</p></InspectorSection>}
      {block.type === 'question' && (
        <QuestionInspector
          block={block}
          page={page}
          learningVariables={learningVariables}
          onCreateVariableKey={onCreateVariableKey}
          onPatchBlock={onPatchBlock}
          onPatchPage={onPatchPage}
          onToggleSideBySide={onToggleSideBySide}
        />
      )}
    </div>
  )
}

function QuestionInspector({ block, page, learningVariables = [], onCreateVariableKey, onPatchBlock, onToggleSideBySide }: any) {
  const content = block.content || {}
  // Question config lives on the block (with page-level fallback for old data).
  const scoring = getBlockScoring(page, block)
  const completion = getBlockCompletion(page, block)
  const variableBindings = completion.variable_bindings || completion.variableBindings || {}
  const hasBindings = Object.values(variableBindings.options || {}).some(Boolean)
    || Object.values(variableBindings.inputs || {}).some(Boolean)
    || Boolean(variableBindings.image)
  const questionMode: 'scored' | 'variable' = completion.question_mode || (hasBindings ? 'variable' : 'scored')
  const patchQuestion = (patch: any) => onPatchBlock(block.id, patch)
  const patchContent = (patch: any) => patchQuestion({ content: { ...content, ...patch } })
  const patchScoring = (patch: any) => patchQuestion({ scoring: { ...scoring, ...patch } })
  const patchCompletion = (patch: any) => patchQuestion({ completion: { ...completion, ...patch } })
  const patchVariableBindings = (patch: any) => patchCompletion({ variable_bindings: { ...variableBindings, ...patch } })
  const labelSection = (
    <InspectorSection label="Question">
      <TextAreaField
        label="Label"
        value={content.label || ''}
        onChange={(value) => patchContent({ label: value })}
        placeholder="Question label"
        rows={2}
      />
    </InspectorSection>
  )

  // Scored questions grade answers and award points; variable questions just
  // store what the learner chose/typed. Switching modes clears the other side.
  const setQuestionMode = (value: string) => {
    const mode = value === 'variable' ? 'variable' : 'scored'
    if (mode === questionMode) return
    if (mode === 'variable') {
      patchQuestion({
        scoring: { ...scoring, mode: 'off', points: 0, correct_option_ids: [] },
        completion: { ...completion, question_mode: 'variable' },
      })
    } else {
      patchQuestion({
        scoring: ['multiple_choice', 'categorized_multi_select'].includes(block.kind)
          ? { ...scoring, mode: 'points', points: Number(scoring.points) || 1, score_policy: 'exact_match' }
          : { ...scoring, mode: 'completion', points: Number(scoring.points) || 1 },
        completion: { ...completion, question_mode: 'scored', variable_bindings: {} },
      })
    }
  }

  if (block.kind === 'multiple_choice' || block.kind === 'categorized_multi_select') {
    const options = normalizeQuestionOptions(content.options)
    const correctIds = new Set<string>(scoring.correct_option_ids || scoring.correctOptionIds || [])
    const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
    const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 1))
    const optionBindings = variableBindings.options || {}
    // One variable per question: every option binds the same target, and the
    // selected option labels are written as a list.
    const activeBinding = normalizeBinding(Object.values(optionBindings).find(Boolean))
    const updateOption = (id: string, patch: any) => patchContent({ options: options.map((option) => option.id === id ? { ...option, ...patch } : option) })
    const addOption = () => patchContent({ options: [...options, { id: createOptionId(), text: `Option ${options.length + 1}` }] })
    const removeOption = (id: string) => {
      if (options.length <= 2) return
      const nextOptions = options.filter((option) => option.id !== id)
      const nextOptionBindings = { ...optionBindings }
      delete nextOptionBindings[id]
      patchQuestion({
        content: { ...content, options: nextOptions },
        scoring: { ...scoring, correct_option_ids: Array.from(correctIds).filter((item) => item !== id) },
        completion: {
          ...completion,
          min_selections: Math.min(minSelections, nextOptions.length),
          max_selections: Math.min(maxSelections, nextOptions.length),
          variable_bindings: { ...variableBindings, options: nextOptionBindings },
        },
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
    const setMcqVariableTarget = (target: string) => {
      if (!target) {
        patchVariableBindings({ options: {} })
        return
      }
      const nextOptions: Record<string, any> = {}
      options.forEach((option) => {
        nextOptions[option.id] = [{ target }]
      })
      patchVariableBindings({ options: nextOptions, options_value_mode: 'selected_text_list' })
    }

    return (
      <>
        {labelSection}
        <InspectorSection label="Answers">
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.id} className={`grid items-center gap-2 ${questionMode === 'scored' ? 'grid-cols-[2rem_1fr_2rem_2rem]' : 'grid-cols-[2rem_1fr_2rem]'}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold">{String.fromCharCode(65 + index)}</span>
                <input
                  value={option.text || ''}
                  onChange={(event) => updateOption(option.id, { text: event.target.value })}
                  className="h-9 min-w-0 rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
                {questionMode === 'scored' && (
                  <button
                    onClick={() => toggleCorrect(option.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border ${correctIds.has(option.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    title="Correct answer"
                  >
                    <Check size={15} />
                  </button>
                )}
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
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Min selections" type="number" value={String(minSelections)} onChange={(value) => patchCompletion({ min_selections: Math.max(1, Number(value)) })} />
            <TextField label="Max selections" type="number" value={String(maxSelections)} onChange={(value) => patchCompletion({ max_selections: Math.max(1, Number(value)) })} />
          </div>
        </InspectorSection>
        <InspectorSection label="Response handling">
          <SegmentedControl
            label="Mode"
            value={questionMode}
            options={[
              { value: 'scored', label: 'Scored' },
              { value: 'variable', label: 'Variable' },
            ]}
            onChange={setQuestionMode}
          />
          {questionMode === 'scored' ? (
            <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ mode: 'points', points: Number(value), score_policy: 'exact_match' })} />
          ) : (
            <>
              <div>
                <FieldLabel>Store answer in</FieldLabel>
                <VariablePathPicker
                  value={activeBinding?.target || ''}
                  variables={learningVariables}
                  acceptedTypes={['text', 'number', 'boolean', 'option']}
                  createValueType="text"
                  onBind={setMcqVariableTarget}
                  onCreateVariableKey={onCreateVariableKey}
                />
              </div>
            </>
          )}
        </InspectorSection>
      </>
    )
  }

  if (block.kind === 'image_upload') {
    const imageBindings = variableBindings.image || {}
    const activeBinding = normalizeBinding(imageBindings)
    return (
      <>
        {labelSection}
        <InspectorSection label="Image upload">
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="font-bold text-gray-700">Required</span>
            <input
              type="checkbox"
              checked={completion.required !== false}
              onChange={(event) => patchCompletion({ required: event.target.checked })}
            />
          </label>
        </InspectorSection>
        <InspectorSection label="Response handling">
          <SegmentedControl
            label="Mode"
            value={questionMode}
            options={[
              { value: 'scored', label: 'Scored' },
              { value: 'variable', label: 'Variable' },
            ]}
            onChange={setQuestionMode}
          />
          {questionMode === 'scored' ? (
            <>
              <SegmentedControl
                label="Grading"
                value={scoring.mode === 'manual' ? 'manual' : 'completion'}
                options={[
                  { value: 'completion', label: 'On completion' },
                  { value: 'manual', label: 'Manual review' },
                ]}
                onChange={(value) => patchScoring({ mode: value })}
              />
              <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ points: Number(value) })} />
            </>
          ) : (
            <div>
              <FieldLabel>Store image in</FieldLabel>
              <VariablePathPicker
                value={activeBinding?.target || ''}
                variables={learningVariables}
                acceptedTypes={['image']}
                createValueType="image"
                onBind={(target: string) => patchVariableBindings({ image: target ? [{ target }] : null })}
                onCreateVariableKey={onCreateVariableKey}
              />
            </div>
          )}
        </InspectorSection>
      </>
    )
  }

  const inputs = normalizeQuestionInputs(content.inputs)
  const rules = completion.inputs || {}
  const sideBySide = inputs.length === 2
  const inputBindings = variableBindings.inputs || {}
  const patchInput = (id: string, patch: any) => patchContent({ inputs: inputs.map((input) => input.id === id ? { ...input, ...patch } : input) })
  const patchInputRule = (id: string, patch: any) => patchCompletion({ inputs: { ...rules, [id]: { ...(rules[id] || {}), ...patch } } })

  return (
    <>
      {labelSection}
      <InspectorSection label={sideBySide ? 'Inputs (side by side)' : 'Input'}>
        {inputs.length <= 2 && <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="font-bold text-gray-700">Two inputs side by side</span>
          <input type="checkbox" checked={sideBySide} onChange={onToggleSideBySide} />
        </label>}
        <div className="space-y-3">
          {inputs.map((input) => {
            const rule = rules[input.id] || {}
            return (
              <div key={input.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
                <input
                  value={input.label || ''}
                  onChange={(event) => patchInput(input.id, { label: event.target.value })}
                  placeholder="Label"
                  className="h-9 w-full rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-[var(--org-primary-color)]"
                />
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
                    value={input.variant === 'single_line' || Number(input.height) <= 56 ? 'single_line' : 'short_answer'}
                    onChange={(event) => {
                      const variant = event.target.value
                      patchInput(input.id, {
                        variant,
                        height: variant === 'single_line' ? 48 : Math.max(120, Number(input.height) || 160),
                      })
                    }}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs font-bold outline-none focus:border-[var(--org-primary-color)]"
                  >
                    <option value="single_line">Single line</option>
                    <option value="short_answer">Multi line</option>
                  </select>
                  <label className="block text-[10px] font-bold uppercase text-gray-400">
                    Min words
                    <input type="number" value={Number(rule.min_words || 0)} onChange={(event) => patchInputRule(input.id, { min_words: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs normal-case text-gray-900 outline-none" />
                  </label>
                  <label className="block text-[10px] font-bold uppercase text-gray-400">
                    Max words
                    <input type="number" value={Number(rule.max_words || 0)} onChange={(event) => patchInputRule(input.id, { max_words: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs normal-case text-gray-900 outline-none" />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </InspectorSection>
      <InspectorSection label="Response handling">
        <SegmentedControl
          label="Mode"
          value={questionMode}
          options={[
            { value: 'scored', label: 'Scored' },
            { value: 'variable', label: 'Variable' },
          ]}
          onChange={setQuestionMode}
        />
        {questionMode === 'scored' ? (
          <>
            <SegmentedControl
              label="Grading"
              value={scoring.mode === 'manual' ? 'manual' : 'completion'}
              options={[
                { value: 'completion', label: 'On completion' },
                { value: 'manual', label: 'Manual review' },
              ]}
              onChange={(value) => patchScoring({ mode: value })}
            />
            <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ points: Number(value) })} />
          </>
        ) : (
          <>
            <div className="space-y-2">
              {inputs.map((input) => {
                const binding = normalizeBinding(inputBindings[input.id])
                return (
                  <div key={input.id}>
                    <FieldLabel>{sideBySide ? `Store "${input.label || 'Response'}" in` : 'Store answer in'}</FieldLabel>
                    <VariablePathPicker
                      value={binding?.target || ''}
                      variables={learningVariables}
                      acceptedTypes={['text', 'number', 'boolean', 'option']}
                      createValueType="text"
                      onBind={(target: string) => {
                        const nextInputs = { ...inputBindings }
                        if (!target) delete nextInputs[input.id]
                        else nextInputs[input.id] = [{ target }]
                        patchVariableBindings({ inputs: nextInputs })
                      }}
                      onCreateVariableKey={onCreateVariableKey}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </InspectorSection>
    </>
  )
}

function TextAreaField({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="min-h-20 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-[var(--org-primary-color)]"
      />
    </div>
  )
}

function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  const color = isHexColor(value) ? value : fallback
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 rounded-lg border border-gray-200 bg-white p-1"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-gray-50">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''))
}

function VariableCreateInline({ value, onChange, onCreate }: any) {
  return (
    <div className="flex gap-2">
      <input
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Create: personality.traits.style"
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-[var(--org-primary-color)]"
      />
      <button onClick={onCreate} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50">Create</button>
    </div>
  )
}

function normalizeBinding(value: any) {
  if (Array.isArray(value)) return value[0] || null
  if (value && typeof value === 'object') return value
  return null
}

function variableTarget(key: string) {
  return `user.details.variables.${key}`
}

function formatVariableOptionLabel(key: string) {
  const parts = String(key || '').split('.').filter(Boolean)
  if (parts.length <= 1) return key
  return `${'  '.repeat(parts.length - 1)}${parts.at(-1)} (${key})`
}

function ActivitySettingsView({
  activity,
  gradingSettings,
  learningVariables,
  variableDraftKey,
  setVariableDraftKey,
  onPatchActivity,
  onPatchGrading,
  onCreateVariable,
  onPatchVariable,
  onDeleteVariable,
}: any) {
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
                <TextField label="Minimum score (%)" type="number" value={String(gradingSettings.minimum_score_percent ?? 70)} onChange={(value) => onPatchGrading({ minimum_score_percent: Math.max(0, Math.min(100, Number(value))) })} />
                <TextField label="Success message" value={gradingSettings.success_message || ''} onChange={(value) => onPatchGrading({ success_message: value })} />
                <TextField label="Failure message" value={gradingSettings.failure_message || ''} onChange={(value) => onPatchGrading({ failure_message: value })} />
              </>
            )}
          </div>
        </section>
        <section>
          <h2 className="text-lg font-bold">Variables</h2>
          <div className="mt-5 space-y-4">
            <VariableCreateInline value={variableDraftKey} onChange={setVariableDraftKey} onCreate={onCreateVariable} />
            <VariableRegistry variables={learningVariables} onPatchVariable={onPatchVariable} onDeleteVariable={onDeleteVariable} />
          </div>
        </section>
      </div>
    </main>
  )
}

function VariableRegistry({ variables = [], onPatchVariable, onDeleteVariable }: any) {
  const sorted = [...variables].sort((a: any, b: any) => String(a.key).localeCompare(String(b.key)))
  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm font-medium text-gray-500">
        No custom variables yet.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {sorted.map((variable: any) => {
        const key = String(variable.key || '')
        const depth = Math.max(0, key.split('.').length - 1)
        return (
          <div key={variable.variable_uuid || key} className="grid grid-cols-[1fr_10rem_2.5rem] items-center gap-2 border-b border-gray-100 p-3 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800" style={{ paddingLeft: depth * 14 }}>{key}</p>
              <input
                value={variable.label || ''}
                onChange={(event) => onPatchVariable(variable, { label: event.target.value })}
                placeholder="Label"
                className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-[var(--org-primary-color)]"
              />
            </div>
            <select
              value={variable.value_type || variable.valueType || 'text'}
              onChange={(event) => onPatchVariable(variable, { value_type: event.target.value })}
              className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-bold outline-none focus:border-[var(--org-primary-color)]"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="option">Option</option>
              <option value="image">Image</option>
            </select>
            <IconButton title="Delete variable" onClick={() => onDeleteVariable(variable)}><Trash2 size={15} /></IconButton>
          </div>
        )
      })}
    </div>
  )
}

function PreviewModal({ pages, selectedPage, onClose }: any) {
  const initialIndex = Math.max(0, pages.findIndex((page: any) => page.page_uuid === selectedPage?.page_uuid))
  const [index, setIndex] = React.useState(initialIndex)
  const [answer, setAnswer] = React.useState<any>({})
  const [unlocked, setUnlocked] = React.useState(false)
  const [attempts, setAttempts] = React.useState<any[]>([])
  const page = pages[index]

  React.useEffect(() => {
    setAnswer({})
    setUnlocked(Boolean(page) && !findQuestionBlock(page))
  }, [page?.page_uuid])

  // Grade locally so variant pages resolve the same way they will at runtime.
  const completeAndNext = () => {
    if (!page) return
    const questions = findQuestionBlocks(page)
    if (questions.length) {
      const questionResults: Record<string, any> = {}
      questions.forEach((question: any) => {
        const sub = answer?.questions?.[question.id] || {}
        const scoring = getBlockScoring(page, question)
        const correct = (scoring.correct_option_ids || []).map(String)
        const selected = (sub.option_ids || []).map(String)
        const isCorrect = correct.length
          ? correct.length === selected.length && correct.every((id: string) => selected.includes(id))
          : null
        questionResults[question.id] = {
          option_ids: selected,
          selected,
          inputs: sub.inputs || {},
          is_correct: isCorrect,
          grading_status: 'graded',
        }
      })
      const correctness = Object.values(questionResults).map((result: any) => result.is_correct).filter((value) => value !== null)
      setAttempts((current) => [...current, {
        result: {
          page_uuid: page.page_uuid,
          questions: questionResults,
          grading_status: 'graded',
          ...(questions.length === 1 ? questionResults[questions[0].id] : {}),
        },
        is_correct: correctness.length ? correctness.every(Boolean) : null,
      }])
    }
    if (index < pages.length - 1) setIndex(index + 1)
    else onClose()
  }

  const [device, setDevice] = React.useState<DeviceMode>('mobile')
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 })
  React.useEffect(() => {
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  // Identical frame + scaling math to the editor canvas so the preview looks
  // exactly like what you were just editing.
  const frame = DEVICE_FRAMES[device]
  const frameShellHeight = device === 'mobile' ? frame.height + MOBILE_FRAME_CAP * 2 : frame.height
  const scale = viewport.width && viewport.height
    ? Math.min(1, (viewport.width - 96) / frame.width, (viewport.height - 112) / frameShellHeight)
    : 1

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 p-6">
      <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
        <div className="grid w-48 grid-cols-2 rounded-xl border border-white/10 bg-white/10 p-1 backdrop-blur">
          <DeviceModeButton active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={<Smartphone size={14} />} label="Mobile" />
          <DeviceModeButton active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={<Monitor size={14} />} label="Desktop" />
        </div>
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20" title="Close preview">
          <X size={17} />
        </button>
      </div>
      <div
        style={{
          width: frame.width,
          height: frameShellHeight,
          minWidth: frame.width,
          minHeight: frameShellHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className={`${device === 'mobile' ? 'rounded-[2rem] bg-black p-[10px]' : 'rounded-xl bg-white'} relative shrink-0 shadow-2xl ring-8 ring-white/10`}
      >
        <div
          className={`${device === 'mobile' ? 'rounded-[1.45rem]' : 'rounded-xl'} overflow-hidden bg-[var(--org-page-background)]`}
          style={device === 'mobile' ? { height: frame.height, marginTop: MOBILE_FRAME_CAP - 10 } : { height: frame.height }}
        >
          {surface}
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
