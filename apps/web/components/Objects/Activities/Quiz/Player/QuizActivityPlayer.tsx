'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { getMyQuizResult, submitQuizAttempt } from '@services/quiz/quiz'
import { getAPIUrl } from '@services/config/config'
import { mutate } from 'swr'
import QuizResultsView from './QuizResultsView'

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuizOption {
  option_uuid: string
  label: string
  image_block_object: any
  gradient_seed: string
  info_message: string
  info_image_block_object: any
}

interface SelectSlide {
  type: 'quizSelectBlock'
  question_uuid: string
  question_text: string
  display_style?: 'image' | 'text'
  show_responses?: boolean
  option_count: 2 | 3 | 4
  options: QuizOption[]
  background_gradient_seed?: string
  background_image_block_object?: any
}

interface TextSlide {
  type: 'quizTextBlock'
  question_uuid: string
  question_text: string
  description?: string
  placeholder?: string
  input_size?: 'single_line' | 'short_answer' | 'open_ended'
  background_gradient_seed?: string
  background_image_block_object?: any
}

interface InfoSlide {
  type: 'quizInfoBlock'
  slide_uuid: string
  title: string
  body: string
  image_block_object: any
  gradient_seed: string
}

type Slide = SelectSlide | TextSlide | InfoSlide

interface TextScoringRule {
  mode?: 'optional' | 'min_length'
  min_chars?: number
}

// ── Keyframe CSS injected once ─────────────────────────────────────────────────

const QUIZ_STYLES = `
@keyframes sqSelectPop {
  0%   { transform: scale(1); }
  65%  { transform: scale(1.05); }
  100% { transform: scale(1.02); }
}
@keyframes sqNextIn {
  0%   { transform: translate3d(0, 120%, 0); opacity: 0; }
  70%  { transform: translate3d(0, -6%, 0);  opacity: 1; }
  100% { transform: translate3d(0, 0, 0);    opacity: 1; }
}
@keyframes sqNextOut {
  0%   { transform: translate3d(0, 0, 0);    opacity: 1; }
  100% { transform: translate3d(0, 120%, 0); opacity: 0; }
}
.sq-opt-pop  { animation: sqSelectPop 220ms cubic-bezier(.2,.9,.2,1) both !important; }
.sq-next-in  { animation: sqNextIn  240ms cubic-bezier(.2,.9,.2,1) both !important; }
.sq-next-out { animation: sqNextOut 200ms cubic-bezier(.4,0,1,1) both !important; }
`

function useQuizStyles() {
  useEffect(() => {
    if (document.getElementById('sq-styles')) return
    const el = document.createElement('style')
    el.id = 'sq-styles'
    el.textContent = QUIZ_STYLES
    document.head.appendChild(el)
  }, [])
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < (seed || '').length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 80)) % 360
  return `linear-gradient(135deg, hsl(${h1},65%,55%), hsl(${h2},70%,45%))`
}

function extractSlides(content: any): Slide[] {
  const slides: Slide[] = []

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'quizSelectBlock' || node.type === 'quizTextBlock' || node.type === 'quizInfoBlock') {
      slides.push({ type: node.type, ...node.attrs })
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(visit)
    }
  }

  visit(content)
  return slides
}

// ── Single frame ───────────────────────────────────────────────────────────────

function SlideFrame({
  slide,
  isActive,
  answers,
  textScoringRules,
  infoOverlay,
  popUuid,
  onSelectOption,
  onTextAnswerChange,
  buildImageUrl,
}: {
  slide: Slide
  isActive: boolean
  answers: Map<string, string>
  textScoringRules: Record<string, TextScoringRule>
  infoOverlay: QuizOption | null
  popUuid: string | null      // option that just got the pop animation
  onSelectOption: (slide: SelectSlide, optUuid: string) => void
  onTextAnswerChange: (slide: TextSlide, value: string) => void
  buildImageUrl: (blockObj: any) => string | null
}) {
  // ── Info slide ──
  if (slide.type === 'quizInfoBlock') {
    const info = slide as InfoSlide
    const imgUrl = buildImageUrl(info.image_block_object)
    const bg = getGradient(info.gradient_seed || info.slide_uuid || 'info')
    return (
      <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: imgUrl ? '#000' : bg }}>
        {imgUrl && (
          <img src={imgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
        {(info.title || info.body) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', boxSizing: 'border-box' }}>
            <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {info.title && (
                <p style={{ color: '#fff', fontSize: 24, fontWeight: 800, textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.65)', lineHeight: 1.2, margin: 0 }}>
                  {info.title}
                </p>
              )}
              {info.body && (
                <p style={{ color: '#fff', fontSize: 17, fontWeight: 600, textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.65)', lineHeight: 1.4, margin: 0 }}>
                  {info.body}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (slide.type === 'quizTextBlock') {
    const textSlide = slide as TextSlide
    const value = answers.get(textSlide.question_uuid) || ''
    const inputSize = textSlide.input_size || 'single_line'
    const isSingleLine = inputSize === 'single_line'
    const rows = inputSize === 'open_ended' ? 7 : 4
    const rule = textScoringRules[textSlide.question_uuid] || {}
    const minChars = Math.max(0, Number(rule.min_chars || 0))
    const trimmedLength = value.trim().length
    const hasMinLength = minChars > 0
    const progressPct = hasMinLength ? Math.min(100, Math.round((trimmedLength / minChars) * 100)) : 0
    const meetsMin = !hasMinLength || trimmedLength >= minChars
    const backgroundUrl = buildImageUrl(textSlide.background_image_block_object)
    const background = getGradient(textSlide.background_gradient_seed || textSlide.question_uuid || 'text-question')

    return (
      <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: backgroundUrl ? '#000' : background }}>
        {backgroundUrl && (
          <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 96px', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {textSlide.question_text && (
              <p style={{ margin: 0, textAlign: 'center', color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.2, textShadow: '0 2px 10px rgba(0,0,0,0.65)' }}>
                {textSlide.question_text}
              </p>
            )}
            {textSlide.description && (
              <p style={{ margin: 0, textAlign: 'center', color: '#fff', fontSize: 14, lineHeight: 1.5, textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>
                {textSlide.description}
              </p>
            )}
            <div style={{ background: 'rgba(255,255,255,0.96)', borderRadius: isSingleLine ? 999 : 28, boxShadow: '0 20px 60px rgba(16,24,40,0.16)', border: '1px solid rgba(16,24,40,0.06)', padding: 16 }}>
              {isSingleLine ? (
                <input
                  value={value}
                  onChange={e => onTextAnswerChange(textSlide, e.target.value)}
                  placeholder={textSlide.placeholder || 'Type your answer...'}
                  style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, color: '#111827', background: 'transparent' }}
                />
              ) : (
                <textarea
                  value={value}
                  onChange={e => onTextAnswerChange(textSlide, e.target.value)}
                  rows={rows}
                  placeholder={textSlide.placeholder || 'Type your answer...'}
                  style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, color: '#111827', background: 'transparent', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              )}
              {hasMinLength && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Answer length
                    </span>
                    <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#d1d5db', overflow: 'hidden' }}>
                      <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 999, background: '#22c55e', transition: 'width 180ms ease' }} />
                    </div>
                    {meetsMin && <CheckCircle2 size={14} color="#16a34a" />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
                    <span>{trimmedLength} chars</span>
                    <span>Min {minChars}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Select slide ──
  const sel = slide as SelectSlide
  const selectedUuid = answers.get(sel.question_uuid) || null
  const hasSelection = !!selectedUuid
  const isGrid = sel.option_count === 4
  const isTextStyle = sel.display_style === 'text'
  const questionBgUrl = buildImageUrl(sel.background_image_block_object)
  const questionBg = getGradient(sel.background_gradient_seed || sel.question_uuid || 'question')

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: isTextStyle ? (questionBgUrl ? '#000' : questionBg) : '#000' }}>
      {isTextStyle && questionBgUrl && (
        <img src={questionBgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {isTextStyle && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)' }} />
      )}

      <div style={{
        position: 'absolute', inset: 0,
        display: isTextStyle ? 'flex' : (isGrid ? 'grid' : 'flex'),
        gridTemplateColumns: !isTextStyle && isGrid ? '1fr 1fr' : undefined,
        gridTemplateRows: !isTextStyle && isGrid ? '1fr 1fr' : undefined,
        flexDirection: isTextStyle ? 'column' : (isGrid ? undefined : 'column'),
        gap: isTextStyle ? 12 : 0,
        alignItems: isTextStyle ? 'center' : undefined,
        justifyContent: isTextStyle ? 'center' : undefined,
        padding: isTextStyle ? '120px 24px 96px' : 0,
        boxSizing: 'border-box',
      }}>
        {isTextStyle ? (
          <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sel.question_text && (
              <p style={{ margin: 0, textAlign: 'center', color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.2, textShadow: '0 2px 10px rgba(0,0,0,0.65)' }}>
                {sel.question_text}
              </p>
            )}
            {sel.options.map((opt) => {
              const isSelected = selectedUuid === opt.option_uuid
              const isPopping = isActive && popUuid === opt.option_uuid

              return (
                <div
                  key={opt.option_uuid}
                  onClick={() => onSelectOption(sel, opt.option_uuid)}
                  className={isPopping ? 'sq-opt-pop' : ''}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.94)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    flex: '0 0 auto',
                    width: '100%',
                    maxWidth: 320,
                    minHeight: 56,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    filter: hasSelection && !isSelected ? 'opacity(0.55)' : 'none',
                    transform: isPopping ? undefined : (isSelected ? 'scale(1.02)' : 'scale(1)'),
                    boxShadow: isSelected ? '0 18px 40px rgba(0,0,0,0.3)' : 'none',
                    zIndex: isSelected ? 2 : 1,
                    transition: isPopping ? 'none' : 'filter 200ms ease, transform 180ms cubic-bezier(.2,.9,.2,1), box-shadow 200ms ease, opacity 200ms ease',
                  }}
                >
                  {isSelected && (
                    <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(17,24,39,0.9)', borderRadius: 999, boxSizing: 'border-box', zIndex: 3, pointerEvents: 'none' }} />
                  )}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    textAlign: 'center',
                    padding: '0 18px',
                    color: '#000',
                    fontWeight: 900,
                    lineHeight: 1.15,
                    borderRadius: 999,
                    fontSize: 15,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {opt.label || '\u00A0'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : sel.options.map((opt) => {
          const isSelected = selectedUuid === opt.option_uuid
          const imgUrl = buildImageUrl(opt.image_block_object)
          const bg = getGradient(opt.gradient_seed)
          const isPopping = isActive && popUuid === opt.option_uuid

          return (
            <div
              key={opt.option_uuid}
              onClick={() => onSelectOption(sel, opt.option_uuid)}
              className={isPopping ? 'sq-opt-pop' : ''}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: isTextStyle ? 'rgba(255,255,255,0.94)' : (imgUrl ? '#000' : bg),
                cursor: 'pointer',
                userSelect: 'none',
                flex: isTextStyle ? '0 0 auto' : (isGrid ? undefined : '1 1 0'),
                width: isTextStyle ? '100%' : undefined,
                maxWidth: isTextStyle ? 320 : undefined,
                minHeight: isTextStyle ? 56 : undefined,
                borderRadius: isTextStyle ? 999 : 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: hasSelection && !isSelected
                  ? (isTextStyle ? 'opacity(0.55)' : 'grayscale(1) brightness(0.55)')
                  : 'none',
                transform: isPopping ? undefined : (isSelected ? 'scale(1.02)' : 'scale(1)'),
                boxShadow: isSelected
                  ? (isTextStyle ? '0 18px 40px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.45)')
                  : 'none',
                zIndex: isSelected ? 2 : 1,
                transition: isPopping ? 'none' : 'filter 200ms ease, transform 180ms cubic-bezier(.2,.9,.2,1), box-shadow 200ms ease, opacity 200ms ease',
              }}
            >
              {isSelected && (
                <div style={{ position: 'absolute', inset: 0, border: isTextStyle ? '3px solid rgba(17,24,39,0.9)' : '3px solid #fff', borderRadius: isTextStyle ? 999 : 0, boxSizing: 'border-box', zIndex: 3, pointerEvents: 'none' }} />
              )}
              {!isTextStyle && imgUrl && (
                <img src={imgUrl} alt={opt.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{
                position: isTextStyle ? 'relative' : 'absolute',
                left: isTextStyle ? undefined : '50%',
                top: isTextStyle ? undefined : '50%',
                transform: isTextStyle ? undefined : 'translate(-50%, -50%)',
                width: isTextStyle ? '100%' : undefined,
                maxWidth: isTextStyle ? '100%' : '86%',
                textAlign: 'center',
                padding: isTextStyle ? '0 18px' : '0.22em 0.45em',
                background: isTextStyle ? 'transparent' : 'rgba(255,255,255,0.92)',
                color: '#000',
                fontWeight: 900,
                lineHeight: 1.15,
                borderRadius: isTextStyle ? 999 : '0.12em',
                fontSize: 15,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {opt.label || '\u00A0'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info overlay after selecting an option with info */}
      {isActive && infoOverlay && hasSelection && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: '80px 24px', boxSizing: 'border-box',
          pointerEvents: 'none',
          animation: 'sqNextIn 220ms ease both',
        }}>
          {(() => {
            const infoImgUrl = buildImageUrl(infoOverlay.info_image_block_object)
            return (
              <>
                {infoImgUrl && (
                  <img src={infoImgUrl} alt="" style={{ width: 'auto', maxWidth: '100%', maxHeight: '50vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
                )}
                {infoOverlay.info_message && (
                  <p style={{ color: '#fff', fontSize: 17, fontWeight: 600, textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.65)', lineHeight: 1.4, margin: 0 }}>
                    {infoOverlay.info_message}
                  </p>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Stable shell — must live outside the player to avoid remounting ────────────

const SHELL_OUTER: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', justifyContent: 'center' }
const SHELL_INNER: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 420, height: '100vh', overflow: 'hidden', background: '#000' }

// ── Main player ────────────────────────────────────────────────────────────────

interface Props {
  activity: any
  editorPreviewContent?: any
  onClose?: () => void
  initialShowResults?: boolean
}

// Pill button for icon controls in the header
function IconPill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: 32, height: 32,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: 'none',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </button>
  )
}

export default function QuizActivityPlayer({ activity, editorPreviewContent, onClose, initialShowResults }: Props) {
  useQuizStyles()

  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const course = useCourse() as any

  const buildImageUrl = useCallback((blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    const fileId = `${blockObj.content.file_id}.${blockObj.content.file_format}`
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity.activity_uuid,
      blockObj.block_uuid,
      fileId,
      'imageBlock'
    ) ?? null
  }, [org, course, activity.activity_uuid])

  const content = editorPreviewContent || activity.content
  const slides = useMemo(() => extractSlides(content), [content])
  const [textScoringRules, setTextScoringRules] = useState<Record<string, TextScoringRule>>(activity?.details?.text_scores || {})

  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Map<string, string>>(new Map())
  const [popUuid, setPopUuid] = useState<string | null>(null)
  const [nextVisible, setNextVisible] = useState(false)
  const [showingResponse, setShowingResponse] = useState(false)   // response slide visible
  const [responseIn, setResponseIn] = useState(false)             // drives slide-up transition
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [showResults, setShowResults] = useState(!!initialShowResults)
  const [loadingExistingResult, setLoadingExistingResult] = useState(!editorPreviewContent && !initialShowResults)

  useEffect(() => {
    if (editorPreviewContent) return
    let mounted = true
    getMyQuizResult(activity.activity_uuid, access_token)
      .then(r => { if (mounted && r) setResult(r) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoadingExistingResult(false) })
    return () => { mounted = false }
  }, [activity.activity_uuid, access_token, editorPreviewContent])

  useEffect(() => {
    if (!editorPreviewContent) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.textScores) {
        setTextScoringRules(detail.textScores)
      }
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [editorPreviewContent])

  const currentSlide = slides[currentIdx]
  const isLastSlide = currentIdx === slides.length - 1

  // The option whose response slide is currently shown
  const responseOption = useMemo<QuizOption | null>(() => {
    if (!showingResponse || !currentSlide || currentSlide.type !== 'quizSelectBlock') return null
    const sel = currentSlide as SelectSlide
    const selUuid = answers.get(sel.question_uuid)
    if (!selUuid) return null
    return sel.options.find(o => o.option_uuid === selUuid) ?? null
  }, [showingResponse, currentSlide, answers])

  const isCurrentAnswered = useMemo(() => {
    if (showingResponse) return true
    if (!currentSlide) return true
    if (currentSlide.type === 'quizInfoBlock') return true
    if (currentSlide.type === 'quizTextBlock') {
      const slide = currentSlide as TextSlide
      const rule = textScoringRules[slide.question_uuid] || {}
      const minChars = Math.max(0, Number(rule.min_chars || 0))
      if (minChars <= 0) return true
      return (answers.get(slide.question_uuid) || '').trim().length >= minChars
    }
    return answers.has((currentSlide as SelectSlide).question_uuid)
  }, [showingResponse, currentSlide, answers, textScoringRules])

  useEffect(() => {
    setNextVisible(isCurrentAnswered)
  }, [isCurrentAnswered])

  const canGoBack = showingResponse || currentIdx > 0
  const progress = slides.length <= 1 ? 100 : Math.round(((currentIdx + 1) / slides.length) * 100)

  // Open response slide with slide-up animation
  const openResponse = useCallback(() => {
    setShowingResponse(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setResponseIn(true)))
  }, [])

  // Close response slide (slide down then remove)
  const closeResponse = useCallback(() => {
    setResponseIn(false)
    setTimeout(() => setShowingResponse(false), 380)
  }, [])

  const doSubmit = useCallback(async () => {
    if (editorPreviewContent) { setShowResults(true); return }
    setSubmitting(true)
    try {
      const answerPayload = slides.map(slide => {
        if (slide.type === 'quizInfoBlock') {
          return { question_uuid: (slide as InfoSlide).slide_uuid, answer_json: { type: 'info' } }
        }
        if (slide.type === 'quizTextBlock') {
          const s = slide as TextSlide
          return {
            question_uuid: s.question_uuid,
            answer_json: { type: 'text', text: answers.get(s.question_uuid) || '' },
          }
        }
        const s = slide as SelectSlide
        const selectedUuid = answers.get(s.question_uuid) || null
        return {
          question_uuid: s.question_uuid,
          answer_json: selectedUuid ? { type: 'select', option_uuid: selectedUuid } : { type: 'skipped' },
        }
      })
      const r = await submitQuizAttempt(activity.activity_uuid, { answers: answerPayload }, access_token)
      setResult(r)
      if (r?.result_json?.quiz_mode === 'graded' && r?.result_json?.graded_result?.passed && org?.id) {
        void mutate(`${getAPIUrl()}trail/org/${org.id}/trail`)
      }
      setShowResults(true)
    } catch {
      setShowResults(true)
    } finally {
      setSubmitting(false)
    }
  }, [slides, answers, activity.activity_uuid, access_token, editorPreviewContent])

  const handleNext = useCallback(async () => {
    if (showingResponse) {
      // Dismiss response, then advance or submit
      closeResponse()
      setTimeout(() => {
        if (isLastSlide) { doSubmit(); return }
        setNextVisible(false)
        setCurrentIdx(i => i + 1)
      }, 380)
      return
    }

    // Check if current question has a response to show
    if (currentSlide?.type === 'quizSelectBlock') {
      const sel = currentSlide as SelectSlide
      const selUuid = answers.get(sel.question_uuid)
      const opt = selUuid ? sel.options.find(o => o.option_uuid === selUuid) : null
      const canShowResponse = sel.show_responses !== false
      if (canShowResponse && opt && (opt.info_message || opt.info_image_block_object)) {
        openResponse()
        return
      }
    }

    if (!isLastSlide) {
      const nextIdx = currentIdx + 1
      const nextSlide = slides[nextIdx]
      const nextIsImmediatelyAdvanceable =
        nextSlide?.type === 'quizInfoBlock' ||
        (nextSlide?.type === 'quizTextBlock' && Math.max(0, Number((textScoringRules[(nextSlide as TextSlide).question_uuid] || {}).min_chars || 0)) <= 0)

      setNextVisible(nextIsImmediatelyAdvanceable)
      setCurrentIdx(nextIdx)
      return
    }
    await doSubmit()
  }, [showingResponse, isLastSlide, currentSlide, answers, openResponse, closeResponse, doSubmit, currentIdx, slides, textScoringRules])

  const handleBack = () => {
    if (showingResponse) { closeResponse(); return }
    if (currentIdx > 0) {
      setNextVisible(false)
      setCurrentIdx(i => i - 1)
    }
  }

  const handleSelectOption = (slide: SelectSlide, optUuid: string) => {
    const currentSelection = answers.get(slide.question_uuid)
    if (currentSelection === optUuid) {
      const newAnswers = new Map(answers)
      newAnswers.delete(slide.question_uuid)
      setAnswers(newAnswers)
      return
    }
    setAnswers(prev => new Map(prev).set(slide.question_uuid, optUuid))
    setPopUuid(optUuid)
    setTimeout(() => setPopUuid(null), 260)
  }

  const handleTextAnswerChange = (slide: TextSlide, value: string) => {
    setAnswers(prev => new Map(prev).set(slide.question_uuid, value))
  }

  const handleRetake = () => {
    setAnswers(new Map())
    setCurrentIdx(0)
    setShowResults(false)
    setResult(null)
    setShowingResponse(false)
    setResponseIn(false)
    setNextVisible(false)
  }

  if (loadingExistingResult) {
    return (
      <div style={SHELL_OUTER}><div style={SHELL_INNER}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="animate-spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff' }} />
        </div>
      </div></div>
    )
  }

  if (showResults) {
    return (
      <div style={SHELL_OUTER}><div style={SHELL_INNER}>
        <div style={{ height: '100vh', overflowY: 'auto', background: '#fff' }}>
          <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
            {onClose && (
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                <X size={20} />
              </button>
            )}
          </div>
          <QuizResultsView result={result} activity={activity} org={org} course={course} onRetake={handleRetake} />
        </div>
      </div></div>
    )
  }

  if (slides.length === 0) {
    return (
      <div style={SHELL_OUTER}><div style={SHELL_INNER}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>This quiz has no questions yet.</p>
          {onClose && (
            <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Close</button>
          )}
        </div>
      </div></div>
    )
  }

  const currentTitle = currentSlide.type === 'quizSelectBlock'
    ? (currentSlide as SelectSlide).question_text
    : currentSlide.type === 'quizTextBlock'
      ? (currentSlide as TextSlide).question_text
      : (currentSlide as InfoSlide).title
  const shouldShowHeaderTitle =
    currentSlide.type === 'quizSelectBlock'
      ? (currentSlide as SelectSlide).display_style !== 'text'
      : false

  // Background for the response slide
  const responseBg = responseOption
    ? (buildImageUrl(responseOption.info_image_block_object) ?? null)
    : null
  const responseGradient = responseOption ? getGradient(responseOption.gradient_seed) : '#000'

  const nextLabel = showingResponse
    ? (isLastSlide ? 'Done' : 'Next →')
    : (isLastSlide ? 'Done' : 'Next →')

  return (
    <div style={SHELL_OUTER}><div style={SHELL_INNER}>
      {/* ── Header overlay ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: 12, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 60%, rgba(0,0,0,0.00) 100%)',
          zIndex: 0, pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            overflow: 'hidden',
            width: canGoBack ? 32 : 0,
            opacity: canGoBack ? 1 : 0,
            transition: 'width 250ms cubic-bezier(.2,.9,.2,1), opacity 180ms ease',
            flexShrink: 0,
          }}>
            <IconPill onClick={handleBack}><ChevronLeft size={16} /></IconPill>
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: '#fff', transition: 'width 350ms ease' }} />
          </div>
          {onClose && <IconPill onClick={onClose}><X size={14} /></IconPill>}
        </div>
        {currentTitle && shouldShowHeaderTitle && !showingResponse && (
          <div style={{ position: 'relative', zIndex: 1, color: '#fff', fontSize: 18, fontWeight: 800, textShadow: '0 2px 10px rgba(0,0,0,0.65)', lineHeight: 1.25 }}>
            {currentTitle}
          </div>
        )}
      </div>

      {/* ── Slide stack ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0,
        transform: `translate3d(0, ${-currentIdx * 100}vh, 0)`,
        transition: 'transform 520ms cubic-bezier(.2, .9, .2, 1)',
        willChange: 'transform',
      }}>
        {slides.map((slide, idx) => (
          <SlideFrame
            key={idx}
            slide={slide}
            isActive={idx === currentIdx}
            answers={answers}
            textScoringRules={textScoringRules}
            infoOverlay={null}
            popUuid={idx === currentIdx ? popUuid : null}
            onSelectOption={handleSelectOption}
            onTextAnswerChange={handleTextAnswerChange}
            buildImageUrl={buildImageUrl}
          />
        ))}
      </div>

      {/* ── Response slide — slides up from bottom after Next ── */}
      {showingResponse && responseOption && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 800,
          background: responseBg ? '#000' : responseGradient,
          transform: responseIn ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)',
          transition: 'transform 420ms cubic-bezier(.2,.9,.2,1)',
          willChange: 'transform',
        }}>
          {/* Background image */}
          {responseBg && (
            <img src={responseBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
          {/* Scrim */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', pointerEvents: 'none' }} />
          {/* Option label + message centered */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 80px', boxSizing: 'border-box', gap: 16 }}>
            {responseOption.info_message && (
              <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.65)', lineHeight: 1.4, margin: 0 }}>
                {responseOption.info_message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Next / Done button ── */}
      <button
        onClick={handleNext}
        disabled={submitting}
        style={{
          position: 'absolute', left: 12, right: 12, bottom: 12,
          height: 52, borderRadius: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16,
          background: '#fff', color: '#000',
          border: 'none', cursor: submitting ? 'wait' : 'pointer',
          zIndex: 1000,
          transform: nextVisible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 130%, 0)',
          opacity: nextVisible ? 1 : 0,
          pointerEvents: nextVisible && !submitting ? 'auto' : 'none',
          transition: 'transform 300ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease',
        }}
      >
        {submitting ? (
          <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000' }} />
        ) : nextLabel}
      </button>
    </div></div>
  )
}
