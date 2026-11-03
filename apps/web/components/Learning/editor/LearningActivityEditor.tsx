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
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  GripVertical,
  ClipboardCheck,
  Hand,
  Image as ImageIcon,
  Layers3,
  ListChecks,
  Lock,
  Monitor,
  MousePointer2,
  MousePointerClick,
  Pencil,
  Play,
  Settings2,
  Plus,
  Smartphone,
  TextCursorInput,
  Trash2,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useSWR from 'swr'
import { PAGE_TEMPLATES_KEY, getPageTemplates } from '@services/learning/pageTemplates'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import {
  createLearningPage,
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
  getBlockCompletion,
  getBlockScoring,
  type LearningBlock,
  type LearningImageBlock,
  type LearningQuestionBlock,
  type LearningTextBlock,
} from '@components/Learning/schema'
import { LearningActivitySurface } from '@components/Learning/player/ActivitySurface'
import { ContentIssuesBanner } from './ContentIssuesBanner'
import { BlockDesignFields, ColorField, PageDesignFields } from './DesignInspector'
import type { DeviceMode, SaveState, Selection } from './types'
import {
  EMPTY_PARAGRAPH,
  activityHasScoredQuestions,
  blockLabel,
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
  getTextBlockNodes,
  getQuestionConfigurationIssue,
  mergePatch,
  normalizeInitialPages,
  normalizeQuestionInputs,
  normalizeQuestionOptions,
} from './utils'
import {
  DeviceModeButton,
  FieldLabel,
  IconButton,
  InspectorSection,
  SaveStateLabel,
  SegmentedControl,
  TextField,
} from './ui'
import { DEVICE_FRAMES, MOBILE_FRAME_CAP } from './constants'
import { PageRail, followLabel, pageHeading, type RailMode } from './PageRail'
import { NewPageDialog } from './EditorDialogs'
import { ActivitySettingsDialog } from './ActivitySettings'
import { GradingView } from './GradingView'
import { VideoCaptionsCanvas } from './VideoCaptionsCanvas'
import type { PageDraft } from './pageTemplates'
import { flowVariables } from './flowVariables'
import { branchVariable, freshRule, operandOf } from './branchRules'
import {
  addBranchAfter,
  addPath,
  findBranch,
  insertAfter,
  linearSequence,
  movePage,
  orderedPageUuids,
  reconcile,
  removeBranch,
  removePage as removeSequencePage,
  removePath,
  sequenceIssues,
  setBranchOn,
  setPathRule,
  type Where,
} from './sequence'
import { VariablePathPicker } from './VariablePathPicker'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import type { MediaAsset } from '@services/media/library'
import { TimelineCardView, type TimelineEntry } from '@components/Pages/Portfolio/Timeline'
import { EditorPreviewModal } from '@components/Learning/player/EditorPreviewModal'
import StoryBlock, { STORY_BLOCKS } from '@components/Learning/player/StoryBlocks'
import PageBlock, { PAGE_BLOCKS } from '@components/Learning/player/PageBlocks'
import { LearningTextStyle } from '@components/Learning/textMarks'
import { DisplayBindingNode } from '@components/Learning/displayBindingNode'
import { SelectionToolbar, type InsertType } from './SelectionToolbar'
import type { Sequence } from '@components/Learning/generated/content'

/** Edits one activity in place. `ownerName` is the plan template it belongs to; `orgId` owns its variables and media. */
export default function LearningActivityEditor({
  ownerName,
  orgId,
  activity,
}: {
  ownerName: string
  orgId: number
  activity: any
}) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const { data: servedTemplates } = useSWR(accessToken ? [PAGE_TEMPLATES_KEY, accessToken] : null, () => getPageTemplates(accessToken))
  // The editor works on a sequence: the stored one, else the one the server converted from an older flow.
  const [activityState, setActivityState] = React.useState(() => ({
    ...activity,
    settings: {
      ...(activity.settings || {}),
      sequence: reconcile(activity.settings?.sequence || activity.sequence || linearSequence((activity.pages || []).map((page: any) => page.page_uuid)), (activity.pages || []).map((page: any) => page.page_uuid)),
    },
  }))
  const [railMode, setRailMode] = React.useState<RailMode>('pages')
  const [grading, setGrading] = React.useState(false)
  const [newPageOpen, setNewPageOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [pickingBackgroundFor, setPickingBackgroundFor] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState<any[]>(() => normalizeInitialPages(activity.pages || []))
  const [selection, setSelection] = React.useState<Selection>(() => ({
    pageUuid: orderedPageUuids(activity.settings?.sequence || activity.sequence || { items: [] })[0] || (activity.pages || [])[0]?.page_uuid,
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
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [uploadingBlockId, setUploadingBlockId] = React.useState<string | null>(null)
  const [selectingVideoPageUuid, setSelectingVideoPageUuid] = React.useState<string | null>(null)
  const [hoveredBlockId, setHoveredBlockId] = React.useState<string | null>(null)
  const [draggingBlockId, setDraggingBlockId] = React.useState<string | null>(null)
  const [activeTextEditor, setActiveTextEditor] = React.useState<any>(null)
  const blockElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const blockClipboardRef = React.useRef<LearningBlock | null>(null)
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const mediaInputRef = React.useRef<HTMLInputElement | null>(null)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const activitySaveTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const pendingPagePatchesRef = React.useRef<Record<string, any>>({})
  const pendingActivityPatchRef = React.useRef<Record<string, any>>({})
  const invalidSequenceRef = React.useRef(false)
  const legacyTextLabelPageUuidsRef = React.useRef<string[]>(
    (activity.pages || [])
      .filter((page: any) => {
        const stacks = [
          page.content?.blocks,
          ...Object.values(page.content?.variants?.overrides || {}).map((override: any) => override?.blocks),
        ]
        return stacks.some((blocks: any) => Array.isArray(blocks) && blocks.some((block: any) => (
          block?.type === 'question'
          && block?.kind === 'text_input'
          && Object.prototype.hasOwnProperty.call(block.content || {}, 'label')
        )))
      })
      .map((page: any) => page.page_uuid),
  )

  const selectedPage = pages.find((page) => page.page_uuid === selection.pageUuid) || pages[0]
  const selectedBlock = selectedPage ? getEditorBlocks(selectedPage, variantKey).find((block) => block.id === selection.blockId) || null : null
  const frame = DEVICE_FRAMES[device]
  const frameShellHeight = device === 'mobile' ? frame.height + MOBILE_FRAME_CAP * 2 : frame.height
  const gradingSettings = getActivityGradingSettings(activityState)
  const hasScoredQuestions = activityHasScoredQuestions(pages)
  const sequence: Sequence = activityState.settings.sequence
  const pageOrder = React.useMemo(() => orderedPageUuids(sequence), [sequence])
  const currentSequenceIssues = React.useMemo(() => sequenceIssues(sequence), [sequence])
  const branchVariables = React.useMemo(() => flowVariables(pages, learningVariables), [learningVariables, pages])

  React.useEffect(() => {
    invalidSequenceRef.current = currentSequenceIssues.length > 0
  }, [currentSequenceIssues])

  React.useEffect(() => {
    setVariantKey('default')
  }, [selection.pageUuid])

  React.useEffect(() => {
    if (!orgId || !accessToken) return
    getLearningVariables(orgId, accessToken)
      .then((items) => setLearningVariables(Array.isArray(items) ? items : []))
      .catch(() => setLearningVariables([]))
  }, [accessToken, orgId])

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
  }, [device, frame.height, frame.width, frameShellHeight, railMode])

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
    const flush = (event?: BeforeUnloadEvent) => {
      void flushPendingPages()
      void flushPendingActivity()
      if ((invalidSequenceRef.current || Object.keys(pendingPagePatchesRef.current).length || Object.keys(pendingActivityPatchRef.current).length) && event) {
        event.preventDefault()
        event.returnValue = ''
      }
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

  React.useEffect(() => {
    const pageUuids = legacyTextLabelPageUuidsRef.current
    legacyTextLabelPageUuidsRef.current = []
    pageUuids.forEach((pageUuid) => {
      const page = pages.find((item) => item.page_uuid === pageUuid)
      if (page) schedulePageSave(pageUuid, { content: page.content })
    })
  }, [pages, schedulePageSave])

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
        version: page.content?.version === 3 ? 3 : 2,
        blocks,
      },
    })
  }, [pages, patchPage, variantKey])

  const insertBlock = (type: InsertType, afterBlockId?: string | null) => {
    if (!selectedPage || selectedPage.page_type !== 'standard') return
    if ((type === 'multiple_choice' || type === 'categorized_multi_select' || type === 'text_input' || type === 'image_upload') && selectedPage.content?.variants) {
      toast.error('Variant pages cannot contain question blocks')
      return
    }
    const blocks = getEditorBlocks(selectedPage, variantKey)
    const block: any = type === 'text'
      ? createTextBlock()
      : type === 'image'
        ? createImageBlock()
        : type === 'button'
          ? createButtonBlock()
          : type === 'number'
            ? { id: createBlockId(), type: 'number', content: { value: 100, label: '' } }
            : type === 'card_deck'
              ? { id: createBlockId(), type: 'card_deck', content: { cards: [{ id: createOptionId(), title: 'First thing', body: 'One sentence about it.' }, { id: createOptionId(), title: 'Second thing', body: 'One sentence about it.' }] } }
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

  const patchPageBlock = (pageUuid: string, blockId: string, patch: any) => {
    const page = pages.find((item) => item.page_uuid === pageUuid)
    if (page) setBlocks(pageUuid, getEditorBlocks(page, 'default').map((block) => block.id === blockId ? ({ ...block, ...patch } as LearningBlock) : block))
  }

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return
    const target = getEditorBlocks(selectedPage, variantKey).find((block) => block.id === blockId)
    if (target?.system?.locked) return
    if ((target as any)?.type === 'heading' && selectedPage.content?.version === 3) {
      toast.error('Every page keeps its heading')
      return
    }
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

  const copySelectedBlock = React.useCallback(() => {
    if (!selectedBlock || selectedBlock.system?.locked) return false
    blockClipboardRef.current = cloneJson(selectedBlock)
    toast.success('Block copied')
    return true
  }, [selectedBlock])

  const pasteCopiedBlock = React.useCallback(() => {
    const copiedBlock = blockClipboardRef.current
    if (!copiedBlock || !selectedPage || selectedPage.page_type !== 'standard') return false
    if (copiedBlock.type === 'question' && selectedPage.content?.variants) {
      toast.error('Variant pages cannot contain question blocks')
      return true
    }
    const blocks = getEditorBlocks(selectedPage, variantKey)
    const selectedIndex = selection.blockId
      ? blocks.findIndex((block) => block.id === selection.blockId)
      : -1
    const clone = { ...cloneJson(copiedBlock), id: createBlockId() } as LearningBlock
    const nextBlocks = [...blocks]
    nextBlocks.splice(selectedIndex >= 0 ? selectedIndex + 1 : blocks.length, 0, clone)
    setBlocks(selectedPage.page_uuid, nextBlocks)
    setSelection({ pageUuid: selectedPage.page_uuid, blockId: clone.id })
    toast.success('Block pasted')
    return true
  }, [selectedPage, selection.blockId, setBlocks, variantKey])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (railMode !== 'pages' || event.altKey || (!event.ctrlKey && !event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return
      const key = event.key.toLowerCase()
      if (key === 'c' && copySelectedBlock()) event.preventDefault()
      if (key === 'v' && pasteCopiedBlock()) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelectedBlock, pasteCopiedBlock, railMode])

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
    const inputs = normalizeQuestionInputs(question.content?.inputs || [])
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

  // The order saves with the activity; a branch rule still being filled in waits until it's complete.
  const changeSequence = (next: Sequence) => {
    const settings = { ...(activityState.settings || {}), sequence: next }
    setActivityState((current: any) => ({ ...current, settings }))
    const issues = sequenceIssues(next)
    invalidSequenceRef.current = issues.length > 0
    if (issues.length) {
      setSaveState('dirty')
      return
    }
    scheduleActivitySave({ settings })
  }

  const addPage = async (draft: PageDraft) => {
    try {
      await saveBeforeAction()
      const page = await createLearningPage({ activity_uuid: activity.activity_uuid, ...draft }, accessToken)
      setPages((current) => [...current, ...normalizeInitialPages([page])])
      changeSequence(insertAfter(sequence, page.page_uuid, selectedPage?.page_uuid))
      setSelection({ pageUuid: page.page_uuid, blockId: null })
      setRailMode('pages')
      setGrading(false)
      setLastSavedAt(new Date())
      return page
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
      }, accessToken)
      setPages((current) => [...current, ...normalizeInitialPages([duplicate])])
      changeSequence(insertAfter(sequence, duplicate.page_uuid, page.page_uuid))
      setSelection({ pageUuid: duplicate.page_uuid, blockId: null })
      setLastSavedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'Failed to duplicate page')
    }
  }

  const removePage = async (page: any) => {
    if (!confirm(`Delete "${pageHeading(page)}"?`)) return
    try {
      await saveBeforeAction()
      await deleteLearningPage(page.page_uuid, accessToken)
      const remaining = pages.filter((item) => item.page_uuid !== page.page_uuid)
      const next = removeSequencePage(sequence, page.page_uuid)
      setPages(remaining)
      changeSequence(next)
      if (selection.pageUuid === page.page_uuid) setSelection({ pageUuid: orderedPageUuids(next)[0] || remaining[0]?.page_uuid, blockId: null })
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete page')
    }
  }

  const movePageTo = (pageUuid: string, where: Where) => changeSequence(movePage(sequence, pageUuid, where))

  const addBranch = () => {
    const { sequence: next, lifted } = addBranchAfter(sequence, selectedPage?.page_uuid)
    changeSequence(next)
    setRailMode('branches')
    if (lifted) toast("Branches can't go inside a path, so this one goes after the branch your page is in.")
  }

  const followInBranch = (branchId: string, variable: any) => {
    const on = operandOf(variable)
    const taken: any[] = []
    let next = setBranchOn(sequence, branchId, on, followLabel(variable), () => {
      const rule = freshRule(variable, on, taken)
      taken.push(rule.right ?? rule.condition?.right)
      return rule
    })
    // A new branch gets its first path as soon as it knows what to follow.
    if (!findBranch(next, branchId)?.paths.some((path) => path.rule)) next = addPath(next, branchId, freshRule(variable, on))
    changeSequence(next)
  }

  // "Branch" on a question or button: a branch right after its page, following it.
  const branchFromBlock = (block: any) => {
    if (!selectedPage) return
    const key = block.type === 'button' ? `${selectedPage.page_uuid}.button`
      : block.kind === 'text_input' ? `${selectedPage.page_uuid}.result.questions.${block.id}.inputs.${block.content?.inputs?.[0]?.id}.text`
        : `${selectedPage.page_uuid}.result.questions.${block.id}.option_ids`
    const variable = branchVariables.find((item) => item.key === key)
    if (!variable) {
      toast.error('Give the question its options or inputs first')
      return
    }
    const { sequence: withBranch, branch, lifted } = addBranchAfter(sequence, selectedPage.page_uuid)
    const on = operandOf(variable)
    const taken: any[] = []
    let next = setBranchOn(withBranch, branch.id, on, followLabel(variable), () => null)
    next = addPath(next, branch.id, freshRule(variable, on, taken))
    changeSequence(next)
    setRailMode('branches')
    if (lifted) toast("Branches can't go inside a path, so this one goes after the branch your page is in.")
  }

  const addBranchPath = (branchId: string) => {
    const branch = findBranch(sequence, branchId)
    if (!branch) return
    const variable = branchVariable(branch, branchVariables)
    const on = branch.on || (variable ? operandOf(variable) : { source: 'answer' as const, key: '' })
    const taken = branch.paths.map((path: any) => path.rule?.right ?? path.rule?.condition?.right).filter((value) => value !== undefined)
    changeSequence(addPath(sequence, branchId, variable ? freshRule(variable, on, taken) : { op: 'eq', left: on, right: '' }))
  }

  const removeBranchPath = (branchId: string, pathId: string) => {
    const path = findBranch(sequence, branchId)?.paths.find((item) => item.id === pathId)
    changeSequence(removePath(sequence, branchId, pathId))
    if (path?.pages?.length) toast('Path removed. Its pages moved to Default.')
  }

  const deleteBranch = (branchId: string) => {
    const before = sequence
    const branch = findBranch(sequence, branchId)
    changeSequence(removeBranch(sequence, branchId))
    const kept = branch?.paths.some((path) => path.pages?.length)
    toast((item) => (
      <span className="flex items-center gap-3 text-sm">
        {kept ? 'Branch removed. Its pages stay, in order, for everyone.' : 'Branch removed.'}
        <button className="font-bold text-sky-700" onClick={() => { changeSequenceRef.current(before); toast.dismiss(item.id) }}>Undo</button>
      </span>
    ), { duration: 6000 })
  }
  const changeSequenceRef = React.useRef(changeSequence)
  changeSequenceRef.current = changeSequence

  const patchActivityBasics = (patch: Record<string, any>) => {
    setActivityState((current: any) => ({ ...current, ...patch }))
    scheduleActivitySave(patch)
  }

  const patchGradingSettings = (patch: Record<string, any>) => {
    const currentGrading = { ...(activityState.settings?.grading || {}) }
    delete currentGrading.mode
    const settings = {
      ...(activityState.settings || {}),
      grading: {
        ...currentGrading,
        ...gradingSettings,
        ...patch,
      },
    }
    setActivityState((current: any) => ({ ...current, settings }))
    scheduleActivitySave({ settings })
  }

  const applySavedActivity = (saved: any) => { setActivityState((current: any) => ({ ...current, ...(saved || {}) })); setPages(normalizeInitialPages(saved?.pages || [])) }
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
    if (invalidSequenceRef.current && !confirm("A branch rule isn't finished, so the page order hasn't been saved. Leave anyway?")) return
    try {
      await saveBeforeAction()
      router.back()
    } catch (error: any) {
      toast.error(error?.message || 'Save failed')
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

  const handleVideoAssetPicked = (asset: MediaAsset) => {
    if (!selectingVideoPageUuid) return
    const page = pages.find((item) => item.page_uuid === selectingVideoPageUuid)
    if (!page) return
    patchPage(selectingVideoPageUuid, {
      content: {
        ...(page.content || {}),
        video_url: asset.url,
        video_asset_uuid: asset.asset_uuid,
      },
    })
    setSelectingVideoPageUuid(null)
  }

  const createVariableFromKey = async (rawKey: string, valueType = 'text', label?: string) => {
    const key = String(rawKey || '').trim()
    if (!key || !orgId || !accessToken) return null
    if (learningVariables.some((variable) => String(variable.key) === key)) {
      toast.error('Variable key already exists')
      return null
    }
    try {
      const variable = await createLearningVariable({
        org_id: orgId,
        key,
        label: label || key.split('.').at(-1) || key,
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
      <ContentIssuesBanner activityUuid={activityState.activity_uuid} pages={pages} accessToken={accessToken} refreshKey={lastSavedAt} beforeRepair={saveBeforeAction} onRepaired={applySavedActivity} />
      <EditorHeader
        ownerName={ownerName}
        activity={activityState}
        device={device}
        setDevice={setDevice}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        onBack={goBack}
        onTitle={(title: string) => patchActivityBasics({ title })}
        onSettings={() => setSettingsOpen(true)}
        onPreview={() => setPreviewOpen(true)}
        grading={grading}
        onGrading={() => setGrading((on) => !on)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
      <input ref={mediaInputRef} type="file" accept="image/*" className="hidden" onChange={handleMediaPicked} />
      <MediaPickerDialog
        open={Boolean(uploadingBlockId)}
        onOpenChange={(open) => {
          if (!open) setUploadingBlockId(null)
        }}
        title="Choose image"
        description="Upload, link, or select an image from the media library."
        onSave={handleMediaAssetPicked}
        owner={{ type: 'org', id: orgId }}
        mediaType="image"
        accessToken={accessToken}
      />
      <MediaPickerDialog
        open={Boolean(selectingVideoPageUuid)}
        onOpenChange={(open) => {
          if (!open) setSelectingVideoPageUuid(null)
        }}
        title="Choose video"
        description="Upload a video, add an external link, or choose one from the media library."
        onSave={handleVideoAssetPicked}
        owner={{ type: 'org', id: orgId }}
        mediaType="video"
        accessToken={accessToken}
      />
      <MediaPickerDialog
        open={Boolean(pickingBackgroundFor)}
        onOpenChange={(open) => {
          if (!open) setPickingBackgroundFor(null)
        }}
        title="Background photo"
        description="Upload, link, or select a photo. Text on it turns light."
        onSave={(asset: any) => {
          const page = pages.find((item) => item.page_uuid === pickingBackgroundFor)
          if (page) patchPage(page.page_uuid, { design: { ...(page.design || {}), background: { ...(page.design?.background || {}), image: asset.url } } })
          setPickingBackgroundFor(null)
        }}
        owner={{ type: 'org', id: orgId }}
        mediaType="image"
        accessToken={accessToken}
      />
      {grading ? (
        <GradingView
          pages={pages}
          pageOrder={pageOrder}
          grading={gradingSettings}
          defaults={servedTemplates?.defaults}
          onPatchGrading={patchGradingSettings}
          onPatchBlock={patchPageBlock}
          onAddQuestion={(draft) => { void addPage(draft) }}
          onShowOnPage={(pageUuid, blockId) => { setGrading(false); setRailMode('pages'); setSelection({ pageUuid, blockId }) }}
        />
      ) : railMode !== 'pages' ? (
        <div className="flex min-h-0 flex-1">
          <PageRail
              mode={railMode}
              onMode={setRailMode}
              sequence={sequence}
              pages={pages}
              settings={activityState.settings}
              selectedUuid={selectedPage?.page_uuid}
              variables={branchVariables}
              issues={currentSequenceIssues}
              onSelect={(pageUuid: string) => setSelection({ pageUuid, blockId: null })}
              onMove={movePageTo}
              onNewPage={() => setNewPageOpen(true)}
              onNewBranch={addBranch}
              onDuplicate={duplicatePage}
              onRemove={removePage}
              onFollow={followInBranch}
              onRule={(branchId: string, pathId: string, rule: any) => changeSequence(setPathRule(sequence, branchId, pathId, rule))}
              onAddPath={addBranchPath}
              onRemovePath={removeBranchPath}
              onRemoveBranch={deleteBranch}
            />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div style={{ width: leftWidth }} className="relative shrink-0">
            <PageRail
                mode={railMode}
                onMode={setRailMode}
                sequence={sequence}
                pages={pages}
                settings={activityState.settings}
                selectedUuid={selectedPage?.page_uuid}
                variables={branchVariables}
                issues={currentSequenceIssues}
                onSelect={(pageUuid: string) => setSelection({ pageUuid, blockId: null })}
                onMove={movePageTo}
                onNewPage={() => setNewPageOpen(true)}
                onNewBranch={addBranch}
                onDuplicate={duplicatePage}
                onRemove={removePage}
                onFollow={followInBranch}
                onRule={(branchId: string, pathId: string, rule: any) => changeSequence(setPathRule(sequence, branchId, pathId, rule))}
                onAddPath={addBranchPath}
                onRemovePath={removeBranchPath}
                onRemoveBranch={deleteBranch}
              />
            <PanelResizeHandle side="right" onPointerDown={(event) => resizePanel('left', event)} />
          </div>
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <SelectionToolbar
              page={selectedPage}
              block={selectedBlock}
              textEditor={activeTextEditor}
              inspectorOpen={inspectorOpen}
              onToggleInspector={() => setInspectorOpen((open) => !open)}
              onInsert={(type) => insertBlock(type, selection.blockId)}
              onPatchPage={patchSelectedPage}
              onPatchBlock={patchBlock}
              onDuplicate={() => selectedBlock && duplicateBlock(selectedBlock.id)}
              onRemove={() => selectedBlock && removeBlock(selectedBlock.id)}
              onBranchFrom={branchFromBlock}
              onToggleSideBySide={() => selectedBlock && toggleSideBySide(selectedBlock.id)}
              onReplaceImage={requestImageUpload}
              onReplaceVideo={() => selectedPage && setSelectingVideoPageUuid(selectedPage.page_uuid)}
              onBackgroundImage={() => selectedPage && setPickingBackgroundFor(selectedPage.page_uuid)}
              onShowDesktop={() => setDevice('desktop')}
              info={{ variables: learningVariables, pages, pageOrder, onCreateDetail: (key, label) => createVariableFromKey(key, 'text', label) }}
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
                  backgroundColor: 'var(--color-gray-100)',
                  backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--color-gray-500) 35%, transparent) 1px, transparent 1px)',
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
                    pageIndex={Math.max(0, pageOrder.indexOf(selectedPage?.page_uuid))}
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
                    onRequestVideo={() => selectedPage && setSelectingVideoPageUuid(selectedPage.page_uuid)}
                  />
                </div>
              </div>
              <BlockOverlay
                selectedPage={selectedPage}
                selectedBlock={selectedBlock}
                hoveredBlockId={hoveredBlockId}
                draggingBlockId={draggingBlockId}
                blockElsRef={blockElsRef}
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
          {inspectorOpen && <div style={{ width: rightWidth }} className="relative shrink-0">
            <PanelResizeHandle side="left" onPointerDown={(event) => resizePanel('right', event)} />
            <InspectorPanel
              page={selectedPage}
              block={selectedBlock}
              pages={pages}
              variantKey={variantKey}
              onToggleSideBySide={() => selectedBlock && toggleSideBySide(selectedBlock.id)}
              learningVariables={learningVariables}
              onCreateVariableKey={createVariableFromKey}
              onPatchPage={patchSelectedPage}
              onPatchBlock={patchBlock}
              onSelectBlock={(blockId: string | null) => selectedPage && setSelection({ pageUuid: selectedPage.page_uuid, blockId })}
              onRequestImageUpload={requestImageUpload}
              onRequestVideo={() => selectedPage && setSelectingVideoPageUuid(selectedPage.page_uuid)}
            />
          </div>}
        </div>
      )}

      </div>
      {newPageOpen && (
        <NewPageDialog
          where={selectedPage && pageOrder.includes(selectedPage.page_uuid) ? `after page ${pageOrder.indexOf(selectedPage.page_uuid) + 1}` : 'at the end'}
          settings={activityState.settings}
          served={servedTemplates}
          onClose={() => setNewPageOpen(false)}
          onPick={(draft) => { setNewPageOpen(false); void addPage(draft) }}
        />
      )}
      {settingsOpen && (
        <ActivitySettingsDialog
          activity={activityState}
          gradingSettings={gradingSettings}
          hasScoredQuestions={hasScoredQuestions}
          learningVariables={learningVariables}
          variableDraftKey={variableDraftKey}
          setVariableDraftKey={setVariableDraftKey}
          onPatchActivity={patchActivityBasics}
          onPatchGrading={patchGradingSettings}
          onCreateVariable={createVariable}
          onPatchVariable={patchVariable}
          onDeleteVariable={removeVariable}
          pages={pages}
          pageOrder={pageOrder}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {previewOpen && (
        <EditorPreviewModal activity={activityState} pages={pages} accessToken={accessToken} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}

function EditorHeader({ ownerName, activity, device, setDevice, saveState, lastSavedAt, onBack, onTitle, onSettings, onPreview, grading, onGrading }: any) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100" title="Back to the plan" aria-label="Back to the plan">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={activity.title || ''}
            onChange={(event) => onTitle(event.target.value)}
            placeholder="Untitled activity"
            aria-label="Activity title"
            className="block w-full max-w-md truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-bold outline-none hover:bg-gray-50 focus:bg-gray-50 focus:ring-1 focus:ring-gray-200"
          />
          <p className="truncate px-1 text-xs text-gray-500">{ownerName} · <SaveStateLabel state={saveState} lastSavedAt={lastSavedAt} /></p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="grid w-44 grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <DeviceModeButton active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={<Smartphone size={14} />} label="Phone" />
          <DeviceModeButton active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={<Monitor size={14} />} label="Desktop" />
        </div>
        <button onClick={onGrading} aria-pressed={grading} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition ${grading ? 'border-sky-600 bg-sky-50 text-sky-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
          <ClipboardCheck size={16} />
          Grading
        </button>
        <button onClick={onSettings} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
          <Settings2 size={16} />
          Activity settings
        </button>
        <button onClick={onPreview} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
          <Play size={15} />
          Play
        </button>
        <button onClick={onBack} className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-bold text-white transition hover:bg-gray-800">
          Done
        </button>
      </div>
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
  onRequestVideo,
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
              <VideoCaptionsCanvas page={page} device={device} onRequestVideo={onRequestVideo} onPatchPage={onPatchPage} onTextEditorReady={onTextEditorReady} />
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
  const breakAt = blocks.findIndex((block: any) => block.type === 'column_break')
  const columns = page?.design?.columns === 2 && breakAt >= 0
  // A list of blocks with a place to insert between them; `before` is the block a first insert goes after.
  const renderList = (list: LearningBlock[], before: string | null) => (
    <div>
      {list.map((block: LearningBlock, index: number) => (
        <React.Fragment key={block.id}>
          {(index > 0 || before) && (
            readOnly
              ? <div className="h-4" />
              : <InlineInsertMenu canAddQuestion={canAddQuestion} onInsert={(type: any) => onInsertBlock(type, index > 0 ? list[index - 1].id : before)} />
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
        <InlineInsertMenu canAddQuestion={canAddQuestion} onInsert={(type: any) => onInsertBlock(type, list.length ? list[list.length - 1].id : before)} alwaysVisible={blocks.length <= 2 || !list.length} />
      )}
    </div>
  )

  return (
    <div className="w-full" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onSelectPage?.()
    }}>
      <div className="w-full">
        {blocks.length ? (
          columns ? (
            // Two columns split at the column break, as the player lays them out on wide screens.
            <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2 @3xl:items-center @3xl:gap-12" data-page-columns="2">
              {[blocks.slice(0, breakAt), blocks.slice(breakAt + 1)].map((column, columnIndex) => (
                <div key={columnIndex} className="min-w-0">{renderList(column.filter((block: any) => block.type !== 'column_break'), columnIndex === 0 ? null : blocks[breakAt].id)}</div>
              ))}
            </div>
          ) : renderList(blocks.filter((block: any) => block.type !== 'column_break'), null)
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

// A card deck edits one card at a time: its name and sentence in place, with arrows and dots like the player.
function CardDeckCanvas({ block, readOnly, onPatch }: { block: any; readOnly: boolean; onPatch: (patch: any) => void }) {
  const cards: any[] = block.content?.cards || []
  const [index, setIndex] = React.useState(0)
  const at = Math.min(index, Math.max(0, cards.length - 1))
  const card = cards[at] || {}
  const setCard = (patch: any) => onPatch({ content: { ...(block.content || {}), cards: cards.map((item, cardIndex) => cardIndex === at ? { ...item, ...patch } : item) } })
  const remove = () => {
    onPatch({ content: { ...(block.content || {}), cards: cards.filter((_, cardIndex) => cardIndex !== at) } })
    setIndex(Math.max(0, at - 1))
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <input value={card.title || ''} readOnly={readOnly} onChange={(event) => setCard({ title: event.target.value })} placeholder="Card name" aria-label="Card name" className="w-full bg-transparent text-xl font-extrabold text-gray-950 outline-none placeholder:text-gray-300" />
        <AutoGrowTextarea value={card.body || ''} readOnly={readOnly} onChange={(event) => setCard({ body: event.target.value })} placeholder="One sentence about it" aria-label="Card sentence" className="mt-1 w-full resize-none bg-transparent text-sm leading-6 text-gray-600 outline-none placeholder:text-gray-300" />
        {!readOnly && cards.length > 1 && <button type="button" onClick={remove} aria-label="Delete this card" title="Delete this card" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600"><Trash2 size={14} /></button>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Previous card" disabled={at === 0} onClick={() => setIndex(at - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 disabled:opacity-30"><ChevronRight size={14} className="rotate-180" /></button>
        <span className="flex gap-1.5">{cards.map((item, cardIndex) => <button key={item.id || cardIndex} type="button" aria-label={`Card ${cardIndex + 1}`} onClick={() => setIndex(cardIndex)} className={`h-2 rounded-full transition-all ${cardIndex === at ? 'w-5 bg-[var(--org-primary-color)]' : 'w-2 bg-gray-300'}`} />)}</span>
        <button type="button" aria-label="Next card" disabled={at >= cards.length - 1} onClick={() => setIndex(at + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 disabled:opacity-30"><ChevronRight size={14} /></button>
      </div>
    </div>
  )
}

const HEADING_EDIT_SIZE: Record<string, string> = { s: 'text-xl', m: 'text-2xl', l: 'text-3xl', xl: 'text-4xl' }

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
    wholeBlockBinding(block)
      ? <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">{(block as any).content.nodes[0].content[0].attrs?.binding?.fallback || 'Dynamic value'}</div>
      : <TextBlockEditor block={block} selected={selected} readOnly={contentReadOnly} onEditorReady={onTextEditorReady} onPatch={onPatch} />
  ) : block.type === 'image' ? (
    <ImageBlockEditor block={block} selected={selected} readOnly={contentReadOnly} onPatch={onPatch} onRequestImageUpload={onRequestImageUpload} />
  ) : (block as any).type === 'heading' ? (
    <AutoGrowTextarea
      value={(block as any).content?.text || ''}
      readOnly={contentReadOnly}
      placeholder="Page heading"
      aria-label="Page heading"
      onChange={(event) => onPatch({ content: { ...((block as any).content || {}), text: event.target.value } })}
      className={`w-full resize-none bg-transparent font-extrabold leading-[1.1] tracking-tight outline-none placeholder:text-gray-300 ${HEADING_EDIT_SIZE[(block as any).content?.size || 'l'] || HEADING_EDIT_SIZE.l}`}
    />
  ) : (block as any).type === 'card_deck' ? (
    <CardDeckCanvas block={block} readOnly={contentReadOnly} onPatch={onPatch} />
  ) : PAGE_BLOCKS.has(block.type) ? (
    <PageBlock block={block} run={null} />
  ) : STORY_BLOCKS.has(block.type) ? (
    <StoryBlock block={block} run={null} />
  ) : block.type === 'button' ? (
    <button type="button" disabled className={`pointer-events-none min-h-11 rounded-full px-5 py-3 text-sm font-bold ${block.design?.variant === 'primary' ? 'bg-[var(--org-primary-color)] text-white' : 'border border-gray-200 bg-white text-gray-700 shadow-sm'}`}>{block.content?.label || 'Continue'}</button>
  ) : block.type === 'portfolio_preview' ? (
    <TimelineCardView preview entry={{ timeline_uuid: 'preview', slug: 'preview', entry_type: 'education', title: 'Your current experience', organization: 'Your school or organization', location_label: 'Your location', summary: 'Your story will appear here.', start_date: '2026-01', start_precision: 'month', is_current: true, revision: 1, cover_url: '', blocks: [], projects: [], project: [] } as TimelineEntry} />
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
function BlockOverlay({ selectedPage, selectedBlock, hoveredBlockId, draggingBlockId, blockElsRef, onStartDrag, onPatchBlock }: any) {
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

  const locked = Boolean(selectedBlock?.system?.locked)

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {rect && targetId && selectedPage && (
        <>
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
function McqBlockCanvas({ block, selected, readOnly, onPatch }: any) {
  const content = block.content || {}
  const options = normalizeQuestionOptions(content.options)
  const scoring = getBlockScoring(block)
  const completion = getBlockCompletion(block)
  const correctIds = new Set<string>((scoring.correct_option_ids || []).map(String))
  const variableBindings = completion.variable_bindings || {}
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
    const variableBindings = completion.variable_bindings || {}
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
    const next = new Set(correctIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onPatch({ scoring: { ...scoring, mode: 'points', score_policy: 'select_all', correct_option_ids: Array.from(next) } })
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
      {!readOnly && !isVariableMode && scoring.mode !== 'off' && Number(scoring.points ?? 1) > 0 && correctIds.size === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          No correct answers are selected. Learners cannot receive points for this question.
        </div>
      ) : null}
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
function TextInputBlockCanvas({ block, selected: _selected, readOnly, onPatch }: any) {
  const content = block.content || {}
  const inputs = normalizeQuestionInputs(content.inputs)
  const scoring = getBlockScoring(block)
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
                  type={input.input_type === 'number' ? 'number' : 'text'}
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
    const fit = () => {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
    fit()
    // Size and column changes wrap the text differently.
    const observer = new ResizeObserver(fit)
    observer.observe(textarea.parentElement || textarea)
    return () => observer.disconnect()
  }, [value, props.className])

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
      LearningTextStyle,
      DisplayBindingNode,
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

  // A text block that was just added is ready to type into.
  React.useEffect(() => {
    if (!selected || !editor || readOnly || !editor.isEmpty) return
    // Wait for the view to be on the page.
    const frame = requestAnimationFrame(() => editor.commands.focus('end'))
    return () => cancelAnimationFrame(frame)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

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
  onToggleSideBySide,
  learningVariables,
  onCreateVariableKey,
  onPatchPage,
  onPatchBlock,
  onSelectBlock,
  onRequestImageUpload,
  onRequestVideo,
}: any) {
  const title = block
    ? getInspectorBlockTitle(block)
    : String(page?.title || 'Untitled page')
  const patchTitle = (value: string) => {
    if (!block) {
      onPatchPage({ title: value })
      return
    }
    const content = block.content || {}
    if (block.type === 'question' && block.kind === 'text_input') {
      const inputs = normalizeQuestionInputs(content.inputs)
      onPatchBlock(block.id, { content: { ...content, inputs: inputs.map((input, index) => index === 0 ? { ...input, label: value } : input) } })
    } else if (block.type === 'question' || block.type === 'button') onPatchBlock(block.id, { content: { ...content, label: value } })
    else if (block.type === 'image') onPatchBlock(block.id, { content: { ...content, alt: value } })
    else onPatchBlock(block.id, { content: { ...content, editor_title: value } })
  }
  return (
    <aside className="h-full w-full overflow-y-auto border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-start gap-2">
          {block ? (
            <button type="button" onClick={() => onSelectBlock(null)} title="Back to page settings" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <ArrowLeft size={17} />
            </button>
          ) : (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-gray-500">
              {page?.page_type === 'video' ? <Video size={17} /> : <FileText size={17} />}
            </span>
          )}
          <EditableInspectorTitle value={title} fallback={block ? blockLabel(block) : 'Untitled page'} onChange={patchTitle} />
        </div>
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
        <PageInspector page={page} variantKey={variantKey} onPatchPage={onPatchPage} onSelectBlock={onSelectBlock} onRequestVideo={onRequestVideo} />
      )}
    </aside>
  )
}

function getInspectorBlockTitle(block: any): string {
  if (block?.type === 'question' && block.kind === 'text_input') {
    return String(block.content?.inputs?.[0]?.label || block.content?.editor_title || blockLabel(block))
  }
  if (block?.type === 'heading') return String(block.content?.text || blockLabel(block))
  return String(block?.content?.label || block?.content?.editor_title || block?.content?.alt || blockLabel(block))
}

function EditableInspectorTitle({ value, fallback, onChange }: { value: string; fallback: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = React.useState(false)
  return (
    <div className="min-w-0 flex-1">
      {editing ? (
        <AutoGrowTextarea
          autoFocus
          value={value}
          minRows={1}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false) }}
          className="min-h-8 w-full resize-none overflow-hidden rounded-md border border-gray-200 px-2 py-1 text-base font-bold leading-6 outline-none focus:border-[var(--org-primary-color)]"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="group/title flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-gray-50">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-base font-bold leading-6">{value || fallback}</span>
          <Pencil size={14} className="mt-1 shrink-0 text-gray-400 opacity-0 transition group-hover/title:opacity-100" />
        </button>
      )}
    </div>
  )
}

function PageInspector({ page, variantKey, onPatchPage, onSelectBlock, onRequestVideo }: any) {
  if (!page) return null
  const blocks = getEditorBlocks(page, variantKey)
  return (
    <div>
      <div className="p-5">
        <InspectorSection label="Settings">
        <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <span className="font-bold text-gray-700">Required</span>
          <input type="checkbox" checked={page.required !== false} onChange={(event) => onPatchPage({ required: event.target.checked })} />
        </label>
        {page.page_type !== 'video' && <PageDesignFields page={page} onPatchPage={onPatchPage} />}
        {page.page_type === 'video' && (
          <>
          <button type="button" onClick={onRequestVideo} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">
            <Upload size={16} />
            {page.content?.video_url ? 'Change video' : 'Choose video'}
          </button>
          {page.content?.video_url && <p className="break-all text-xs text-gray-500">{page.content.video_url}</p>}
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="font-bold text-gray-700">Allow scrubbing</span>
            <input type="checkbox" checked={page.content?.allow_scrubbing !== false} onChange={(event) => onPatchPage({ content: { ...(page.content || {}), allow_scrubbing: event.target.checked } })} />
          </label>
          </>
        )}
        </InspectorSection>
      </div>
      <div className="border-t border-gray-200 p-5">
        <InspectorSection label="Blocks">
          {blocks.length ? (
            <div className="space-y-2">
              {blocks.map((block: any) => (
                <PageBlockListItem key={block.id} page={page} block={block} onSelect={() => onSelectBlock(block.id)} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-500">No blocks on this page.</p>
          )}
        </InspectorSection>
      </div>
    </div>
  )
}

function PageBlockListItem({ page, block, onSelect }: any) {
  const issue = getQuestionConfigurationIssue(page, block)
  const title = block.type === 'text' ? getTextBlockListTitle(block) : getInspectorBlockTitle(block)
  const Icon = block.type === 'question'
    ? block.kind === 'text_input' ? TextCursorInput : block.kind === 'image_upload' ? Upload : ListChecks
    : block.type === 'image' ? ImageIcon : block.type === 'button' ? MousePointerClick : FileText
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5 text-left transition hover:border-gray-300 hover:bg-gray-50">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Icon size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span title={title} className="block min-w-0 flex-1 truncate text-sm font-bold leading-5">{title}</span>
          {issue ? <span title={issue} className="mt-0.5 shrink-0 text-amber-600"><AlertTriangle size={14} /></span> : null}
        </span>
        <span className="mt-0.5 block text-xs text-gray-500">{blockLabel(block)}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-gray-400" />
    </button>
  )
}

function getTextBlockListTitle(block: any): string {
  const title = getTextBlockNodes(block)
    .map((node) => getEditorNodePlainText(node))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return title || 'Text block'
}

/** An older text block that is nothing but one dynamic value (inline "Their info" chips carry a label). */
function wholeBlockBinding(block: any) {
  const only = block.content?.nodes?.length === 1 && block.content.nodes[0]?.content?.length === 1 ? block.content.nodes[0].content[0] : null
  return only?.type === 'displayBinding' && !only.attrs?.label
}

function getEditorNodePlainText(node: any): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getEditorNodePlainText).join(' ')
  if (typeof node === 'string') return node
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return ' '
  if (node.type === 'displayBinding') {
    const binding = node.attrs?.binding || node.attrs || {}
    return String(binding.fallback || binding.path || 'Dynamic text')
  }
  return getEditorNodePlainText(node.content)
}

function BlockInspector({ block, page, pages, learningVariables, onCreateVariableKey, onPatchBlock, onPatchPage, onToggleSideBySide, onRequestImageUpload }: any) {
  const design = block.design || {}
  const patchDesign = (patch: any) => onPatchBlock(block.id, { design: { ...design, ...patch } })
  const textBinding = block.type === 'text' && wholeBlockBinding(block)
    ? block.content.nodes[0].content[0].attrs?.binding
    : null
  const useStaticText = () => {
    const fallback = String(textBinding?.fallback || '')
    const node = {
      type: 'paragraph',
      ...(fallback ? { content: [{ type: 'text', text: fallback }] } : {}),
    }
    onPatchBlock(block.id, { content: { node, nodes: [node] } })
  }
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
          {textBinding ? (
            <>
              <button type="button" onClick={useStaticText} className="h-10 w-full rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">Use static text</button>
              <select value={textBinding.source || 'answer'} onChange={(event) => { const binding = { ...textBinding, source: event.target.value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"><option value="answer">Prior answer</option><option value="variable">User variable</option></select>
              <TextField label="Source path" value={textBinding.path || ''} onChange={(value) => { const binding = { ...textBinding, path: value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} />
              <TextField label="Fallback text" value={textBinding.fallback || ''} onChange={(value) => { const binding = { ...textBinding, fallback: value }; const node = { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding } }] }; onPatchBlock(block.id, { content: { node, nodes: [node] } }) }} />
            </>
          ) : (
            <button type="button" onClick={() => onPatchBlock(block.id, { content: { node: { type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding: { source: 'answer', path: '', fallback: 'Your answer' } } }] }, nodes: [{ type: 'paragraph', content: [{ type: 'displayBinding', attrs: { binding: { source: 'answer', path: '', fallback: 'Your answer' } } }] }] } })} className="h-10 w-full rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50">Use a dynamic value</button>
          )}
        </InspectorSection>
      )}
      {block.type === 'button' && <InspectorSection label="Page button"><TextField label="Label" value={block.content?.label || ''} onChange={(value) => onPatchBlock(block.id, { content: { ...(block.content || {}), label: value } })} /><SegmentedControl label="When pressed" value={block.content?.action === 'revisit' ? 'revisit' : 'continue'} options={[{ value: 'continue', label: 'Continue' }, { value: 'revisit', label: 'Go back' }]} onChange={(value) => onPatchBlock(block.id, { content: value === 'revisit' ? { ...(block.content || {}), action: 'revisit' } : { label: block.content?.label, action: 'continue' } })} />{block.content?.action === 'revisit' ? <label className="grid gap-2 text-xs font-bold text-gray-500">Earlier page<select value={block.content?.revisit_page_uuid || ''} onChange={(event) => onPatchBlock(block.id, { content: { ...(block.content || {}), revisit_page_uuid: event.target.value } })} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-normal text-gray-900"><option value="">Choose a page</option>{(pages || []).slice(0, Math.max(0, (pages || []).findIndex((item: any) => item.page_uuid === page.page_uuid))).map((item: any) => <option key={item.page_uuid} value={item.page_uuid}>{item.title}</option>)}</select></label> : <p className="text-xs leading-5 text-gray-500">Completes the page. To send learners somewhere different per button, add a path on &ldquo;Button pressed&rdquo; in the Flow tab.</p>}<SegmentedControl label="Style" value={design.variant === 'primary' ? 'primary' : 'secondary'} options={[{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }]} onChange={(value) => patchDesign({ variant: value })} /><SegmentedControl label="Layout" value={design.group ? 'grouped' : 'solo'} options={[{ value: 'solo', label: 'Solo' }, { value: 'grouped', label: 'Side by side' }]} onChange={(value) => patchDesign({ group: value === 'grouped' ? `button_group_${page.page_uuid}` : undefined })} /><p className="text-xs leading-5 text-gray-500">Grouped page buttons share one responsive row. Direction icons are added automatically.</p></InspectorSection>}
      <BlockDesignFields block={block} onPatchBlock={onPatchBlock} />
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

function QuestionInspector({ block, learningVariables = [], onCreateVariableKey, onPatchBlock, onToggleSideBySide }: any) {
  const content = block.content || {}
  // Question config lives on the block (with page-level fallback for old data).
  const scoring = getBlockScoring(block)
  const completion = getBlockCompletion(block)
  const variableBindings = completion.variable_bindings || {}
  const hasBindings = Object.values(variableBindings.options || {}).some(Boolean)
    || Object.values(variableBindings.inputs || {}).some(Boolean)
    || Boolean(variableBindings.image)
  const questionMode: 'scored' | 'variable' = completion.question_mode || (hasBindings ? 'variable' : 'scored')
  const patchQuestion = (patch: any) => onPatchBlock(block.id, patch)
  const patchContent = (patch: any) => patchQuestion({ content: { ...content, ...patch } })
  const patchScoring = (patch: any) => patchQuestion({ scoring: { ...scoring, ...patch } })
  const patchCompletion = (patch: any) => patchQuestion({ completion: { ...completion, ...patch } })
  const patchVariableBindings = (patch: any) => patchCompletion({ variable_bindings: { ...variableBindings, ...patch } })
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
          ? { ...scoring, mode: 'points', points: Number(scoring.points) || 1, score_policy: 'select_all' }
          : { ...scoring, mode: 'completion', points: Number(scoring.points) || 1 },
        completion: { ...completion, question_mode: 'scored', variable_bindings: {} },
      })
    }
  }

  if (block.kind === 'multiple_choice' || block.kind === 'categorized_multi_select') {
    const options = normalizeQuestionOptions(content.options)
    const correctIds = new Set<string>((scoring.correct_option_ids || []).map(String))
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
      else next.add(id)
      patchScoring({ mode: 'points', score_policy: 'select_all', correct_option_ids: Array.from(next) })
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
        <InspectorSection label="Answers">
          {questionMode === 'scored' && scoring.mode !== 'off' && Number(scoring.points ?? 1) > 0 && correctIds.size === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>No correct answers selected.</strong> Learners cannot receive points until this is repaired.</span>
            </div>
          ) : null}
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
          <SelectionRangeFields
            minSelections={minSelections}
            maxSelections={maxSelections}
            optionCount={options.length}
            onCommit={(nextMin, nextMax) => patchQuestion({
              completion: { ...completion, min_selections: nextMin, max_selections: nextMax },
            })}
          />
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
              <TextField label="Points" type="number" value={String(scoring.points ?? 1)} onChange={(value) => patchScoring({ mode: 'points', points: Number(value) })} />
              <p className="text-[11px] leading-4 text-gray-500">
                Select-all-that-apply scoring awards partial credit for correct selections and deducts credit for incorrect selections.
              </p>
              {correctIds.size > maxSelections ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Learners cannot select every correct answer because the selection limit is too low.
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <FieldLabel>Store answer in</FieldLabel>
                <p className="mb-2 text-[11px] leading-4 text-gray-500">Also write this local quiz response to a user-level variable.</p>
                <VariablePathPicker
                  value={activeBinding?.target || ''}
                  variables={learningVariables}
                  acceptedTypes={['text', 'number', 'boolean', 'option', 'multiple_choice']}
                  createValueType="multiple_choice"
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
                <label className="block text-[10px] font-bold uppercase text-gray-400">
                  Validation
                  <select
                    value={String(rule.validation || 'none')}
                    onChange={(event) => {
                      const validation = event.target.value
                      patchInputRule(input.id, { validation })
                      if (validation !== 'none') {
                        patchInput(input.id, { input_type: 'text', variant: 'single_line', height: 48 })
                      }
                    }}
                    className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs font-bold normal-case text-gray-900 outline-none focus:border-[var(--org-primary-color)]"
                  >
                    <option value="none">None</option>
                    <option value="name">Name</option>
                    <option value="email">Email address</option>
                    <option value="phone">Phone number</option>
                    <option value="url">Web URL</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                    <input type="checkbox" checked={rule.required !== false} onChange={(event) => patchInputRule(input.id, { required: event.target.checked })} />
                    Required
                  </label>
                  <select
                    value={input.input_type === 'number' ? 'number' : input.variant === 'single_line' || Number(input.height) <= 56 ? 'single_line' : 'short_answer'}
                    onChange={(event) => {
                      const variant = event.target.value
                      patchInput(input.id, {
                        input_type: variant === 'number' ? 'number' : 'text',
                        variant: variant === 'number' ? 'single_line' : variant,
                        height: variant === 'single_line' || variant === 'number' ? 48 : Math.max(120, Number(input.height) || 160),
                      })
                      if (variant === 'number') patchInputRule(input.id, { min_words: 0, max_words: 0 })
                    }}
                    className="h-8 rounded-lg border border-gray-200 px-2 text-xs font-bold outline-none focus:border-[var(--org-primary-color)]"
                  >
                    <option value="single_line">Single line</option>
                    <option value="short_answer">Multi line</option>
                    <option value="number">Number</option>
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
            {scoring.mode === 'manual' ? <div><FieldLabel>Rubric</FieldLabel><textarea value={scoring.rubric || ''} onChange={(event) => patchScoring({ rubric: event.target.value })} placeholder="Describe what earns full, partial, and no credit." className="min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-[var(--org-primary-color)]" />{!String(scoring.rubric || '').trim() ? <p className="mt-1 text-xs font-bold text-amber-700">A rubric is required for manual review.</p> : null}</div> : null}
          </>
        ) : (
          <>
            <div className="space-y-2">
              {inputs.map((input) => {
                const binding = normalizeBinding(inputBindings[input.id])
                return (
                  <div key={input.id}>
                    <FieldLabel>{sideBySide ? `Store "${input.label || 'Response'}" in` : 'Store answer in'}</FieldLabel>
                    <p className="mb-2 text-[11px] leading-4 text-gray-500">Also write this local quiz response to a user-level variable.</p>
                    <VariablePathPicker
                      value={binding?.target || ''}
                      variables={learningVariables}
                      acceptedTypes={input.input_type === 'number' ? ['number'] : ['text', 'boolean', 'option']}
                      createValueType={input.input_type === 'number' ? 'number' : 'text'}
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

function SelectionRangeFields({
  minSelections,
  maxSelections,
  optionCount,
  onCommit,
}: {
  minSelections: number
  maxSelections: number
  optionCount: number
  onCommit: (minSelections: number, maxSelections: number) => void
}) {
  const [draftMin, setDraftMin] = React.useState(String(minSelections))
  const [draftMax, setDraftMax] = React.useState(String(maxSelections))

  React.useEffect(() => setDraftMin(String(minSelections)), [minSelections])
  React.useEffect(() => setDraftMax(String(maxSelections)), [maxSelections])

  const parseDraft = (value: string, fallback: number) => {
    if (!/^\d+$/.test(value)) return fallback
    return Math.max(1, Math.min(optionCount, Number(value)))
  }
  const commit = (field: 'min' | 'max') => {
    let nextMin = parseDraft(draftMin, minSelections)
    let nextMax = parseDraft(draftMax, maxSelections)
    if (field === 'min' && nextMin > nextMax) nextMax = nextMin
    if (field === 'max' && nextMax < nextMin) nextMin = nextMax
    setDraftMin(String(nextMin))
    setDraftMax(String(nextMax))
    if (nextMin !== minSelections || nextMax !== maxSelections) onCommit(nextMin, nextMax)
  }
  const inputClass = (value: string) => {
    const parsed = Number(value)
    const invalid = value !== '' && (!/^\d+$/.test(value) || parsed < 1 || parsed > optionCount)
    return `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-[var(--org-primary-color)] ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <FieldLabel>Min selections</FieldLabel>
        <input inputMode="numeric" value={draftMin} onChange={(event) => setDraftMin(event.target.value)} onBlur={() => commit('min')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} className={inputClass(draftMin)} />
      </div>
      <div>
        <FieldLabel>Max selections</FieldLabel>
        <input inputMode="numeric" value={draftMax} onChange={(event) => setDraftMax(event.target.value)} onBlur={() => commit('max')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} className={inputClass(draftMax)} />
      </div>
    </div>
  )
}

function normalizeBinding(value: any) {
  if (Array.isArray(value)) return value[0] || null
  if (value && typeof value === 'object') return value
  return null
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
