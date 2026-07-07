'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { createPortal } from 'react-dom'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronRight, Columns2, Copy, GripVertical, Heading1, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Loader2, Pause, Play, Plus, Quote, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import YouTube from 'react-youtube'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  completeLearningPage,
  startLearningRun,
  submitLearningResponse,
} from '@services/learning/learning'
import {
  findQuestionBlock,
  getBlockCompletion,
  getBlockScoring,
  getQuestionAnswer,
  type LearningTextBlock,
  resolveVariantBlocks,
  setQuestionAnswer,
  type LearningBlock,
} from '@components/Learning/schema'
import { EMPTY_PARAGRAPH, getTextBlockNodes } from './editor/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import toast from 'react-hot-toast'
import ReorderableList from '@components/Objects/ReorderableList'

export function LearningActivityPlayer({ orgslug, badgePath, activity }: { orgslug: string; badgePath: any; activity: any }) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const pages = activity.pages || []
  const activityIndex = (badgePath.activities || []).findIndex((item: any) =>
    item.id === activity.id || item.activity_uuid === activity.activity_uuid
  )
  const isFinalActivity = activityIndex >= 0 && activityIndex === (badgePath.activities || []).length - 1
  const [run, setRun] = React.useState<any>(badgePath.run)
  const [index, setIndex] = React.useState(0)
  const [unlocked, setUnlocked] = React.useState(false)
  const [answer, setAnswer] = React.useState<any>({})
  const page = pages[index]

  React.useEffect(() => {
    startLearningRun(badge.badge_uuid, accessToken)
      .then(setRun)
      .catch(() => null)
  }, [badge.badge_uuid, accessToken])

  React.useEffect(() => {
    setUnlocked(Boolean(page) && !isQuestionResponseRequired(page))
    setAnswer({})
  }, [page?.content, page?.page_type, page?.page_uuid])

  const completeAndNext = async () => {
    if (!run || !page) return
    try {
      let nextRun
      if (isQuestionResponseRequired(page)) {
        nextRun = await submitLearningResponse(run.run_uuid, page.page_uuid, answer, accessToken)
      } else {
        nextRun = await completeLearningPage(run.run_uuid, page.page_uuid, {}, accessToken)
      }
      setRun(nextRun)
      if (index < pages.length - 1) {
        setIndex(index + 1)
      } else {
        const grading = activity.settings?.grading || {}
        if (grading.mode === 'pass_fail' && grading.success_message) {
          toast.success(grading.success_message)
        }
        const cleanBadgeUuid = String(badge.badge_uuid || '').replace(/^badge_/, '')
        if (isFinalActivity && cleanBadgeUuid) {
          router.push(getUriWithOrg(orgslug, routePaths.org.badgeStatus(cleanBadgeUuid)))
        } else if (cleanBadgeUuid) {
          router.push(getUriWithOrg(orgslug, routePaths.org.badgePath(cleanBadgeUuid)))
        } else {
          router.back()
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not complete page')
    }
  }

  return (
    <LearningActivitySurface
      pages={pages}
      page={page}
      pageIndex={index}
      onBack={() => router.back()}
      actionLabel={index === pages.length - 1 ? 'Finish' : 'Continue'}
      actionDisabled={!unlocked}
      onAction={completeAndNext}
      interactionState={answer}
    >
      <LearningPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} pages={pages} run={run} />
    </LearningActivitySurface>
  )
}

export function LearningActivitySurface({
  pages,
  page,
  pageIndex,
  children,
  backHref,
  onBack,
  actionLabel = 'Continue',
  actionDisabled,
  onAction,
  interactionState,
  className = 'h-dvh',
}: any) {
  const progress = ((pageIndex + 1) / Math.max(1, pages.length)) * 100
  const isVideoPage = page?.page_type === 'video'
  const showVideoControls = isVideoPage && actionDisabled && interactionState?.videoStarted
  const pageBackground = !isVideoPage && page?.design?.background_accent_color
    ? String(page.design.background_accent_color)
    : undefined
  const surfaceClassName = isVideoPage
    ? `relative flex w-full min-w-0 items-center justify-center overflow-hidden bg-black px-4 py-4 text-gray-950 sm:py-6 ${className}`
    : `relative flex w-full min-w-0 overflow-hidden bg-[var(--org-page-background)] text-gray-950 ${className} items-center justify-center px-4 py-4 sm:py-6`
  const frameClassName = isVideoPage
    ? 'relative flex h-full min-h-0 w-full min-w-0 flex-none flex-col overflow-hidden'
    : 'relative flex h-full min-h-0 w-full min-w-0 max-w-3xl flex-none flex-col overflow-hidden'
  const chromeInnerClassName = isVideoPage
    ? 'mx-auto flex h-14 w-full max-w-3xl items-center gap-4'
    : 'mx-auto flex h-14 w-full items-center gap-4'
  const footerInnerClassName = isVideoPage
    ? 'mx-auto flex w-full max-w-3xl justify-center'
    : 'mx-auto flex w-full max-w-2xl justify-center'
  const backControl = backHref ? (
    <Link href={backHref} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950'}`}><X size={20} /></Link>
  ) : (
    <button onClick={onBack} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950'}`}><X size={20} /></button>
  )

  return (
    <main data-learning-activity-surface className={surfaceClassName} style={pageBackground ? { backgroundColor: pageBackground } : undefined}>
      <div className={frameClassName}>
        <div className="relative z-10 shrink-0 px-4">
          <div className={chromeInnerClassName}>
            {backControl}
            <div className={`h-2 flex-1 overflow-hidden rounded-full ${isVideoPage ? 'bg-white/25' : 'bg-gray-200'}`}>
              <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className={`text-sm font-medium ${isVideoPage ? 'text-white/80' : 'text-gray-500'}`}>{pageIndex + 1}/{Math.max(1, pages.length)}</span>
          </div>
        </div>
        <div className={`${isVideoPage ? 'flex min-h-0 flex-1 items-center justify-center overflow-hidden p-0' : 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-8'}`}>
          <div className={`${isVideoPage ? 'flex h-full w-full items-center justify-center overflow-hidden' : 'mx-auto flex min-h-full w-full max-w-2xl items-center overflow-visible'}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page?.page_uuid || pageIndex}
                className={isVideoPage ? 'flex h-full w-full items-center justify-center' : 'w-full'}
                initial={{ x: 36, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {page ? children : <div className="flex min-h-[420px] items-center justify-center text-gray-400">No page selected</div>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="relative z-10 shrink-0 px-5 py-4">
          <div className={footerInnerClassName}>
            {showVideoControls ? (
              <VideoPlaybackStatus
                interactionState={interactionState}
                pageUuid={page?.page_uuid}
                allowScrubbing={page?.content?.allow_scrubbing !== false}
              />
            ) : (
              <button onClick={onAction} disabled={actionDisabled} className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-[var(--org-primary-color)] px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-40 sm:w-auto sm:min-w-40">
                {actionLabel}
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export function LearningPageContent({ page, answer, setAnswer, setUnlocked, pages, run, editable = false, onPagePatch }: any) {
  if (!page) return null
  if (page.page_type === 'video') {
    return <VideoPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} />
  }
  if (page.page_type === 'standard') {
    return <StandardPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} run={run} />
  }
  if (page.page_type === 'multiple_choice' || page.page_type === 'text_input') {
    return <InfoPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} />
  }
  if (page.page_type === 'question_response') {
    const responseKey = editable
      ? page.content?.response_active_key || 'default'
      : getRuntimeResponseKey(page, pages || [], run)
    return <InfoPageContent page={page} editable={editable} onPagePatch={onPagePatch} responseKey={responseKey} />
  }
  return <InfoPageContent page={page} editable={editable} onPagePatch={onPagePatch} />
}

function StandardPageContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch, run }: any) {
  const blocks = React.useMemo(
    () => editable ? (page.content?.blocks || []) : resolveVariantBlocks(page, run),
    [editable, page, run]
  )
  const questionIds = React.useMemo(
    () => blocks.filter((block: LearningBlock) => block.type === 'question').map((block: LearningBlock) => block.id),
    [blocks]
  )
  const unlockedByBlockRef = React.useRef<Record<string, boolean>>({})

  React.useEffect(() => {
    unlockedByBlockRef.current = {}
  }, [page?.page_uuid])

  const setBlockUnlocked = (blockId: string, value: boolean) => {
    unlockedByBlockRef.current[blockId] = value
    setUnlocked?.(questionIds.every((id: string) => unlockedByBlockRef.current[id]))
  }

  const setBlockAnswer = (blockId: string, value: any) => {
    setAnswer?.((current: any) => setQuestionAnswer(current, blockId, value))
  }

  const patchBlock = (blockId: string, patch: any) => {
    const nextBlocks = (page.content?.blocks || []).map((block: LearningBlock) =>
      block.id === blockId ? { ...block, ...patch } : block
    )
    onPagePatch?.({ content: { ...(page.content || {}), version: page.content?.version || 2, blocks: nextBlocks } })
  }

  return (
    <div className="learning-info-block-stack">
      <div className="learning-info-reorder-list">
        {blocks.map((block: LearningBlock) => (
          <StandardBlockView
            key={block.id}
            block={block}
            page={page}
            answer={getQuestionAnswer(answer, block.id)}
            setAnswer={(value: any) => setBlockAnswer(block.id, value)}
            setUnlocked={(value: boolean) => setBlockUnlocked(block.id, value)}
            editable={editable}
            onPatch={(patch: any) => patchBlock(block.id, patch)}
          />
        ))}
      </div>
    </div>
  )
}

export function buildQuestionVirtualPage(page: any, block: any) {
  return {
    ...page,
    page_type: block.kind,
    content: { ...(block.content || {}), hide_prompt: true },
    scoring: getBlockScoring(page, block),
    completion: getBlockCompletion(page, block),
  }
}

export function mapQuestionPagePatchToBlock(block: any, patch: any) {
  const next: any = {}
  if (patch.content) {
    const content = { ...(block.content || {}), ...patch.content }
    delete content.hide_prompt
    next.content = content
  }
  if (patch.scoring) next.scoring = patch.scoring
  if (patch.completion) next.completion = patch.completion
  return next
}

function StandardBlockView({ block, page, answer, setAnswer, setUnlocked, editable, onPatch }: any) {
  const blockStyle = getStandardBlockStyle(block)

  if (block.type === 'text') {
    const nodes = getTextBlockNodes(block as LearningTextBlock)
    return (
      <section className="learning-info-stack-section" style={blockStyle}>
        <InfoTextBlock
          block={nodes}
          blockId={block.id}
          editable={false}
          onActivate={() => null}
          onUpdate={() => null}
        />
      </section>
    )
  }

  if (block.type === 'image') {
    const height = Math.max(80, Number(block.design?.height) || 220)
    const fit = block.design?.fit === 'cover' ? 'object-cover' : 'object-contain'
    return (
      <section className="learning-info-stack-section" style={blockStyle}>
        <figure className="w-full max-w-full overflow-hidden rounded-lg" style={{ height }}>
          {block.content?.src ? (
            <img src={block.content.src} alt={block.content?.alt || ''} className={`h-full w-full max-w-full ${fit}`} />
          ) : null}
        </figure>
      </section>
    )
  }

  if (block.type === 'question') {
    const label = String(block.content?.label || '').trim()
    return (
      <section className="learning-info-stack-section" style={blockStyle}>
        {label && <p className="text-lg font-bold text-gray-900">{label}</p>}
        <QuestionBlockContent
          page={buildQuestionVirtualPage(page, block)}
          answer={answer}
          setAnswer={setAnswer}
          setUnlocked={setUnlocked}
          editable={editable}
          onPagePatch={(patch: any) => onPatch(mapQuestionPagePatchToBlock(block, patch))}
          onActivate={() => null}
          showChrome={false}
          onChromeHoverChange={() => null}
        />
      </section>
    )
  }

  return null
}

function getStandardBlockStyle(block: LearningBlock): React.CSSProperties {
  const design = block.design || {}
  const width = Math.max(25, Math.min(100, Number(design.width) || 100))
  const align = design.align || 'left'
  const style: React.CSSProperties = {
    width: `${width}%`,
    marginLeft: align === 'right' ? 'auto' : align === 'center' ? 'auto' : undefined,
    marginRight: align === 'left' ? 'auto' : align === 'center' ? 'auto' : undefined,
  }
  if (block.type === 'text' && design.text_color) {
    style.color = design.text_color
    ;(style as any)['--learning-text-color'] = design.text_color
  }
  return style
}

function InfoPageContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch, responseKey = 'default' }: any) {
  const hasQuestionBlock = isLearningQuestionPage(page)
  const activeResponseKey = page.page_type === 'question_response' ? responseKey || 'default' : 'default'
  const blockContent = React.useMemo(() => getResponseBlockContent(page.content || {}, activeResponseKey), [activeResponseKey, page.content])
  const richText = React.useMemo(() => getInfoRichTextContent(blockContent, {
    includeQuestionBlock: hasQuestionBlock,
    questionPageType: page.page_type,
    responseTemplate: page.page_type === 'question_response',
  }), [blockContent, hasQuestionBlock, page.page_type])
  const externalBlocks = React.useMemo(() => normalizeInfoBlocks(richText.content || []), [richText])
  const [activeBlockIndex, setActiveBlockIndex] = React.useState(-1)
  const [activeTextEditor, setActiveTextEditor] = React.useState<any>(null)
  const [hovered, setHovered] = React.useState(false)
  const [chromeHovered, setChromeHovered] = React.useState(false)
  const [draggingBlockId, setDraggingBlockId] = React.useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const [toolbarPosition, setToolbarPosition] = React.useState<{ top: number; left: number } | null>(null)
  const [blocks, setBlocks] = React.useState<any[]>(() => externalBlocks)
  const [blockIds, setBlockIds] = React.useState<string[]>(() => externalBlocks.map((_block, index) => `${page.page_uuid}-info-block-${index + 1}`))
  const [focusBlockId, setFocusBlockId] = React.useState<string | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement | null>(null)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const latestContentRef = React.useRef(page.content || {})
  const nextBlockIdRef = React.useRef(externalBlocks.length)
  const pageUuidRef = React.useRef(`${page.page_uuid}:${activeResponseKey}`)
  const blocksRef = React.useRef<any[]>(blocks)
  const blockIdsRef = React.useRef<string[]>(blockIds)
  const pendingSwapRectsRef = React.useRef<Map<string, DOMRect> | null>(null)
  const activeBlock = activeBlockIndex >= 0 ? blocks[activeBlockIndex] : null
  const selectedImage = activeBlock?.type === 'learningImage' ? activeBlock : null
  const showToolbar = editable && (activeTextEditor || selectedImage)
  const showChrome = editable && (hovered || chromeHovered || activeBlockIndex >= 0)

  const createBlockId = React.useCallback(() => {
    nextBlockIdRef.current += 1
    return `${page.page_uuid}-info-block-${nextBlockIdRef.current}`
  }, [page.page_uuid])

  React.useEffect(() => {
    latestContentRef.current = page.content || {}
  }, [page.content])

  React.useEffect(() => {
    const pageStateKey = `${page.page_uuid}:${activeResponseKey}`
    if (pageUuidRef.current === pageStateKey) return
    pageUuidRef.current = pageStateKey
    nextBlockIdRef.current = externalBlocks.length
    blocksRef.current = externalBlocks
    setBlocks(externalBlocks)
    const nextIds = externalBlocks.map((_block, index) => `${page.page_uuid}-info-block-${index + 1}`)
    blockIdsRef.current = nextIds
    setBlockIds(nextIds)
    setActiveBlockIndex(-1)
    setActiveTextEditor(null)
    setDraggingBlockId(null)
    setFocusBlockId(null)
    pendingSwapRectsRef.current = null
  }, [activeResponseKey, externalBlocks, page.page_uuid])

  React.useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  React.useEffect(() => {
    blockIdsRef.current = blockIds
  }, [blockIds])

  React.useEffect(() => {
    setBlockIds((current) => {
      if (current.length === blocks.length) {
        blockIdsRef.current = current
        return current
      }
      const nextIds = current.length > blocks.length
        ? current.slice(0, blocks.length)
        : [...current, ...Array.from({ length: blocks.length - current.length }, createBlockId)]
      blockIdsRef.current = nextIds
      return nextIds
    })
  }, [blocks.length, createBlockId])

  React.useLayoutEffect(() => {
    if (!showToolbar) {
      setToolbarPosition(null)
      return
    }

    let frame = 0
    const updatePosition = () => {
      const wrapper = wrapperRef.current
      const surface = wrapper?.closest('[data-learning-activity-surface]') as HTMLElement | null
      const rect = surface?.getBoundingClientRect()
      if (!rect) return
      setToolbarPosition({
        top: Math.max(8, rect.top - 76),
        left: rect.left + rect.width / 2,
      })
    }
    const loop = () => {
      updatePosition()
      frame = window.requestAnimationFrame(loop)
    }

    loop()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [showToolbar])

  const patchBlocks = React.useCallback((nextBlocks: any[], nextIds?: string[]) => {
    const normalizedBlocks = hasQuestionBlock ? ensureQuestionBlock(nextBlocks, { questionPageType: page.page_type }) : nextBlocks
    const content = normalizedBlocks.length ? normalizedBlocks.map(stripInfoBlockMeta) : [{ type: 'paragraph' }]
    const richTextPatch = { type: 'doc', content }
    const ids = nextIds
      ? syncIdsToBlocks(normalizedBlocks, nextBlocks, nextIds, createBlockId)
      : undefined
    blocksRef.current = normalizedBlocks
    setBlocks(normalizedBlocks)
    if (ids) {
      blockIdsRef.current = ids
      setBlockIds(ids)
    }
    if (page.page_type === 'question_response' && activeResponseKey !== 'default') {
      const latestContent = latestContentRef.current || {}
      const variants = latestContent.response_variants || {}
      onPagePatch?.({
        content: {
          ...latestContent,
          response_active_key: activeResponseKey,
          response_variants: {
            ...variants,
            [activeResponseKey]: {
              ...(variants[activeResponseKey] || {}),
              enabled: true,
              rich_text: richTextPatch,
            },
          },
        },
      })
      return
    }

    onPagePatch?.({ content: { ...(latestContentRef.current || {}), rich_text: richTextPatch } })
  }, [activeResponseKey, createBlockId, hasQuestionBlock, onPagePatch, page.page_type])

  React.useEffect(() => {
    const eventName = `learning-content-add-image-${page.page_uuid}`
    const addImage = () => {
      const insertAt = activeBlockIndex >= 0 ? Math.min(blocks.length, activeBlockIndex + 1) : blocks.length
      const nextBlocks = [...blocks]
      const nextIds = [...blockIds]
      nextBlocks.splice(insertAt, 0, createInfoImageBlock())
      nextIds.splice(insertAt, 0, createBlockId())
      patchBlocks(nextBlocks, nextIds)
      setActiveBlockIndex(insertAt)
      setActiveTextEditor(null)
    }
    window.addEventListener(eventName, addImage)
    return () => window.removeEventListener(eventName, addImage)
  }, [activeBlockIndex, blockIds, blocks, createBlockId, page.page_uuid, patchBlocks])

  React.useEffect(() => {
    const eventName = `learning-content-add-text-${page.page_uuid}`
    const addText = () => {
      const insertAt = activeBlockIndex >= 0 ? Math.min(blocks.length, activeBlockIndex + 1) : blocks.length
      const nextBlocks = [...blocks]
      const nextIds = [...blockIds]
      nextBlocks.splice(insertAt, 0, createInfoTextBlock('paragraph'))
      nextIds.splice(insertAt, 0, createBlockId())
      patchBlocks(nextBlocks, nextIds)
      setActiveBlockIndex(insertAt)
      setActiveTextEditor(null)
      setFocusBlockId(nextIds[insertAt] || null)
    }
    window.addEventListener(eventName, addText)
    return () => window.removeEventListener(eventName, addText)
  }, [activeBlockIndex, blockIds, blocks, createBlockId, page.page_uuid, patchBlocks])

  const updateBlock = React.useCallback((index: number, nextBlock: any) => {
    const nextBlocks = [...blocks]
    const nextIds = [...blockIds]
    nextBlocks.splice(index, 1, nextBlock)
    if (!nextIds[index]) nextIds[index] = createBlockId()
    const normalized = normalizeInfoAdjacentLists(nextBlocks, nextIds, index)
    patchBlocks(normalized.blocks, normalized.ids)
    setActiveBlockIndex(normalized.activeIndex)
    if (normalized.merged) {
      setActiveTextEditor(null)
      setFocusBlockId(normalized.ids[normalized.activeIndex] || null)
    }
  }, [blockIds, blocks, createBlockId, patchBlocks])

  const insertBlockAfter = React.useCallback((index: number, block: any = createInfoTextBlock('paragraph'), currentBlock?: any) => {
    const nextBlocks = [...blocksRef.current]
    const nextIds = [...blockIdsRef.current]
    const insertAt = Math.min(nextBlocks.length, index + 1)
    const nextId = createBlockId()
    if (currentBlock) nextBlocks[index] = currentBlock
    nextBlocks.splice(insertAt, 0, block)
    nextIds.splice(insertAt, 0, nextId)
    const normalized = normalizeInfoAdjacentLists(nextBlocks, nextIds, insertAt)
    patchBlocks(normalized.blocks, normalized.ids)
    setActiveBlockIndex(normalized.activeIndex)
    setActiveTextEditor(null)
    setFocusBlockId(normalized.ids[normalized.activeIndex] || nextId)
  }, [createBlockId, patchBlocks])

  const splitActiveListItem = React.useCallback((allowNonEmpty = false) => {
    if (!activeTextEditor || activeBlockIndex < 0) return false
    const split = getInfoListExitBlocks(activeTextEditor, allowNonEmpty)
    if (!split) return false
    if ('replaceCurrent' in split && split.replaceCurrent) {
      setInfoEditorContent(activeTextEditor, split.nextBlock)
      updateBlock(activeBlockIndex, split.nextBlock)
      setFocusBlockId(blockIdsRef.current[activeBlockIndex] || null)
      return true
    }
    setInfoEditorContent(activeTextEditor, split.currentBlock)
    insertBlockAfter(activeBlockIndex, split.nextBlock, split.currentBlock)
    return true
  }, [activeBlockIndex, activeTextEditor, insertBlockAfter, updateBlock])

  const duplicateBlock = React.useCallback((index: number) => {
    if (blocks[index]?.type === 'learningQuestion') return
    const nextBlocks = [...blocks]
    const nextIds = [...blockIds]
    nextBlocks.splice(index + 1, 0, cloneInfoBlock(blocks[index]))
    nextIds.splice(index + 1, 0, createBlockId())
    patchBlocks(nextBlocks, nextIds)
  }, [blockIds, blocks, createBlockId, patchBlocks])

  const deleteBlock = React.useCallback((index: number) => {
    if (blocks[index]?.type === 'learningQuestion') return
    if (isLearningTextBlock(blocks[index]) && countLearningTextBlocks(blocks) <= 1) return
    const nextBlocks = blocks.filter((_block, blockIndex) => blockIndex !== index)
    const nextIds = blockIds.filter((_id, blockIndex) => blockIndex !== index)
    patchBlocks(nextBlocks.length ? nextBlocks : [createInfoTextBlock('paragraph')], nextIds.length ? nextIds : [createBlockId()])
    setActiveBlockIndex(Math.max(0, Math.min(index, nextBlocks.length - 1)))
  }, [blockIds, blocks, createBlockId, patchBlocks])

  const resizeImage = React.useCallback((index: number, startEvent: React.PointerEvent<HTMLDivElement>) => {
    const block = blocks[index]
    if (!block || block.type !== 'learningImage') return
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const startHeight = Number(block.attrs?.height) || 220

    const onMove = (event: PointerEvent) => {
      const nextHeight = Math.round(Math.max(120, Math.min(520, startHeight + event.clientY - startY)))
      updateBlock(index, { ...block, attrs: { ...(block.attrs || {}), height: nextHeight } })
    }

    const onUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [blocks, updateBlock])

  const updateSelectedImage = React.useCallback((attrs: Record<string, any>) => {
    if (!selectedImage) return
    updateBlock(activeBlockIndex, { ...selectedImage, attrs: { ...(selectedImage.attrs || {}), ...attrs } })
  }, [activeBlockIndex, selectedImage, updateBlock])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }

    setUploadingImage(true)
    const reader = new FileReader()
    reader.onload = () => {
      updateSelectedImage({
        src: typeof reader.result === 'string' ? reader.result : '',
        mode: 'upload',
      })
      setUploadingImage(false)
    }
    reader.onerror = () => {
      toast.error('Could not read image')
      setUploadingImage(false)
    }
    reader.readAsDataURL(file)
  }

  const toolbar = showToolbar && toolbarPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          data-learning-info-toolbar
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault()
          }}
          className="learning-info-format-bar fixed z-[120] flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-xl shadow-gray-950/10 backdrop-blur"
          style={{ top: toolbarPosition.top, left: toolbarPosition.left, transform: 'translateX(-50%)' }}
        >
          {selectedImage ? (
            <>
              <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-0.5">
                <button
                  type="button"
                  onClick={() => updateSelectedImage({ mode: 'url', src: selectedImage.attrs?.mode === 'upload' ? '' : selectedImage.attrs?.src })}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold ${selectedImage.attrs?.mode !== 'upload' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
                >
                  <LinkIcon size={14} />
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold ${selectedImage.attrs?.mode === 'upload' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
                >
                  {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Upload
                </button>
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <input
                value={selectedImage.attrs?.mode === 'upload' ? '' : selectedImage.attrs?.src || ''}
                onChange={(event) => updateSelectedImage({ src: event.target.value, mode: 'url' })}
                placeholder="Paste image URL"
                className="h-8 w-56 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium outline-none placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]"
              />
            </>
          ) : activeTextEditor ? (
            <>
              <InfoFormatButton title="Heading 1" active={activeTextEditor.isActive('heading', { level: 1 })} onClick={() => activeTextEditor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></InfoFormatButton>
              <InfoFormatButton title="Heading 2" active={activeTextEditor.isActive('heading', { level: 2 })} onClick={() => activeTextEditor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></InfoFormatButton>
              <span className="mx-1 h-5 w-px bg-gray-200" />
              <InfoFormatButton title="Bold" active={activeTextEditor.isActive('bold')} onClick={() => activeTextEditor.chain().focus().toggleBold().run()}><Bold size={16} /></InfoFormatButton>
              <InfoFormatButton title="Italic" active={activeTextEditor.isActive('italic')} onClick={() => activeTextEditor.chain().focus().toggleItalic().run()}><Italic size={16} /></InfoFormatButton>
              <InfoFormatButton title="Quote" active={activeTextEditor.isActive('blockquote')} onClick={() => activeTextEditor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></InfoFormatButton>
              <span className="mx-1 h-5 w-px bg-gray-200" />
              <InfoFormatButton title="Bullet list" active={activeTextEditor.isActive('bulletList')} onClick={() => { if (!splitActiveListItem(true)) activeTextEditor.chain().focus().toggleBulletList().run() }}><List size={16} /></InfoFormatButton>
              <InfoFormatButton title="Numbered list" active={activeTextEditor.isActive('orderedList')} onClick={() => { if (!splitActiveListItem(true)) activeTextEditor.chain().focus().toggleOrderedList().run() }}><ListOrdered size={16} /></InfoFormatButton>
              <span className="mx-1 h-5 w-px bg-gray-200" />
              <InfoFormatButton title="Align left" active={getActiveTextAlignment(activeTextEditor) === 'left'} onClick={() => setActiveTextAlignment(activeTextEditor, 'left')}><AlignLeft size={16} /></InfoFormatButton>
              <InfoFormatButton title="Align center" active={getActiveTextAlignment(activeTextEditor) === 'center'} onClick={() => setActiveTextAlignment(activeTextEditor, 'center')}><AlignCenter size={16} /></InfoFormatButton>
              <InfoFormatButton title="Align right" active={getActiveTextAlignment(activeTextEditor) === 'right'} onClick={() => setActiveTextAlignment(activeTextEditor, 'right')}><AlignRight size={16} /></InfoFormatButton>
            </>
          ) : null}
        </div>,
        document.body
      )
    : null

  const getBlockRects = React.useCallback(() => {
    const rects = new Map<string, DOMRect>()
    const rows = Array.from(wrapperRef.current?.querySelectorAll('[data-learning-info-block-id]') || []) as HTMLElement[]
    rows.forEach((row) => {
      const id = row.dataset.learningInfoBlockId
      if (id) rects.set(id, row.getBoundingClientRect())
    })
    return rects
  }, [])

  React.useLayoutEffect(() => {
    const beforeRects = pendingSwapRectsRef.current
    if (!beforeRects) return
    pendingSwapRectsRef.current = null

    window.requestAnimationFrame(() => {
      const rows = Array.from(wrapperRef.current?.querySelectorAll('[data-learning-info-block-id]') || []) as HTMLElement[]
      rows.forEach((row) => {
        const id = row.dataset.learningInfoBlockId
        const before = id ? beforeRects.get(id) : null
        if (!before) return

        const after = row.getBoundingClientRect()
        const deltaY = before.top - after.top
        if (Math.abs(deltaY) < 1) return

        row.style.transition = 'none'
        row.style.transform = `translate3d(0, ${deltaY}px, 0)`
        row.getBoundingClientRect()

        window.requestAnimationFrame(() => {
          row.style.transition = 'transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 150ms, opacity 150ms'
          row.style.transform = ''
          const clearInlineAnimation = () => {
            row.style.transition = ''
            row.removeEventListener('transitionend', clearInlineAnimation)
          }
          row.addEventListener('transitionend', clearInlineAnimation)
        })
      })
    })
  }, [blocks, blockIds])

  const moveBlock = React.useCallback((fromIndex: number, toIndex: number) => {
    const currentBlocks = blocksRef.current
    const currentIds = blockIdsRef.current
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= currentBlocks.length || toIndex >= currentBlocks.length) return

    pendingSwapRectsRef.current = getBlockRects()
    const nextBlocks = [...currentBlocks]
    const nextIds = [...currentIds]
    const [block] = nextBlocks.splice(fromIndex, 1)
    const [id] = nextIds.splice(fromIndex, 1)
    nextBlocks.splice(toIndex, 0, block)
    nextIds.splice(toIndex, 0, id)
    setActiveBlockIndex(toIndex)
    patchBlocks(nextBlocks, nextIds)
  }, [getBlockRects, patchBlocks])

  const startBlockReorder = React.useCallback((index: number, startEvent: React.PointerEvent<HTMLButtonElement>) => {
    const dragId = blockIdsRef.current[index]
    if (!dragId) return

    startEvent.preventDefault()
    startEvent.stopPropagation()
    setActiveBlockIndex(index)
    setActiveTextEditor(null)
    setDraggingBlockId(dragId)
    document.body.style.cursor = 'grabbing'

    const onMove = (event: PointerEvent) => {
      const ids = blockIdsRef.current
      const currentIndex = ids.indexOf(dragId)
      if (currentIndex < 0) return

      const rows = Array.from(wrapperRef.current?.querySelectorAll('[data-learning-info-block-id]') || []) as HTMLElement[]
      const previous = rows[currentIndex - 1]
      const next = rows[currentIndex + 1]

      if (previous) {
        const previousRect = previous.getBoundingClientRect()
        if (event.clientY < previousRect.top + previousRect.height / 2) {
          moveBlock(currentIndex, currentIndex - 1)
          return
        }
      }

      if (next) {
        const nextRect = next.getBoundingClientRect()
        if (event.clientY > nextRect.top + nextRect.height / 2) {
          moveBlock(currentIndex, currentIndex + 1)
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
  }, [moveBlock])

  const renderSection = (block: any, index: number) => (
    <InfoBlockSection
      key={blockIds[index] || `${page.page_uuid}-info-block-${index}`}
      block={block}
      blockId={blockIds[index] || `${page.page_uuid}-info-block-${index}`}
      editable={editable}
      active={editable && activeBlockIndex === index}
      dragging={Boolean(blockIds[index] && draggingBlockId === blockIds[index])}
      onActivate={(editorInstance?: any) => {
        setActiveBlockIndex(index)
        setActiveTextEditor(editorInstance || null)
      }}
      onUpdate={(nextBlock: any) => updateBlock(index, nextBlock)}
      onSplit={(currentBlock?: any, nextBlock?: any) => insertBlockAfter(index, nextBlock || createInfoTextBlock('paragraph'), currentBlock)}
      onDuplicate={() => duplicateBlock(index)}
      onDelete={() => deleteBlock(index)}
      deleteDisabled={isLearningTextBlock(block) && countLearningTextBlocks(blocks) <= 1}
      onResizeImage={(event: React.PointerEvent<HTMLDivElement>) => resizeImage(index, event)}
      onStartReorder={(event: React.PointerEvent<HTMLButtonElement>) => startBlockReorder(index, event)}
      shouldFocus={Boolean(focusBlockId && blockIds[index] === focusBlockId)}
      onFocusComplete={() => setFocusBlockId(null)}
      showChrome={showChrome}
      onChromeHoverChange={setChromeHovered}
      page={page}
      answer={answer}
      setAnswer={setAnswer}
      setUnlocked={setUnlocked}
      onPagePatch={onPagePatch}
    />
  )

  return (
    <div
      ref={wrapperRef}
      className={`learning-info-block-stack ${editable ? 'is-editable' : ''} ${showChrome ? 'is-chrome-visible' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {toolbar}
      <div className="learning-info-reorder-list">
        {blocks.map((block, index) => renderSection(block, index))}
      </div>
    </div>
  )
}

function InfoBlockSection({
  block,
  blockId,
  page,
  answer,
  setAnswer,
  setUnlocked,
  onPagePatch,
  editable,
  active,
  dragging,
  onActivate,
  onUpdate,
  onSplit,
  onDuplicate,
  onDelete,
  deleteDisabled,
  onResizeImage,
  onStartReorder,
  shouldFocus,
  onFocusComplete,
  showChrome,
  onChromeHoverChange,
}: any) {
  const isImage = block.type === 'learningImage'
  const isQuestion = block.type === 'learningQuestion'
  const sectionRef = React.useRef<HTMLElement | null>(null)

  return (
    <section
      ref={sectionRef}
      data-learning-info-block-id={blockId}
      className={`learning-info-stack-section ${editable ? 'is-editable' : ''} ${active ? 'is-active' : ''} ${dragging ? 'is-reordering' : ''}`}
    >
      {editable && !isQuestion && (
        <InfoBlockChrome
          sectionRef={sectionRef}
          active={active}
          dragging={dragging}
          visible={showChrome}
          isImage={isImage}
          locked={isQuestion}
          onActivate={onActivate}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          deleteDisabled={deleteDisabled}
          onResizeImage={onResizeImage}
          onStartReorder={onStartReorder}
          onHoverChange={onChromeHoverChange}
        />
      )}
      {isImage ? (
        <InfoImageBlock
          block={block}
          editable={editable}
          active={active}
          onActivate={() => onActivate()}
        />
      ) : isQuestion ? (
        <QuestionBlockContent
          page={page}
          answer={answer}
          setAnswer={setAnswer}
          setUnlocked={setUnlocked}
          editable={editable}
          onPagePatch={onPagePatch}
          showChrome={showChrome}
          onChromeHoverChange={onChromeHoverChange}
          onActivate={() => onActivate()}
        />
      ) : (
        <InfoTextBlock
          block={block}
          blockId={blockId}
          editable={editable}
          onActivate={onActivate}
          onUpdate={onUpdate}
          onSplit={onSplit}
          shouldFocus={shouldFocus}
          onFocusComplete={onFocusComplete}
        />
      )}
    </section>
  )
}

function InfoBlockChrome({
  sectionRef,
  active,
  dragging,
  visible,
  isImage,
  locked,
  actionContent,
  dragHandleProps,
  hideDrag,
  resizeTitle,
  onActivate,
  onDuplicate,
  onDelete,
  deleteDisabled,
  onResizeImage,
  onStartReorder,
  onHoverChange,
}: any) {
  const [frame, setFrame] = React.useState<HTMLElement | null>(null)
  const [rect, setRect] = React.useState<{ top: number; height: number; width: number } | null>(null)

  React.useLayoutEffect(() => {
    let animationFrame = 0
    let stopped = false

    const measure = () => {
      if (stopped) return
      const section = sectionRef.current as HTMLElement | null
      const nextFrame = section?.closest('[data-learning-preview-frame]') as HTMLElement | null
      if (!section || !nextFrame) {
        setFrame(null)
        setRect(null)
        animationFrame = window.requestAnimationFrame(measure)
        return
      }

      const frameRect = nextFrame.getBoundingClientRect()
      const sectionRect = section.getBoundingClientRect()
      const scale = nextFrame.offsetWidth ? frameRect.width / nextFrame.offsetWidth : 1
      setFrame(nextFrame)
      setRect({
        top: (sectionRect.top - frameRect.top) / scale,
        height: sectionRect.height / scale,
        width: nextFrame.offsetWidth,
      })
      animationFrame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      stopped = true
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [sectionRef])

  if (!frame || !rect) return null

  return createPortal(
    <div
      className={`learning-info-frame-chrome-row ${visible || active ? 'is-visible' : ''} ${active ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ top: rect.top, width: rect.width, height: Math.max(1, rect.height) }}
    >
      <div
        className="learning-info-frame-hover-zone learning-info-frame-hover-zone-left"
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      />
      <div
        className="learning-info-frame-hover-zone learning-info-frame-hover-zone-right"
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      />
      <div className="learning-info-frame-rule" />
      {!hideDrag && (
        <button
          type="button"
          {...(dragHandleProps || {})}
          className="learning-info-stack-drag"
          title="Drag to reorder"
          aria-label="Drag section"
          onPointerDown={dragHandleProps ? undefined : (event) => {
            onHoverChange?.(true)
            onStartReorder(event)
          }}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onActivate()
          }}
        >
          <GripVertical size={16} strokeWidth={1.8} />
        </button>
      )}
      <div
        className="learning-info-stack-actions"
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        {actionContent ?? (!locked && (
          <>
            <button type="button" className="learning-info-section-button" aria-label="Duplicate section" data-tooltip="Duplicate" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onDuplicate() }}>
              <Copy size={14} strokeWidth={1.8} />
            </button>
            <button type="button" className="learning-info-section-button" aria-label="Delete section" data-tooltip="Delete" disabled={deleteDisabled} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (!deleteDisabled) onDelete() }}>
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          </>
        ))}
      </div>
      {(isImage || resizeTitle) && (
        <div
          className="learning-info-frame-image-resize"
          title={resizeTitle || 'Resize image'}
          onPointerDown={onResizeImage}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
        />
      )}
    </div>,
    frame
  )
}

function QuestionTitleSection({ editable, visible, onActivate, onAddOption, onChromeHoverChange, children }: any) {
  const sectionRef = React.useRef<HTMLElement | null>(null)
  const [hovered, setHovered] = React.useState(false)
  const [chromeHovered, setChromeHovered] = React.useState(false)

  return (
    <section
      ref={sectionRef}
      className={`learning-info-stack-section ${editable ? 'is-editable' : ''}`}
      onMouseEnter={() => {
        setHovered(true)
        onChromeHoverChange?.(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
        onChromeHoverChange?.(false)
      }}
      onMouseDown={() => editable && onActivate?.()}
    >
      {editable && (
        <InfoBlockChrome
          sectionRef={sectionRef}
          visible={visible || hovered || chromeHovered}
          active={hovered || chromeHovered}
          dragging={false}
          isImage={false}
          locked={false}
          hideDrag
          actionContent={(
            <button type="button" className="learning-info-section-button" data-tooltip="Add option" aria-label="Add option" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onAddOption() }}>
              <Plus size={14} strokeWidth={1.8} />
            </button>
          )}
          onActivate={onActivate}
          onDuplicate={() => null}
          onDelete={() => null}
          onResizeImage={() => null}
          onStartReorder={() => null}
          onHoverChange={(next: boolean) => {
            setChromeHovered(next)
            onChromeHoverChange?.(next)
          }}
        />
      )}
      {children}
    </section>
  )
}

function QuestionOptionSection({
  optionId,
  index,
  selected,
  correct,
  optionsLength,
  editable,
  isDragging,
  dragHandleProps,
  onActivate,
  onToggleCorrect,
  onDelete,
  visible,
  onChromeHoverChange,
  children,
}: any) {
  const sectionRef = React.useRef<HTMLElement | null>(null)
  const [hovered, setHovered] = React.useState(false)
  const [chromeHovered, setChromeHovered] = React.useState(false)

  return (
    <section
      ref={sectionRef}
      data-learning-question-option-id={optionId}
      className={`learning-info-stack-section ${editable ? 'is-editable' : ''} ${isDragging ? 'is-reordering' : ''}`}
      onMouseEnter={() => {
        setHovered(true)
        onChromeHoverChange?.(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
        onChromeHoverChange?.(false)
      }}
      onMouseDown={() => editable && onActivate?.()}
    >
      {editable && (
        <InfoBlockChrome
          sectionRef={sectionRef}
          visible={visible || hovered || chromeHovered}
          active={hovered || chromeHovered}
          dragging={isDragging}
          isImage={false}
          locked={false}
          dragHandleProps={dragHandleProps}
          actionContent={(
            <>
              <button type="button" className={`learning-info-section-button ${correct ? 'is-correct' : ''}`} data-tooltip={correct ? 'Correct' : 'Mark correct'} aria-label="Toggle correct answer" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onToggleCorrect(optionId) }}>
                <Check size={14} strokeWidth={1.8} />
              </button>
              <button type="button" className="learning-info-section-button" data-tooltip="Delete" aria-label="Delete option" disabled={optionsLength <= 2} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(optionId) }}>
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </>
          )}
          onActivate={onActivate}
          onDuplicate={() => null}
          onDelete={() => onDelete(optionId)}
          onResizeImage={() => null}
          onStartReorder={() => null}
          onHoverChange={(next: boolean) => {
            setChromeHovered(next)
            onChromeHoverChange?.(next)
          }}
        />
      )}
      <div className={`flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition ${selected ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]' : 'border-gray-200 hover:border-gray-300'}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${selected ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-gray-200 text-gray-600'}`}>{String.fromCharCode(65 + index)}</span>
        <div className="min-w-0 flex-1" onMouseDown={(event) => event.stopPropagation()}>
          {children}
        </div>
      </div>
    </section>
  )
}

function QuestionTextInputSection({
  section,
  sectionCount,
  editable,
  isDragging,
  dragHandleProps,
  onActivate,
  onDuplicate,
  onToggleSideBySide,
  onDelete,
  onResize,
  onActivateSection,
  visible,
  onChromeHoverChange,
  children,
}: any) {
  const sectionRef = React.useRef<HTMLElement | null>(null)
  const [hovered, setHovered] = React.useState(false)
  const [chromeHovered, setChromeHovered] = React.useState(false)
  const sideBySide = section.inputs.length > 1

  const activateSection = () => {
    onActivate?.()
    onActivateSection?.(section)
  }

  return (
    <section
      ref={sectionRef}
      data-learning-question-input-section-id={section.id}
      className={`learning-info-stack-section ${editable ? 'is-editable' : ''} ${isDragging ? 'is-reordering' : ''}`}
      onMouseEnter={() => {
        setHovered(true)
        onChromeHoverChange?.(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
        onChromeHoverChange?.(false)
      }}
      onMouseDown={() => editable && activateSection()}
    >
      {editable && (
        <InfoBlockChrome
          sectionRef={sectionRef}
          visible={visible || hovered || chromeHovered}
          active={hovered || chromeHovered}
          dragging={isDragging}
          isImage={false}
          locked={false}
          dragHandleProps={dragHandleProps}
          resizeTitle="Resize input"
          actionContent={(
            <>
              <button type="button" className="learning-info-section-button" data-tooltip="Duplicate" aria-label="Duplicate input section" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onDuplicate(section) }}>
                <Copy size={14} strokeWidth={1.8} />
              </button>
              <button type="button" className={`learning-info-section-button ${sideBySide ? 'is-correct' : ''}`} data-tooltip={sideBySide ? 'Single input' : 'Side by side'} aria-label="Toggle side by side inputs" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onToggleSideBySide(section) }}>
                <Columns2 size={14} strokeWidth={1.8} />
              </button>
              <button type="button" className="learning-info-section-button" data-tooltip="Delete" aria-label="Delete input section" disabled={sectionCount <= 1} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onDelete(section) }}>
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </>
          )}
          onActivate={activateSection}
          onDuplicate={() => onDuplicate(section)}
          onDelete={() => onDelete(section)}
          onResizeImage={(event: React.PointerEvent<HTMLDivElement>) => onResize(section, event)}
          onStartReorder={() => null}
          onHoverChange={(next: boolean) => {
            setChromeHovered(next)
            onChromeHoverChange?.(next)
          }}
        />
      )}
      {children}
    </section>
  )
}

function QuestionBlockContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch, onActivate, showChrome, onChromeHoverChange }: any) {
  const titleRef = React.useRef<HTMLElement | null>(null)
  if (page.page_type === 'multiple_choice') {
    const options = page.content?.options || []
    const visibleOptions = options.length ? options : [{ id: 'a', text: '' }, { id: 'b', text: '' }]
    const completion = page.completion || {}
    const scoring = page.scoring || {}
    const correctOptionIds = new Set(scoring.correct_option_ids || scoring.correctOptionIds || [])
    const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
    const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 1))
    const selectedIds = Array.isArray(answer?.option_ids)
      ? answer.option_ids
      : answer?.option_id
        ? [answer.option_id]
        : []
    const patchOptions = (nextOptions: any[]) => {
      const ids = new Set(nextOptions.map((option: any, index: number) => option?.id || String(index)))
      const variableBindings = completion.variable_bindings || completion.variableBindings || {}
      const nextOptionBindings = { ...(variableBindings.options || {}) }
      Object.keys(nextOptionBindings).forEach((id) => {
        if (!ids.has(id)) nextOptionBindings[id] = null
      })
      onPagePatch?.({
        content: { ...(page.content || {}), options: nextOptions },
        scoring: {
          ...scoring,
          correct_option_ids: (scoring.correct_option_ids || []).filter((id: string) => ids.has(id)),
        },
        completion: {
          ...completion,
          min_selections: Math.min(minSelections, nextOptions.length),
          max_selections: Math.min(maxSelections, nextOptions.length),
          variable_bindings: { ...variableBindings, options: nextOptionBindings },
        },
      })
    }
    const updateOption = (optionIndex: number, text: string) => {
      const nextOptions = visibleOptions.map((option: any, index: number) => ({
        ...(option || { id: String(index) }),
        id: option?.id || String(index),
      }))
      nextOptions[optionIndex] = { ...(nextOptions[optionIndex] || { id: String(optionIndex) }), text }
      patchOptions(nextOptions)
    }
    const addOption = () => {
      const nextId = createLearningLocalId('option')
      patchOptions([...visibleOptions, { id: nextId, text: `Option ${visibleOptions.length + 1}` }])
    }
    const deleteOption = (id: string) => {
      if (visibleOptions.length <= 2) return
      patchOptions(visibleOptions.filter((option: any, index: number) => (option.id || String(index)) !== id))
    }
    const toggleCorrect = (id: string) => {
      const next = new Set(correctOptionIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onPagePatch?.({ scoring: { ...scoring, mode: 'points', score_policy: 'exact_match', correct_option_ids: Array.from(next) } })
    }
    const toggleOption = (id: string) => {
      if (editable) return
      let next = selectedIds.includes(id)
        ? selectedIds.filter((selectedId: string) => selectedId !== id)
        : maxSelections <= 1
          ? [id]
          : [...selectedIds, id].slice(0, maxSelections)
      next = next.filter(Boolean)
      setAnswer({ option_ids: next, option_id: next[0] })
      setUnlocked(next.length >= minSelections && next.length <= maxSelections)
    }

    return (
      <div className="learning-question-block" onMouseDown={() => editable && onActivate()}>
        {!page.content?.hide_prompt && (
          <QuestionTitleSection
            editable={editable}
            visible={showChrome}
            onActivate={onActivate}
            onAddOption={addOption}
            onChromeHoverChange={onChromeHoverChange}
          >
            <EditableText
              as="h1"
              editable={editable}
              value={page.content?.prompt || ''}
              placeholder="Question prompt"
              onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), prompt: value } })}
              className="text-3xl font-bold text-gray-950"
              elementRef={titleRef}
            />
          </QuestionTitleSection>
        )}
        {editable ? (
          <ReorderableList
            droppableId={`learning-mcq-options-${page.page_uuid}`}
            items={visibleOptions}
            getId={(option: any, index: number) => option.id || String(index)}
            onReorder={(nextOptions: any[]) => patchOptions(nextOptions)}
            className="mt-6 space-y-3"
            itemClassName={(_option, _index, isDragging) => isDragging ? 'rounded-xl shadow-2xl shadow-gray-950/20' : 'rounded-xl'}
            renderItem={({ item: option, index, dragHandleProps }) => {
              const optionId = option.id || String(index)
              return (
                <QuestionOptionSection
                  key={optionId}
                  optionId={optionId}
                  index={index}
                  selected={selectedIds.includes(optionId)}
                  correct={correctOptionIds.has(optionId)}
                  optionsLength={visibleOptions.length}
                  editable={editable}
                  dragHandleProps={dragHandleProps}
                  onActivate={onActivate}
                  onToggleCorrect={toggleCorrect}
                  onDelete={deleteOption}
                  visible={showChrome}
                  onChromeHoverChange={onChromeHoverChange}
                >
                  <EditableText
                    editable
                    value={option.text || ''}
                    placeholder={`Option ${index + 1}`}
                    onChange={(value: string) => updateOption(index, value)}
                    className="min-w-0 text-gray-900 outline-none"
                  />
                </QuestionOptionSection>
              )
            }}
          />
        ) : (
          <div className="mt-6 space-y-3">
            {visibleOptions.map((option: any, index: number) => (
              <button
                key={option.id || index}
                onClick={() => toggleOption(option.id || String(index))}
                className={`flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition ${selectedIds.includes(option.id || String(index)) ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${selectedIds.includes(option.id || String(index)) ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-gray-200 text-gray-600'}`}>{String.fromCharCode(65 + index)}</span>
                <span className="min-w-0 flex-1 text-gray-900">{option.text || `Option ${index + 1}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const inputs = getQuestionTextInputs(page)
  const inputSections = getQuestionTextInputSections(inputs)
  const rules = page.completion?.inputs || {}
  const answerInputs = answer?.inputs || {}
  const completion = page.completion || {}
  const patchInputs = (nextInputs: any[], nextRules = rules) => {
    const inputIds = new Set(nextInputs.map((input: any) => input.id))
    const variableBindings = completion.variable_bindings || completion.variableBindings || {}
    const nextInputBindings = { ...(variableBindings.inputs || {}) }
    Object.keys(nextInputBindings).forEach((id) => {
      if (!inputIds.has(id)) nextInputBindings[id] = null
    })
    onPagePatch?.({
      content: { ...(page.content || {}), inputs: nextInputs },
      completion: {
        ...completion,
        inputs: nextRules,
        variable_bindings: { ...variableBindings, inputs: nextInputBindings },
      },
    })
  }
  const updateInputConfig = (inputId: string, patch: any) => {
    patchInputs(inputs.map((input: any) => input.id === inputId ? { ...input, ...patch } : input))
  }
  const duplicateInputSection = (section: any) => {
    const sectionId = createLearningLocalId('input_section')
    const nextRules = { ...rules }
    const clonedInputs = section.inputs.map((input: any, index: number) => {
      const id = createLearningLocalId('input')
      nextRules[id] = { ...(rules[input.id] || { min_words: 1, max_words: 0 }) }
      return {
        ...input,
        id,
        section_id: section.inputs.length > 1 ? sectionId : id,
        label: `${input.label || `Response ${index + 1}`} copy`,
      }
    })
    const insertAt = inputs.findIndex((input: any) => input.id === section.inputs[section.inputs.length - 1]?.id)
    const nextInputs = [...inputs]
    nextInputs.splice(insertAt >= 0 ? insertAt + 1 : nextInputs.length, 0, ...clonedInputs)
    patchInputs(nextInputs, nextRules)
  }
  const removeInputSection = (section: any) => {
    if (inputSections.length <= 1) return
    const removeIds = new Set<string>(section.inputs.map((input: any) => input.id))
    const nextRules = { ...rules }
    removeIds.forEach((inputId) => delete nextRules[inputId])
    patchInputs(inputs.filter((input: any) => !removeIds.has(input.id)), nextRules)
  }
  const toggleSectionSideBySide = (section: any) => {
    if (section.inputs.length > 1) {
      const [keep, ...remove] = section.inputs
      const removeIds = new Set<string>(remove.map((input: any) => input.id))
      const nextRules = { ...rules }
      removeIds.forEach((inputId) => delete nextRules[inputId])
      patchInputs(inputs
        .filter((input: any) => !removeIds.has(input.id))
        .map((input: any) => input.id === keep.id ? { ...input, width: 'full', section_id: input.id } : input),
        nextRules)
      activateInputSection({ inputs: [keep] })
      return
    }

    const source = section.inputs[0]
    if (!source) return
    const sectionId = source.section_id || createLearningLocalId('input_section')
    const newId = createLearningLocalId('input')
    const newInput = {
      id: newId,
      section_id: sectionId,
      label: `Response ${inputs.length + 1}`,
      placeholder: '',
      variant: source.variant || 'short_answer',
      width: 'half',
      height: Number(source.height) || 160,
    }
    const sourceIndex = inputs.findIndex((input: any) => input.id === source.id)
    const nextInputs = inputs.map((input: any) => input.id === source.id ? { ...input, section_id: sectionId, width: 'half' } : input)
    nextInputs.splice(sourceIndex >= 0 ? sourceIndex + 1 : nextInputs.length, 0, newInput)
    patchInputs(nextInputs, { ...rules, [newId]: { ...(rules[source.id] || { min_words: 1, max_words: 0 }) } })
    activateInputSection({ inputs: [{ ...source, section_id: sectionId, width: 'half' }, newInput] })
  }
  const resizeTextInput = (section: any, startEvent: React.PointerEvent<HTMLDivElement>) => {
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const sectionInputIds = new Set(section.inputs.map((input: any) => input.id))
    const startHeight = Number(section.inputs[0]?.height) || 120
    const onMove = (event: PointerEvent) => {
      const nextHeight = Math.round(Math.max(48, Math.min(420, startHeight + event.clientY - startY)))
      patchInputs(inputs.map((input: any) => sectionInputIds.has(input.id) ? { ...input, height: nextHeight, variant: nextHeight <= 56 ? 'single_line' : 'short_answer' } : input))
    }
    const onEnd = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
  }
  const updateTextInput = (inputId: string, text: string) => {
    const nextInputs = {
      ...answerInputs,
      [inputId]: { ...(answerInputs[inputId] || {}), text },
    }
    setAnswer({ inputs: nextInputs, text: Object.values(nextInputs).map((item: any) => item?.text || '').join('\n') })
    setUnlocked(areTextInputsComplete(inputs, rules, nextInputs))
  }
  const activateInputSection = (section: any) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('learning-question-input-section-active', {
      detail: { pageUuid: page.page_uuid, inputIds: section.inputs.map((input: any) => input.id) },
    }))
  }
  const renderInputSection = (section: any, index: number, dragHandleProps?: any, isDragging = false) => {
    const sideBySide = section.inputs.length > 1

    return (
      <QuestionTextInputSection
        key={section.id}
        section={section}
        sectionCount={inputSections.length}
        editable={editable}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
        onActivate={onActivate}
        onDuplicate={duplicateInputSection}
        onToggleSideBySide={toggleSectionSideBySide}
        onDelete={removeInputSection}
        onResize={resizeTextInput}
        onActivateSection={activateInputSection}
        visible={showChrome}
        onChromeHoverChange={onChromeHoverChange}
      >
        <div className={`grid gap-3 ${sideBySide ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {section.inputs.map((input: any, inputIndex: number) => {
            const height = Math.max(48, Number(input.height) || 120)
            const isSingleLine = height <= 56 || input.variant === 'single_line'
            const value = answerInputs[input.id]?.text || ''
            return (
              <div key={input.id} className="relative min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  {(editable || input.label) ? (
                    <EditableText
                      editable={editable}
                      value={input.label || ''}
                      placeholder={`Input ${index + inputIndex + 1}`}
                      onChange={(value: string) => updateInputConfig(input.id, { label: value })}
                      className="min-w-0 flex-1 text-lg font-bold leading-7 text-gray-900"
                    />
                  ) : <span className="min-w-0 flex-1" />}
                </div>
                {isSingleLine ? (
                  <input
                    value={editable ? input.placeholder || '' : value}
                    onChange={(event) => editable ? updateInputConfig(input.id, { placeholder: event.target.value }) : updateTextInput(input.id, event.target.value)}
                    placeholder={editable ? 'Placeholder' : input.placeholder}
                    style={{ height }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 text-gray-950 outline-none shadow-sm placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]"
                  />
                ) : (
                  <textarea
                    readOnly={false}
                    value={editable ? input.placeholder || '' : value}
                    onChange={(event) => editable ? updateInputConfig(input.id, { placeholder: event.target.value }) : updateTextInput(input.id, event.target.value)}
                    placeholder={editable ? 'Placeholder' : input.placeholder}
                    style={{ height }}
                    className="w-full resize-none rounded-xl border border-gray-200 bg-white p-4 text-gray-950 outline-none shadow-sm placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]"
                  />
                )}
              </div>
            )
          })}
        </div>
      </QuestionTextInputSection>
    )
  }

  return (
    <div className="learning-question-block" onMouseDown={() => editable && onActivate()}>
      {editable ? (
        <ReorderableList
          droppableId={`learning-text-inputs-${page.page_uuid}`}
          items={inputSections}
          getId={(section: any, index: number) => section.id || String(index)}
          onReorder={(nextSections: any[]) => patchInputs(nextSections.flatMap((section: any) => section.inputs))}
          className="mt-6 space-y-3"
          itemClassName={(_section: any, _index, isDragging) => isDragging ? 'rounded-xl shadow-2xl shadow-gray-950/20' : 'rounded-xl'}
          renderItem={({ item: section, index, isDragging, dragHandleProps }) => renderInputSection(section, index, dragHandleProps, isDragging)}
        />
      ) : (
        <div className="mt-6 space-y-3">
          {inputSections.map((section: any, index: number) => renderInputSection(section, index))}
        </div>
      )}
      {page.scoring?.mode === 'manual' && !editable ? (
        <p className="mt-3 text-xs font-semibold text-gray-500">Your response will be reviewed after you submit.</p>
      ) : null}
    </div>
  )
}

const InfoTextAlign = Extension.create({
  name: 'infoTextAlign',
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

function InfoTextBlock({ block, blockId, editable, onActivate, onUpdate, onSplit, shouldFocus, onFocusComplete }: any) {
  const content = React.useMemo(() => ({
    type: 'doc',
    content: Array.isArray(block)
      ? (block.length ? block : [EMPTY_PARAGRAPH]).map(stripInfoBlockMeta)
      : [stripInfoBlockMeta(block)],
  }), [block])
  const onSplitRef = React.useRef(onSplit)
  const editorRef = React.useRef<any>(null)

  React.useEffect(() => {
    onSplitRef.current = onSplit
  }, [onSplit])

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false
        const currentEditor = editorRef.current
        if (currentEditor?.isActive('bulletList') || currentEditor?.isActive('orderedList') || currentEditor?.isActive('listItem')) {
          const split = getInfoListExitBlocks(currentEditor, false)
          if (!split) return false
          event.preventDefault()
          setInfoEditorContent(currentEditor, split.currentBlock)
          onSplitRef.current?.(split.currentBlock, split.nextBlock)
          return true
        }
        event.preventDefault()
        onSplitRef.current?.(getInfoEditorOutputBlock(currentEditor?.getJSON().content || []))
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        codeBlock: false,
        trailingNode: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => node.type.name === 'heading' ? 'Page heading' : 'Add page content...',
        showOnlyCurrent: false,
        showOnlyWhenEditable: false,
      }),
      InfoTextAlign,
    ],
    content,
    onFocus: ({ editor }) => onActivate(editor),
    onSelectionUpdate: ({ editor }) => onActivate(editor),
    onUpdate: ({ editor }) => {
      const nodes = editor.getJSON().content || []
      const escapedList = getInfoEscapedListBlocks(nodes)
      if (escapedList) {
        setInfoEditorContent(editor, escapedList.currentBlock)
        onSplitRef.current?.(escapedList.currentBlock, escapedList.nextBlock)
        return
      }
      onUpdate(getInfoEditorOutputBlock(nodes))
    },
  }, [editable, blockId])

  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  React.useEffect(() => {
    if (!editor || !shouldFocus) return
    const frame = window.requestAnimationFrame(() => {
      editor.commands.focus('start')
      onFocusComplete?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editor, onFocusComplete, shouldFocus])

  React.useEffect(() => {
    if (!editor || editor.isFocused) return
    const current = JSON.stringify(editor.getJSON())
    const next = JSON.stringify(content)
    if (current !== next) editor.commands.setContent(content)
  }, [content, editor])

  return <EditorContent editor={editor} className="learning-info-text-block" />
}

function InfoImageBlock({ block, editable, active, onActivate }: any) {
  const attrs = block.attrs || {}
  const height = Number(attrs.height) || 220
  return (
    <figure
      data-learning-image
      className={`learning-info-image-block ${active ? 'is-active' : ''}`}
      style={{ height }}
      onMouseDown={() => editable && onActivate()}
    >
      {attrs.src ? <img src={attrs.src} alt={attrs.alt || ''} /> : <div data-learning-image-empty>Add image</div>}
    </figure>
  )
}

function InfoFormatButton({ title, active, onClick, children }: any) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${active ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}
    >
      {children}
    </button>
  )
}

function getActiveTextAlignment(editor: any) {
  const attrs = editor?.isActive?.('heading')
    ? editor.getAttributes?.('heading')
    : editor?.getAttributes?.('paragraph')
  return attrs?.textAlign || 'left'
}

function setActiveTextAlignment(editor: any, textAlign: 'left' | 'center' | 'right') {
  if (!editor) return
  const attrs = textAlign === 'left' ? { textAlign: null } : { textAlign }
  if (editor.isActive?.('heading')) {
    editor.chain().focus().updateAttributes('heading', attrs).run()
    return
  }
  editor.chain().focus().updateAttributes('paragraph', attrs).run()
}

function normalizeInfoBlocks(nodes: any[]) {
  return nodes?.length ? nodes.map((node) => withInfoBlockMeta(node)) : [createInfoTextBlock('heading'), createInfoTextBlock('paragraph')]
}

function getInfoEditorOutputBlock(nodes: any[]) {
  const nextNode = (nodes || []).find((node) => !isEmptyInfoParagraph(node)) || nodes?.[0]
  return sanitizeInfoTextBlock(nextNode || createInfoTextBlock('paragraph'))
}

function setInfoEditorContent(editor: any, block: any) {
  editor?.commands?.setContent?.({ type: 'doc', content: [stripInfoBlockMeta(block)] }, false)
}

function isEmptyInfoParagraph(node: any) {
  return node?.type === 'paragraph' && (!node.content || node.content.length === 0)
}

function getInfoListExitBlocks(editor: any, allowNonEmpty: boolean) {
  if (!editor?.isActive?.('listItem')) return null
  const nodes = editor.getJSON?.().content || []
  const listNode = nodes.find((node: any) => node?.type === 'bulletList' || node?.type === 'orderedList')
  if (!listNode) return null

  const listItems = listNode.content || []
  const selectedItem = getInfoSelectedListItem(editor)
  const itemIndex = selectedItem ? getInfoMatchingListItemIndex(listItems, selectedItem) : getInfoSelectedListItemIndex(editor)
  const activeItem = selectedItem || listItems[itemIndex]
  if (!activeItem) return getInfoEscapedListBlocks(nodes)

  const nextBlock = getInfoListItemAsParagraph(activeItem)
  const isEmpty = isEmptyInfoParagraph(nextBlock)
  if (!isEmpty && !allowNonEmpty) return null

  const remainingItems = removeInfoListItem(listItems, activeItem, itemIndex)
  if (!remainingItems.length && !isEmpty) {
    return {
      currentBlock: createInfoTextBlock('paragraph'),
      nextBlock,
      replaceCurrent: true,
    }
  }
  const currentBlock = remainingItems.length
    ? sanitizeInfoTextBlock({ ...listNode, content: remainingItems })
    : createInfoTextBlock('paragraph')

  return {
    currentBlock,
    nextBlock: isEmpty ? createInfoTextBlock('paragraph') : nextBlock,
  }
}

function getInfoSelectedListItem(editor: any) {
  const resolvedPosition = editor.state?.selection?.$from
  if (!resolvedPosition) return null
  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const node = resolvedPosition.node(depth)
    if (node?.type?.name === 'listItem') return node.toJSON?.() || null
  }
  return null
}

function getInfoMatchingListItemIndex(listItems: any[], selectedItem: any) {
  const selectedJson = JSON.stringify(selectedItem)
  const exactIndex = listItems.findIndex((item: any) => JSON.stringify(item) === selectedJson)
  if (exactIndex >= 0) return exactIndex

  const selectedText = getInfoNodeText(selectedItem).trim()
  if (!selectedText) return listItems.findIndex((item: any) => isEmptyInfoListItem(item))
  return listItems.findIndex((item: any) => getInfoNodeText(item).trim() === selectedText)
}

function removeInfoListItem(listItems: any[], activeItem: any, fallbackIndex: number) {
  let removed = false
  const activeJson = JSON.stringify(activeItem)
  const activeText = getInfoNodeText(activeItem).trim()
  return listItems.filter((item: any, index: number) => {
    if (removed) return true
    const isMatch = JSON.stringify(item) === activeJson ||
      (activeText ? getInfoNodeText(item).trim() === activeText : isEmptyInfoListItem(item)) ||
      index === fallbackIndex
    if (!isMatch) return true
    removed = true
    return false
  })
}

function normalizeInfoAdjacentLists(blocks: any[], ids: string[], activeIndex: number) {
  const nextBlocks = [...blocks]
  const nextIds = [...ids]
  let nextActiveIndex = activeIndex
  let index = 0

  while (index < nextBlocks.length - 1) {
    const current = nextBlocks[index]
    const next = nextBlocks[index + 1]
    if (!canMergeInfoListBlocks(current, next)) {
      index += 1
      continue
    }

    nextBlocks[index] = {
      ...current,
      content: [...(current.content || []), ...(next.content || [])],
    }
    nextBlocks.splice(index + 1, 1)
    nextIds.splice(index + 1, 1)
    if (nextActiveIndex === index + 1) nextActiveIndex = index
    else if (nextActiveIndex > index + 1) nextActiveIndex -= 1
  }

  return {
    blocks: nextBlocks,
    ids: nextIds,
    activeIndex: Math.max(0, Math.min(nextActiveIndex, nextBlocks.length - 1)),
    merged: nextBlocks.length !== blocks.length,
  }
}

function canMergeInfoListBlocks(first: any, second: any) {
  return Boolean(
    first &&
    second &&
    first.type === second.type &&
    (first.type === 'bulletList' || first.type === 'orderedList')
  )
}

function getInfoEscapedListBlocks(nodes: any[]) {
  if (!nodes?.length) return null
  const listIndex = nodes.findIndex((node: any) => node?.type === 'bulletList' || node?.type === 'orderedList')
  if (listIndex < 0) return null
  const trailingNode = nodes.slice(listIndex + 1).find((node: any) => node?.type === 'paragraph')
  if (!trailingNode) return null
  return {
    currentBlock: sanitizeInfoTextBlock(nodes[listIndex]),
    nextBlock: sanitizeInfoTextBlock(trailingNode),
  }
}

function getInfoSelectedListItemIndex(editor: any) {
  const resolvedPosition = editor.state?.selection?.$from
  if (!resolvedPosition) return -1
  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    if (resolvedPosition.node(depth)?.type?.name === 'listItem') {
      return resolvedPosition.index(depth - 1)
    }
  }
  return -1
}

function getInfoListItemAsParagraph(node: any) {
  const paragraph = (node?.content || []).find((child: any) => child?.type === 'paragraph')
  return sanitizeInfoTextBlock(paragraph || createInfoTextBlock('paragraph'))
}

function sanitizeInfoTextBlock(node: any) {
  const nextNode = withInfoBlockMeta(node || createInfoTextBlock('paragraph'))
  if (nextNode.type !== 'bulletList' && nextNode.type !== 'orderedList') return nextNode

  const items = [...(nextNode.content || [])]
  while (items.length && isEmptyInfoListItem(items[items.length - 1])) {
    items.pop()
  }
  if (!items.length) return createInfoTextBlock('paragraph')
  return { ...nextNode, content: items }
}

function isEmptyInfoListItem(node: any) {
  return node?.type === 'listItem' && !getInfoNodeText(node).trim()
}

function getInfoNodeText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return (node.content || []).map((child: any) => getInfoNodeText(child)).join('')
}

function withInfoBlockMeta(node: any) {
  return JSON.parse(JSON.stringify(node || { type: 'paragraph' }))
}

function stripInfoBlockMeta(node: any) {
  return JSON.parse(JSON.stringify(node || { type: 'paragraph' }))
}

function cloneInfoBlock(block: any) {
  return stripInfoBlockMeta(block)
}

function createInfoTextBlock(type: 'heading' | 'paragraph') {
  return type === 'heading' ? { type: 'heading', attrs: { level: 1 } } : { type: 'paragraph' }
}

function createInfoImageBlock() {
  return { type: 'learningImage', attrs: { src: '', mode: 'url', height: 220 } }
}

function createQuestionBlock() {
  return { type: 'learningQuestion', attrs: { locked: true } }
}

function isLearningQuestionPage(page: any) {
  return page?.page_type === 'multiple_choice' || page?.page_type === 'text_input'
}

function isQuestionResponseRequired(page: any) {
  if (!page) return false
  if (page.page_type === 'standard') return Boolean(findQuestionBlock(page))
  return isLearningQuestionPage(page)
}

function isLearningTextBlock(block: any) {
  return Boolean(block && block.type !== 'learningImage' && block.type !== 'learningQuestion')
}

function countLearningTextBlocks(blocks: any[]) {
  return (blocks || []).filter(isLearningTextBlock).length
}

function ensureQuestionBlock(blocks: any[], options: { questionPageType?: string } = {}) {
  const nextBlocks = (blocks || []).filter((block: any) => block?.type !== 'learningQuestion')
  const firstQuestionIndex = (blocks || []).findIndex((block: any) => block?.type === 'learningQuestion')
  const hadTextBlocks = countLearningTextBlocks(nextBlocks) > 0
  if (options.questionPageType === 'text_input' && !hadTextBlocks) {
    nextBlocks.unshift(createInfoTextBlock('paragraph'))
  }
  const insertAt = firstQuestionIndex >= 0
    ? options.questionPageType === 'text_input' && !hadTextBlocks
      ? nextBlocks.length
      : Math.min(firstQuestionIndex, nextBlocks.length)
    : options.questionPageType === 'text_input'
      ? nextBlocks.length
      : 0
  nextBlocks.splice(insertAt, 0, createQuestionBlock())
  return nextBlocks
}

function syncIdsToBlocks(normalizedBlocks: any[], originalBlocks: any[], originalIds: string[], createBlockId: () => string) {
  const nextIds: string[] = []
  let sourceIndex = 0
  normalizedBlocks.forEach((block) => {
    if (block?.type === originalBlocks[sourceIndex]?.type) {
      nextIds.push(originalIds[sourceIndex] || createBlockId())
      sourceIndex += 1
      return
    }
    const matchingIndex = originalBlocks.findIndex((item, index) => index >= sourceIndex && item?.type === block?.type)
    if (matchingIndex >= 0) {
      nextIds.push(originalIds[matchingIndex] || createBlockId())
      sourceIndex = matchingIndex + 1
      return
    }
    nextIds.push(createBlockId())
  })
  return nextIds
}

function getLegacyResponseTextContent(content: any) {
  const variant = content?.variants?.default || content?.default || {}
  const title = (variant.title || content?.heading || '').trim()
  const body = (variant.body || content?.body || '').trim()
  const nodes: any[] = []
  if (title) nodes.push({ type: 'text', text: title })
  if (title && body) nodes.push({ type: 'hardBreak' })
  if (body) nodes.push({ type: 'text', text: body })
  return nodes.length ? nodes : undefined
}

function getResponseBlockContent(content: any, responseKey: string) {
  if (responseKey === 'default') return content
  return content?.response_variants?.[responseKey] || {}
}

function getQuestionTextInputs(page: any) {
  const inputs = page.content?.inputs
  if (Array.isArray(inputs) && inputs.length) {
    return inputs.map((input: any, index: number) => ({
      id: input.id || String(index),
      section_id: input.section_id || input.sectionId || '',
      label: input.label || `Response ${index + 1}`,
      placeholder: input.placeholder || '',
      variant: input.variant || 'short_answer',
      width: input.width || 'full',
      height: Number(input.height) || 160,
    }))
  }
  return [{ id: 'response', section_id: 'response', label: '', placeholder: '', variant: 'short_answer', width: 'full', height: 160 }]
}

function getQuestionTextInputSections(inputs: any[]) {
  const sections: Array<{ id: string; inputs: any[] }> = []
  const consumed = new Set<string>()

  inputs.forEach((input, index) => {
    if (consumed.has(input.id)) return

    if (input.section_id) {
      const grouped = inputs.filter((item) => item.section_id === input.section_id).slice(0, 2)
      grouped.forEach((item) => consumed.add(item.id))
      sections.push({
        id: input.section_id,
        inputs: grouped.map((item) => ({ ...item, width: grouped.length > 1 ? 'half' : 'full', section_id: input.section_id })),
      })
      return
    }

    const next = inputs[index + 1]
    if (input.width === 'half' && next && !next.section_id && next.width === 'half') {
      const sectionId = `input_section_${input.id}_${next.id}`
      consumed.add(input.id)
      consumed.add(next.id)
      sections.push({
        id: sectionId,
        inputs: [
          { ...input, width: 'half', section_id: sectionId },
          { ...next, width: 'half', section_id: sectionId },
        ],
      })
      return
    }

    consumed.add(input.id)
    sections.push({ id: input.id, inputs: [{ ...input, width: 'full', section_id: input.id }] })
  })

  return sections.length ? sections : [{ id: 'response', inputs: [{ id: 'response', section_id: 'response', label: '', placeholder: '', variant: 'short_answer', width: 'full', height: 160 }] }]
}

function areTextInputsComplete(inputs: any[], rules: any, answerInputs: any) {
  return inputs.every((input) => {
    const rule = rules?.[input.id] || { required: true, min_words: 1, max_words: 0 }
    const text = String(answerInputs?.[input.id]?.text || '').trim()
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0
    const minWords = Number(rule.min_words || 0)
    const required = rule.required ?? minWords > 0
    if (required && !text) return false
    if (text && minWords > words) return false
    if (text && Number(rule.max_words || 0) > 0 && words > Number(rule.max_words)) return false
    return true
  })
}

function createLearningLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getRuntimeResponseKey(page: any, pages: any[], run: any) {
  const content = page.content || {}
  const linkedQuestion = findLinkedQuestionForResponse(page, pages)
  if (!linkedQuestion?.page_uuid) return 'default'

  const attempts = run?.attempts || []
  const attempt = attempts
    .filter((item: any) => {
      const resultPageUuid = item.result?.page_uuid
      return resultPageUuid === linkedQuestion.page_uuid || item.page_uuid === linkedQuestion.page_uuid
    })
    .at(-1)
  if (!attempt || attempt.result?.grading_status === 'pending') return 'default'
  const optionKeys = [
    ...(Array.isArray(attempt?.answer?.option_ids) ? attempt.answer.option_ids : []),
    ...(Array.isArray(attempt?.result?.option_ids) ? attempt.result.option_ids : []),
    ...(Array.isArray(attempt?.result?.selected) ? attempt.result.selected : []),
    attempt?.answer?.option_id,
    attempt?.result?.answer?.option_id,
    attempt?.result?.option_id,
    typeof attempt?.result?.selected === 'string' ? attempt.result.selected : null,
    attempt?.feedback_key,
    attempt?.is_correct === true ? 'correct' : attempt?.is_correct === false ? 'incorrect' : null,
  ].filter(Boolean)
  const optionKey = optionKeys.find((key: string) => content.response_variants?.[key]?.enabled)
  return optionKey || 'default'
}

function findLinkedQuestionForResponse(responsePage: any, pages: any[]) {
  const linkedUuid = responsePage.content?.linked_page_uuid
  if (linkedUuid) {
    const linked = pages.find((page: any) => page.page_uuid === linkedUuid)
    if (linked) return linked
  }

  const responseIndex = pages.findIndex((page: any) => page.page_uuid === responsePage.page_uuid)
  const previousPage = responseIndex > 0 ? pages[responseIndex - 1] : null
  return isLearningQuestionPage(previousPage) ? previousPage : null
}

function getInfoRichTextContent(
  content: any,
  options: { includeQuestionBlock?: boolean; questionPageType?: string; responseTemplate?: boolean } = {}
) {
  if (content?.rich_text?.type === 'doc') {
    if (options.responseTemplate && !content.rich_text.content?.length) {
      return createResponseRichTextContent(content)
    }
    return {
      ...content.rich_text,
      content: options.includeQuestionBlock ? ensureQuestionBlock(content.rich_text.content || [], { questionPageType: options.questionPageType }) : content.rich_text.content,
    }
  }

  const nodes: any[] = []
  if (options.responseTemplate) {
    return createResponseRichTextContent(content)
  }

  const heading = (content?.heading || '').trim()
  const body = (content?.body || '').trim()
  const imageUrl = content?.image_url || content?.image_data_url || ''

  if (heading) {
    nodes.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: heading }],
    })
  }

  if (body) {
    body.split(/\n{2,}/).forEach((paragraph: string) => {
      nodes.push({
        type: 'paragraph',
        content: paragraph
          ? [{ type: 'text', text: paragraph.replace(/\n/g, ' ') }]
          : undefined,
      })
    })
  }

  if (imageUrl) {
    nodes.push({
      type: 'learningImage',
      attrs: { src: imageUrl, mode: content?.image_data_url ? 'upload' : 'url', height: content?.image_height || 220 },
    })
  }

  if (!nodes.length && (!options.includeQuestionBlock || options.questionPageType === 'text_input')) {
    nodes.push({ type: 'heading', attrs: { level: 1 } }, { type: 'paragraph' })
  }

  if (options.includeQuestionBlock) {
    return {
      type: 'doc',
      content: ensureQuestionBlock(nodes, { questionPageType: options.questionPageType }),
    }
  }

  return { type: 'doc', content: nodes }
}

function createResponseRichTextContent(content: any) {
  return {
    type: 'doc',
    content: [
      createInfoImageBlock(),
      {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: getLegacyResponseTextContent(content),
      },
    ],
  }
}

function VideoPageContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch }: any) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const youtubePlayerRef = React.useRef<any>(null)
  const videoUrl = page.content?.video_url || ''
  const videoTitle = page.content?.heading || ''
  const youtubeId = React.useMemo(() => getYouTubeId(videoUrl), [videoUrl])
  const toggleEventName = `learning-video-toggle-${page.page_uuid}`
  const seekEventName = `learning-video-seek-${page.page_uuid}`
  const allowScrubbing = page.content?.allow_scrubbing !== false

  React.useEffect(() => {
    if (editable) return
    setUnlocked(false)
    setAnswer?.({ videoStarted: Boolean(videoUrl), videoProgress: 0, videoCurrentTime: 0, videoDuration: 0, videoPlaying: true })
  }, [editable, page.page_uuid, setAnswer, setUnlocked, videoUrl])

  React.useEffect(() => {
    if (editable) return

    const togglePlayback = () => {
      const video = videoRef.current
      if (video) {
        if (video.paused) void video.play()
        else video.pause()
        return
      }

      const youtubePlayer = youtubePlayerRef.current
      if (!youtubePlayer) return
      if (youtubePlayer.getPlayerState?.() === 1) youtubePlayer.pauseVideo?.()
      else youtubePlayer.playVideo?.()
    }

    window.addEventListener(toggleEventName, togglePlayback)
    return () => window.removeEventListener(toggleEventName, togglePlayback)
  }, [editable, toggleEventName])

  React.useEffect(() => {
    if (editable || !allowScrubbing) return

    const seekPlayback = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      const progress = Number(detail.progress)
      if (!Number.isFinite(progress)) return

      const video = videoRef.current
      if (video) {
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        if (duration > 0) video.currentTime = Math.max(0, Math.min(duration, progress * duration))
        return
      }

      const youtubePlayer = youtubePlayerRef.current
      const duration = youtubePlayer?.getDuration?.() || 0
      if (duration > 0) youtubePlayer.seekTo?.(Math.max(0, Math.min(duration, progress * duration)), true)
    }

    window.addEventListener(seekEventName, seekPlayback)
    return () => window.removeEventListener(seekEventName, seekPlayback)
  }, [allowScrubbing, editable, seekEventName])

  React.useEffect(() => {
    if (editable || !youtubeId) return
    const interval = window.setInterval(() => {
      const player = youtubePlayerRef.current
      if (!player) return
      const duration = player.getDuration?.() || 0
      const current = player.getCurrentTime?.() || 0
      const playerState = player.getPlayerState?.()
      setAnswer?.({
        videoStarted: true,
        videoProgress: duration > 0 ? current / duration : 0,
        videoCurrentTime: current,
        videoDuration: duration,
        videoPlaying: playerState === 1,
      })
    }, 500)

    return () => window.clearInterval(interval)
  }, [editable, setAnswer, youtubeId])

  if (editable) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-black">
        <div className="absolute left-5 right-5 top-5 z-10 mx-auto max-w-2xl">
          <EditableText
            as="h1"
            editable
            value={videoTitle}
            placeholder="Optional video title"
            onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), heading: value } })}
            className="text-3xl font-bold text-white drop-shadow"
          />
        </div>
        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
          {videoUrl ? (
            youtubeId ? (
              <div className="flex aspect-video max-h-full w-full items-center justify-center bg-zinc-900 text-sm font-medium text-white/70">YouTube video preview</div>
            ) : (
              <video src={videoUrl} className="h-full w-full object-contain" muted preload="metadata" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black text-sm font-medium text-white/60">
              Add a video URL in the sidebar
            </div>
          )}
        </div>
      </div>
    )
  }

  const updateNativeProgress = () => {
    const video = videoRef.current
    if (!video) return
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const current = video.currentTime || 0
    setAnswer?.({
      videoStarted: true,
      videoProgress: duration > 0 ? current / duration : 0,
      videoCurrentTime: current,
      videoDuration: duration,
      videoPlaying: !video.paused,
    })
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {videoTitle && (
        <h1 className="absolute left-5 right-5 top-5 z-10 mx-auto max-w-2xl text-3xl font-bold text-white drop-shadow">
          {videoTitle}
        </h1>
      )}
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
        {youtubeId ? (
          <YouTube
            className="aspect-video max-h-full w-full max-w-[min(100%,calc((100dvh-9rem)*16/9))]"
            iframeClassName="h-full w-full"
            videoId={youtubeId}
          opts={{
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0 },
          }}
          onReady={(event) => {
            youtubePlayerRef.current = event.target
            event.target.playVideo?.()
          }}
          onPlay={() => setAnswer?.({ ...(answer || {}), videoStarted: true, videoPlaying: true })}
          onPause={() => setAnswer?.({ ...(answer || {}), videoStarted: true, videoPlaying: false })}
          onEnd={() => {
            setUnlocked(true)
            setAnswer?.({ ...(answer || {}), videoStarted: false, videoProgress: 1, videoPlaying: false })
            }}
          />
        ) : videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
            onPlay={updateNativeProgress}
            onPause={updateNativeProgress}
            onTimeUpdate={updateNativeProgress}
            onLoadedMetadata={updateNativeProgress}
            onEnded={() => {
              setUnlocked(true)
              setAnswer?.({
                videoStarted: false,
                videoProgress: 1,
                videoCurrentTime: videoRef.current?.duration || 0,
                videoDuration: videoRef.current?.duration || 0,
                videoPlaying: false,
              })
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-white/60">
            No video added yet
          </div>
        )}
      </div>
    </div>
  )
}

function VideoPlaybackStatus({ interactionState, pageUuid, allowScrubbing = true }: { interactionState: any; pageUuid?: string; allowScrubbing?: boolean }) {
  const progress = Math.max(0, Math.min(1, interactionState?.videoProgress || 0))
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowScrubbing || !pageUuid) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextProgress = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
    window.dispatchEvent(new CustomEvent(`learning-video-seek-${pageUuid}`, { detail: { progress: nextProgress } }))
  }

  const startScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowScrubbing || !pageUuid) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    seekFromPointer(event)
  }

  return (
    <div className="w-full max-w-2xl text-white drop-shadow">
      <div
        className={`relative mb-4 h-4 rounded-full ${allowScrubbing ? 'cursor-pointer touch-none' : ''}`}
        onPointerDown={startScrub}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return
          seekFromPointer(event)
        }}
        title={allowScrubbing ? 'Seek video' : 'Seeking disabled'}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/30">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        {allowScrubbing && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => pageUuid && window.dispatchEvent(new Event(`learning-video-toggle-${pageUuid}`))}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          {interactionState?.videoPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <span className="text-sm font-bold">
          {formatTime(interactionState?.videoCurrentTime || 0)} / {formatTime(interactionState?.videoDuration || 0)}
        </span>
      </div>
    </div>
  )
}

function getYouTubeId(url: string) {
  if (!url) return ''
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^?&/]+)/)
  return match?.[1] || ''
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = Math.floor(safeSeconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function EditableText({ as = 'div', editable, value, placeholder, onChange, className, multiline = false, elementRef }: any) {
  const Element = as
  const ref = React.useRef<HTMLElement | null>(null)
  const valueRef = React.useRef(value || '')

  React.useEffect(() => {
    valueRef.current = value || ''
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== valueRef.current) {
      ref.current.innerText = valueRef.current
    }
  }, [value])

  const setRefs = (node: HTMLElement | null) => {
    ref.current = node
    if (elementRef) elementRef.current = node
  }

  if (!editable) return <Element ref={elementRef} className={className}>{value || placeholder}</Element>

  return (
    <Element
      ref={setRefs}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-placeholder={placeholder}
      onInput={(event: React.FormEvent<HTMLElement>) => {
        valueRef.current = event.currentTarget.innerText
      }}
      onBlur={() => onChange?.(valueRef.current.trim())}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={`${className || ''} rounded-md outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--org-primary-color)] empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]`}
    />
  )
}
