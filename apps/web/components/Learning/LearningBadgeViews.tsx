'use client'

import Link from 'next/link'
import React from 'react'
import { createPortal } from 'react-dom'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Columns2, Copy, GripVertical, Loader2, Pause, Play, Plus, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import YouTube from 'react-youtube'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  findQuestionBlock,
  getBlockCompletion,
  getBlockScoring,
  getQuestionAnswer,
  type LearningTextBlock,
  resolveDisplayBinding,
  resolveDisplayNodes,
  resolveVariantBlocks,
  setQuestionAnswer,
  type LearningBlock,
} from '@components/Learning/schema'
import { EMPTY_PARAGRAPH, getTextBlockNodes } from './editor/utils'
import toast from 'react-hot-toast'
import ReorderableList from '@components/Objects/ReorderableList'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { TimelineCardView, type TimelineEntry } from '@components/Pages/Portfolio/Timeline'
import { ProjectCardView, type Project } from '@components/Pages/Portfolio/PortfolioShell'
import { normalizeMediaUrl } from '@services/media/media'
import { CategorizedMultiSelect } from '@components/Portfolio/CategorizedMultiSelect'

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
    ? `relative flex w-full min-w-0 items-center justify-center overflow-hidden bg-black px-4 py-4 text-foreground sm:py-6 ${className}`
    : `relative flex w-full min-w-0 overflow-hidden bg-[var(--org-page-background)] text-foreground ${className} items-center justify-center px-4 py-4 sm:py-6`
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
    <Link href={backHref} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><X size={20} /></Link>
  ) : (
    <button onClick={onBack} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><X size={20} /></button>
  )

  return (
    <main data-learning-activity-surface className={surfaceClassName} style={pageBackground ? { backgroundColor: pageBackground } : undefined}>
      <div className={frameClassName}>
        <div className="relative z-10 shrink-0 px-4">
          <div className={chromeInnerClassName}>
            {backControl}
            <div className={`h-2 flex-1 overflow-hidden rounded-full ${isVideoPage ? 'bg-white/25' : 'bg-muted'}`}>
              <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className={`text-sm font-medium ${isVideoPage ? 'text-white/80' : 'text-muted-foreground'}`}>{pageIndex + 1}/{Math.max(1, pages.length)}</span>
          </div>
        </div>
        <div className={`${isVideoPage ? 'flex min-h-0 flex-1 items-center justify-center overflow-hidden p-0' : 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-8'}`}>
          <div className={`${isVideoPage ? 'flex h-full w-full items-center justify-center overflow-hidden' : 'mx-auto flex min-h-full w-full max-w-2xl items-center overflow-visible'}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page?.page_uuid || pageIndex}
                data-learning-page-heading
                tabIndex={-1}
                className={isVideoPage ? 'flex h-full w-full items-center justify-center' : 'w-full'}
                initial={{ x: 36, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {page ? children : <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">No page selected</div>}
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

export function LearningPageContent({ page, answer, setAnswer, setUnlocked, pages, run, editable = false, onPagePatch, onNavigatePage, onButton, responseMediaOwner }: any) {
  if (!page) return null
  if (page.page_type === 'video') {
    return <VideoPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} />
  }
  if (page.page_type === 'standard') {
    return <StandardPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} run={run} pages={pages} onNavigatePage={onNavigatePage} onButton={onButton} responseMediaOwner={responseMediaOwner} />
  }
  return null
}

function StandardPageContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch, run, pages, onNavigatePage, onButton, responseMediaOwner }: any) {
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
    unlockedByBlockRef.current = Object.fromEntries(blocks.filter((block: any) => block.type === 'question' && block.kind === 'image_upload' && getBlockCompletion(block)?.required === false).map((block: any) => [block.id, true]))
    setUnlocked?.(questionIds.every((id: string) => unlockedByBlockRef.current[id]))
  }, [blocks, page?.page_uuid, questionIds, setUnlocked])

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

  const renderBlock = (block: LearningBlock) => <StandardBlockView key={block.id} block={block} page={page} answer={getQuestionAnswer(answer, block.id)} setAnswer={(value: any) => setBlockAnswer(block.id, value)} setUnlocked={(value: boolean) => setBlockUnlocked(block.id, value)} editable={editable} onPatch={(patch: any) => patchBlock(block.id, patch)} responseMediaOwner={responseMediaOwner} run={run} pages={pages} onNavigatePage={onNavigatePage} onButton={onButton} />

  return (
    <div className="learning-info-block-stack">
      <div className="learning-info-reorder-list">
        {blocks.map((block: LearningBlock, index: number) => {
          const group = block.design?.group
          if (!group) return renderBlock(block)
          if (index > 0 && blocks[index - 1]?.design?.group === group) return null
          const members = blocks.filter((item: LearningBlock) => item.design?.group === group)
          return <div key={group} className="my-3 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">{members.map(renderBlock)}</div>
        })}
      </div>
    </div>
  )
}

export function buildQuestionVirtualPage(page: any, block: any) {
  return {
    ...page,
    page_type: block.kind,
    content: { ...(block.content || {}), hide_prompt: true },
    scoring: getBlockScoring(block),
    completion: getBlockCompletion(block),
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

function StandardBlockView({ block, page, answer, setAnswer, setUnlocked, editable, onPatch, responseMediaOwner, run, pages, onNavigatePage, onButton }: any) {
  const blockStyle = getStandardBlockStyle(block)

  if (block.type === 'text') {
    const nodes = resolveDisplayNodes(getTextBlockNodes(block as LearningTextBlock), run, editable)
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
    const circle = block.design?.shape === 'circle'
    const fit = circle || block.design?.fit === 'cover' ? 'object-cover' : 'object-contain'
    const source = resolveDisplayBinding(block.content?.binding, run, editable) || block.content?.src
    return (
      <section className="learning-info-stack-section" style={blockStyle}>
        <figure className={`mx-auto max-w-full overflow-hidden ${circle ? 'aspect-square rounded-full' : 'w-full rounded-lg'}`} style={circle ? { width: height, height } : { height }}>
          {source ? (
            <img src={source} alt={block.content?.alt || ''} className={`h-full w-full max-w-full ${fit}`} />
          ) : null}
        </figure>
      </section>
    )
  }

  if (block.type === 'button') {
    const revisit = block.content?.action === 'revisit'
    const target = String(block.content?.revisit_page_uuid || '')
    const currentIndex = (pages || []).findIndex((item: any) => item.page_uuid === page.page_uuid)
    const targetIndex = (pages || []).findIndex((item: any) => item.page_uuid === target)
    const available = revisit ? targetIndex >= 0 && targetIndex < currentIndex && Boolean(onNavigatePage) : Boolean(onButton)
    const Direction = revisit ? ArrowLeft : ArrowRight
    return <section className="learning-info-stack-section !w-full" style={{ ...blockStyle, width: '100%' }}><button type="button" disabled={editable || !available} onClick={() => revisit ? onNavigatePage?.(target) : onButton?.(block.id)} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-center text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${block.design?.variant === 'primary' ? 'bg-[var(--org-primary-color)] text-white shadow-sm' : 'border border-border/80 bg-background text-foreground shadow-sm hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md'} disabled:cursor-not-allowed disabled:opacity-50`}>{revisit && <Direction className="h-4 w-4 shrink-0" />}<span className="text-center">{block.content?.label || 'Continue'}</span>{!revisit && <Direction className="h-4 w-4 shrink-0" />}</button></section>
  }

  if (block.type === 'portfolio_preview') {
    const bindings = block.content?.bindings || {}
    const value = (key: string, fallback = '') => resolveDisplayBinding(bindings[key], run, editable) || fallback
    const variant = block.content?.variant
    if (variant === 'timeline_card') {
      const entry: TimelineEntry = { timeline_uuid: 'preview', slug: 'preview', entry_type: value('entry_type', 'experience'), title: value('title', 'Your current experience'), organization: value('organization'), location_label: value('location_label'), summary: value('summary'), start_date: value('start_date') || undefined, start_precision: 'month', is_current: true, revision: 1, cover_url: value('cover_url') || undefined, blocks: [], projects: [], project: [] }
      return <section className="learning-info-stack-section my-5" style={blockStyle}><TimelineCardView entry={entry} preview /></section>
    }
    if (variant === 'project_card') {
      const item: Project = { project_uuid: 'preview', slug: 'preview', title: value('title', 'Something you did'), subtitle: value('subtitle'), summary: value('summary'), story_kind: value('story_kind', 'made'), status: 'published', featured: true, revision: 1, cover_url: value('cover_url') || undefined, blocks: [] }
      return <section className="learning-info-stack-section mx-auto my-5 max-w-sm" style={blockStyle}><ProjectCardView item={item} preview /></section>
    }
    if (variant === 'identity_header') return <section className="learning-info-stack-section mx-auto my-5 max-w-sm rounded-2xl bg-card p-6 text-center" style={blockStyle}><div className="flex flex-col items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">{value('avatar_url') ? <img src={normalizeMediaUrl(value('avatar_url'))} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl font-black">{value('display_name', 'You').slice(0, 1)}</span>}</div><div><h3 className="text-2xl font-black">{value('display_name', 'Your name')}</h3><p className="mt-1 text-muted-foreground">{value('headline', 'Your tagline will appear here')}</p>{value('location_label') && <p className="mt-2 text-xs text-muted-foreground">{value('location_label')}</p>}</div></div>{value('short_bio') && <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{value('short_bio')}</p>}</section>
    if (variant === 'traits_panel') return <section className="learning-info-stack-section mx-auto my-5 max-w-sm rounded-2xl bg-card p-6" style={blockStyle}><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">What I bring</p><div className="mt-4 flex flex-col gap-2">{value('traits', 'Curious, Creative').split(',').filter(Boolean).map((trait) => <span key={trait} className="rounded-full bg-muted/50 px-3 py-1.5 text-center text-sm font-semibold">{trait.trim()}</span>)}</div></section>
    if (variant === 'links_strip') return <section className="learning-info-stack-section mx-auto my-5 max-w-sm rounded-2xl bg-card p-5" style={blockStyle}><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Find me online</p><div className="mt-3 flex flex-col gap-2"><span className="rounded-full bg-muted px-4 py-2 text-center text-sm font-semibold">{value('label', 'My link')}</span></div><p className="mt-3 break-all text-center text-xs text-muted-foreground">{value('url', 'https://example.com')}</p></section>
    if (variant === 'portfolio_frame') return <section className="learning-info-stack-section mx-auto my-5 max-w-sm overflow-hidden rounded-2xl bg-background shadow-sm" style={blockStyle}><div className={`h-2 ${value('theme_id', 'default') === 'electric' ? 'bg-fuchsia-500' : value('theme_id') === 'creative' ? 'bg-orange-400' : 'bg-foreground'}`} /><div className="p-6 text-center"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Portfolio preview</p><h3 className="mt-5 text-3xl font-black">{value('display_name', 'Your portfolio')}</h3><p className="mt-2 text-muted-foreground">{value('headline', 'Your story, project, and timeline')}</p><div className="mt-6 grid grid-cols-1 gap-3"><div className="aspect-[4/3] rounded-xl bg-muted"/><div className="aspect-[4/3] rounded-xl bg-muted/60"/></div></div></section>
    if (variant === 'share_panel') return <SharePortfolioPanel username={value('username')} blockStyle={blockStyle} />
    return null
  }

  if (block.type === 'question') {
    const resolvedBlock = block.kind === 'text_input' ? (() => {
      const content = block.content || {}
      const legacyLabel = String(content.label || '').trim()
      const contentWithoutLabel = { ...content }
      delete contentWithoutLabel.label
      return {
        ...block,
        content: {
          ...contentWithoutLabel,
          inputs: (content.inputs || []).map((input: any, index: number) => {
            const adaptive = input.adaptive || {}
            const key = !editable ? resolveDisplayBinding(adaptive.binding, run) : ''
            const values = !editable ? adaptive.values?.[key] || {} : {}
            return {
              ...input,
              label: values.label || (index === 0 && legacyLabel ? legacyLabel : input.label),
              placeholder: values.placeholder || input.placeholder,
            }
          }),
        },
      }
    })() : block
    const label = block.kind === 'image_upload' || block.kind === 'text_input' ? '' : String(block.content?.label || '').trim()
    return (
      <section className="learning-info-stack-section" style={blockStyle}>
        {label && <p className="text-lg font-bold text-foreground">{label}</p>}
        <QuestionBlockContent
          page={buildQuestionVirtualPage(page, resolvedBlock)}
          answer={answer}
          setAnswer={setAnswer}
          setUnlocked={setUnlocked}
          editable={editable}
          onPagePatch={(patch: any) => onPatch(mapQuestionPagePatchToBlock(block, patch))}
          onActivate={() => null}
          showChrome={false}
          onChromeHoverChange={() => null}
          responseMediaOwner={responseMediaOwner}
          renderVariables={run?.render_context?.variables}
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

function SharePortfolioPanel({ username, blockStyle }: { username: string; blockStyle: React.CSSProperties }) {
  const session = useLHSession() as any
  const [copied, setCopied] = React.useState(false)
  const resolvedUsername = username || session?.data?.user?.username || ''
  const href = React.useMemo(() => {
    if (typeof window === 'undefined') return ''
    const parts = window.location.pathname.split('/').filter(Boolean)
    const orgIndex = parts.indexOf('orgs')
    const orgslug = orgIndex >= 0 ? parts[orgIndex + 1] : ''
    return orgslug && resolvedUsername ? `${window.location.origin}/orgs/${orgslug}/user/${resolvedUsername}` : ''
  }, [resolvedUsername])
  const copy = async () => {
    if (!href) return
    await navigator.clipboard?.writeText(href)
    setCopied(true)
    toast.success('Portfolio link copied')
  }
  return <section className="learning-info-stack-section mx-auto my-5 max-w-sm rounded-2xl bg-card p-5 text-center" style={blockStyle}>
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Share link</p>
    <p className="mt-3 break-all rounded-xl bg-muted px-3 py-3 text-sm font-semibold">{href || 'Your public portfolio link'}</p>
    <button type="button" disabled={!href} onClick={copy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--org-primary-color)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy link'}</button>
  </section>
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
      <div className={`flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition ${selected ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]' : 'border-border hover:border-border'}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${selected ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-border text-muted-foreground'}`}>{String.fromCharCode(65 + index)}</span>
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

function QuestionBlockContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch, onActivate, showChrome, onChromeHoverChange, responseMediaOwner, renderVariables }: any) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [uploadingInputId, setUploadingInputId] = React.useState<string | null>(null)
  const [imagePickerOpen, setImagePickerOpen] = React.useState(false)
  const titleRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (page.page_type !== 'image_upload') return
    const imageUrl = answer?.url || answer?.image_url || ''
    setUnlocked(page.completion?.required === false || Boolean(imageUrl))
  }, [answer?.image_url, answer?.url, page.completion?.required, page.page_type, setUnlocked])

  React.useEffect(() => {
    if (page.page_type === 'multiple_choice' || page.page_type === 'categorized_multi_select') {
      const completion = page.completion || {}
      const selectedIds = Array.isArray(answer?.option_ids) ? answer.option_ids : answer?.option_id ? [answer.option_id] : []
      const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
      const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 1))
      setUnlocked(selectedIds.length >= minSelections && selectedIds.length <= maxSelections)
      return
    }
    if (page.page_type === 'text_input') {
      const inputs = getQuestionTextInputs(page)
      setUnlocked(areTextInputsComplete(inputs, page.completion?.inputs || {}, answer?.inputs || {}))
    }
  }, [answer?.inputs, answer?.option_id, answer?.option_ids, page, setUnlocked])

  if (page.page_type === 'categorized_multi_select') {
    const completion = page.completion || {}
    const options = (page.content?.options || []).map((option: any) => ({ ...option, category: option.category || 'Options' }))
    const selectedIds = Array.isArray(answer?.option_ids) ? answer.option_ids : []
    const customOptions = Array.isArray(answer?.custom_options) ? answer.custom_options : []
    const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
    const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 5))
    return <div className="learning-question-block" onMouseDown={() => editable && onActivate()}>
      {page.content?.label && <p className="mb-4 text-lg font-bold text-foreground">{page.content.label}</p>}
      <CategorizedMultiSelect options={options} customOptions={customOptions} value={selectedIds} min={minSelections} max={maxSelections} disabled={editable} onCustomOptionsChange={(nextCustom) => { const configuredIds = new Set(options.map((option: any) => option.id)); const customIds = new Set(nextCustom.map((option: any) => option.id)); const added = nextCustom.find((option: any) => !customOptions.some((current: any) => current.id === option.id)); const nextSelected = selectedIds.filter((id: string) => configuredIds.has(id) || customIds.has(id)); if (added && nextSelected.length < maxSelections && !nextSelected.includes(added.id)) nextSelected.push(added.id); setAnswer({ option_ids: nextSelected, option_id: nextSelected[0], custom_options: nextCustom }); setUnlocked(nextSelected.length >= minSelections && nextSelected.length <= maxSelections) }} onChange={(next) => { setAnswer({ option_ids: next, option_id: next[0], custom_options: customOptions }); setUnlocked(next.length >= minSelections && next.length <= maxSelections) }} />
    </div>
  }

  if (page.page_type === 'multiple_choice') {
    const optionBindingPath = page.content?.options_binding?.path
    const boundOptions = optionBindingPath ? (renderVariables?.[optionBindingPath] || []) : []
    const options = (boundOptions.length ? boundOptions : (page.content?.options || [])).map((option: any) => ({
      ...option,
      id: option.id || option.value,
      text: option.text || option.label,
    }))
    const visibleOptions = options.length ? options : [{ id: 'a', text: '' }, { id: 'b', text: '' }]
    const completion = page.completion || {}
    const scoring = page.scoring || {}
    const correctOptionIds = new Set(scoring.correct_option_ids || [])
    const minSelections = Math.max(1, Number(completion.min_selections ?? 1))
    const maxSelections = Math.max(minSelections, Number(completion.max_selections ?? 1))
    const selectedIds = Array.isArray(answer?.option_ids)
      ? answer.option_ids
      : answer?.option_id
        ? [answer.option_id]
        : []
    const patchOptions = (nextOptions: any[]) => {
      const ids = new Set(nextOptions.map((option: any, index: number) => option?.id || String(index)))
      const variableBindings = completion.variable_bindings || {}
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
      onPagePatch?.({ scoring: { ...scoring, mode: 'points', score_policy: 'select_all', correct_option_ids: Array.from(next) } })
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
              className="text-3xl font-bold text-foreground"
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
                    className="min-w-0 text-foreground outline-none"
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
                className={`flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition ${selectedIds.includes(option.id || String(index)) ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]' : 'border-border hover:border-border'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${selectedIds.includes(option.id || String(index)) ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-border text-muted-foreground'}`}>{String.fromCharCode(65 + index)}</span>
                <span className="min-w-0 flex-1 text-foreground">{option.text || `Option ${index + 1}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (page.page_type === 'image_upload') {
    const imageUrl = answer?.url || answer?.image_url || ''
    const updateImageAnswer = async (asset: any) => {
      if (!asset || editable || !accessToken) return
      setUploadingInputId('image')
      try {
        setAnswer({
          url: asset.url,
          name: asset.title || asset.filename || 'Image',
          content_type: asset.mime_type || 'image/*',
          size: asset.size_bytes || 0,
          value_type: 'image',
          media_asset_uuid: asset.asset_uuid,
        })
        setUnlocked(true)
      } catch (error: any) {
        toast.error(error?.message || 'Image selection failed')
      } finally {
        setUploadingInputId(null)
      }
    }

    return (
      <div className="learning-question-block" onMouseDown={() => editable && onActivate()}>
        {(editable || page.content?.label) ? (
          <EditableText
            editable={editable}
            value={page.content?.label || ''}
            placeholder="Question label"
            onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), label: value } })}
            className="mb-3 min-w-0 text-lg font-bold leading-7 text-gray-900"
          />
        ) : null}
        <button
          type="button"
          disabled={editable || uploadingInputId === 'image' || !responseMediaOwner?.id}
          onClick={() => !editable && setImagePickerOpen(true)}
          className={`flex min-h-56 w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed bg-white p-4 text-center shadow-sm transition ${imageUrl ? 'border-gray-200' : 'border-gray-300 hover:border-[var(--org-primary-color)]'}`}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-h-64 w-full rounded-lg object-contain" />
          ) : uploadingInputId === 'image' ? (
            <Loader2 size={24} className="animate-spin text-gray-400" />
          ) : (
            <Upload size={24} className="text-gray-400" />
          )}
          <span className="text-sm font-bold text-gray-600">
            {uploadingInputId === 'image' ? 'Uploading image' : imageUrl ? 'Replace image' : (editable ? 'Image upload' : 'Upload image')}
          </span>
        </button>
        <MediaPickerDialog
          open={imagePickerOpen}
          onOpenChange={setImagePickerOpen}
          title={imageUrl ? 'Replace image' : 'Upload image'}
          description="Upload, link, or select an image from your media library."
          owner={responseMediaOwner}
          mediaType="image"
          accessToken={accessToken}
          onSave={updateImageAnswer}
        />
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
    const variableBindings = completion.variable_bindings || {}
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
            const rule = rules[input.id] || {}
            const validation = resolveTextInputValidation(input, rule)
            const validationError = !editable ? getTextInputValidationError(input, rule, value) : ''
            const htmlInputType = input.input_type === 'month'
              ? 'month'
              : input.input_type === 'number'
                ? 'number'
                : validation === 'email'
                  ? 'email'
                  : validation === 'phone'
                    ? 'tel'
                    : validation === 'url'
                      ? 'url'
                      : 'text'
            return (
              <div key={input.id} className="relative min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  {(editable || input.label) ? (
                    <EditableText
                      editable={editable}
                      value={input.label || ''}
                      placeholder={`Input ${index + inputIndex + 1}`}
                      onChange={(value: string) => updateInputConfig(input.id, { label: value })}
                      className="min-w-0 flex-1 text-lg font-bold leading-7 text-foreground"
                    />
                  ) : <span className="min-w-0 flex-1" />}
                </div>
                {input.input_type === 'select' ? (
                  <select value={value} onChange={(event) => updateTextInput(input.id, event.target.value)} style={{ height }} className="mx-auto block w-[calc(100%-1rem)] min-w-0 max-w-full rounded-xl border border-border bg-card px-4 text-foreground outline-none shadow-sm focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]">
                    <option value="">{input.placeholder || 'None'}</option>
                    {(renderVariables?.[input.options_binding?.path] || []).map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : isSingleLine ? (
                  <input
                    type={htmlInputType}
                    autoComplete={validation === 'name' ? 'name' : validation === 'email' ? 'email' : validation === 'phone' ? 'tel' : validation === 'url' ? 'url' : undefined}
                    aria-invalid={Boolean(validationError)}
                    value={editable ? input.placeholder || '' : value}
                    onChange={(event) => editable ? updateInputConfig(input.id, { placeholder: event.target.value }) : updateTextInput(input.id, event.target.value)}
                    placeholder={editable ? 'Placeholder' : input.placeholder}
                    style={{ height }}
                    className={`w-full rounded-xl border bg-card px-4 text-foreground outline-none shadow-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-[var(--org-primary-color)] ${validationError ? 'border-red-400' : 'border-border focus:border-[var(--org-primary-color)]'}`}
                  />
                ) : (
                  <textarea
                    readOnly={false}
                    value={editable ? input.placeholder || '' : value}
                    onChange={(event) => editable ? updateInputConfig(input.id, { placeholder: event.target.value }) : updateTextInput(input.id, event.target.value)}
                    placeholder={editable ? 'Placeholder' : input.placeholder}
                    style={{ height }}
                    aria-invalid={Boolean(validationError)}
                    className={`w-full resize-none rounded-xl border bg-card p-4 text-foreground outline-none shadow-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-[var(--org-primary-color)] ${validationError ? 'border-red-400' : 'border-border focus:border-[var(--org-primary-color)]'}`}
                  />
                )}
                {validationError ? <p className="mt-1 text-xs font-medium text-red-600">{validationError}</p> : null}
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
        <p className="mt-3 text-xs font-semibold text-muted-foreground">Your response will be reviewed after you submit.</p>
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

function createInfoTextBlock(type: 'heading' | 'paragraph') {
  return type === 'heading' ? { type: 'heading', attrs: { level: 1 } } : { type: 'paragraph' }
}

function isLearningQuestionPage(page: any) {
  return page?.page_type === 'multiple_choice' || page?.page_type === 'text_input' || page?.page_type === 'image_upload'
}

export function isQuestionResponseRequired(page: any) {
  if (!page) return false
  if (page.page_type === 'standard') return Boolean(findQuestionBlock(page))
  return isLearningQuestionPage(page)
}

function getQuestionTextInputs(page: any) {
  const inputs = page.content?.inputs
  if (Array.isArray(inputs) && inputs.length) {
    return inputs.map((input: any, index: number) => ({
      id: input.id || String(index),
      section_id: input.section_id || input.sectionId || '',
      label: input.label == null ? `Response ${index + 1}` : String(input.label),
      placeholder: input.placeholder || '',
      variant: input.variant || 'short_answer',
      width: input.width || 'full',
      height: Number(input.height) || ((input.variant === 'single_line' || input.input_type === 'month' || input.input_type === 'url' || input.input_type === 'select') ? 48 : 160),
      input_type: input.input_type || 'text',
      adaptive: input.adaptive,
      options_binding: input.options_binding || input.optionsBinding,
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
    if (text && getTextInputValidationError(input, rule, text)) return false
    return true
  })
}

function getTextInputValidationError(input: any, rule: any, value: string) {
  const text = String(value || '').trim()
  if (!text) return ''
  const validation = resolveTextInputValidation(input, rule)
  if (validation === 'name') {
    const characters = Array.from(text)
    const isLetter = (character: string) => character.toLocaleLowerCase() !== character.toLocaleUpperCase()
    if (!isLetter(characters[0] || '') || !characters.every((character) => isLetter(character) || ["'", '-', ' '].includes(character))) return 'Enter a valid name.'
  }
  if (validation === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) return 'Enter a valid email address.'
  if (validation === 'phone') {
    const digits = text.replace(/\D/g, '')
    if (!/^[+()\d. -]+$/.test(text) || digits.length < 7 || digits.length > 15) return 'Enter a valid phone number.'
  }
  if (validation === 'url') {
    try {
      const parsed = new URL(text)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return 'Enter a valid URL including http:// or https://.'
    } catch {
      return 'Enter a valid URL including http:// or https://.'
    }
  }
  return ''
}

function resolveTextInputValidation(input: any, rule: any) {
  if (rule?.validation) return String(rule.validation)
  if (input?.input_type === 'email') return 'email'
  if (input?.input_type === 'tel') return 'phone'
  if (input?.input_type === 'url') return 'url'
  return 'none'
}

function createLearningLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
          <div className="h-full rounded-full bg-card transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        {allowScrubbing && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card shadow"
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
      className={`${className || ''} rounded-md outline-none transition focus:bg-card focus:ring-2 focus:ring-[var(--org-primary-color)] empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]`}
    />
  )
}
