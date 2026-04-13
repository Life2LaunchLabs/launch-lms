'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, X, Star, Heart, Flame, Leaf, Zap, Sun, Flag, Triangle, Square, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { getMyQuizResult, submitQuizAttempt } from '@services/quiz/quiz'
import { getAPIUrl } from '@services/config/config'
import { mutate } from 'swr'
import QuizResultsModal from './QuizResultsModal'
import { computeQuizScoresPreview, matchQuizResultPreview } from '../Results/quizResultsPreview'
import Lottie from 'lottie-react'
// To add a new animation: import its JSON here, add it to QUIZ_INFO_ANIMATIONS below,
// add an <option> in QuizInfoBlockComponent.tsx, and add a branch in InfoSlideView.
import confettiAnimationData from '../../../../../public/animations/quiz-info/Confetti.json'

const QUIZ_INFO_ANIMATIONS: Record<string, any> = {
  confetti: confettiAnimationData,
}

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
  option_count: number
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

interface SliderRow {
  slider_uuid: string
  label: string
}

interface SliderSlide {
  type: 'quizSliderBlock'
  question_uuid: string
  question_text: string
  slider_count: number
  direction_mode?: 'unidirectional' | 'bidirectional' | 'stars'
  label_mode?: 'none' | 'numbers' | 'labels'
  number_max?: number
  left_axis_label?: string
  right_axis_label?: string
  sliders: SliderRow[]
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
  animation?: 'none' | 'confetti'
}

type SortIconKey = 'star' | 'heart' | 'flame' | 'leaf' | 'zap' | 'sun' | 'flag' | 'triangle' | 'square' | 'thumbs_up' | 'thumbs_down'

interface SortCard {
  card_uuid: string
  title: string
  description?: string
}

interface SortCategory {
  category_uuid: string
  label: string
  color: string
  icon: SortIconKey
  position: 'left' | 'right' | 'top'
}

interface SortSlide {
  type: 'quizSortBlock'
  question_uuid: string
  question_text: string
  cards: SortCard[]
  categories: SortCategory[]
  background_gradient_seed?: string
  background_image_block_object?: any
}

type Slide = SelectSlide | TextSlide | SliderSlide | SortSlide | InfoSlide

interface TextScoringRule {
  mode?: 'optional' | 'min_length'
  min_chars?: number
}

const SLIDER_BLUE = '#2563eb'
const SLIDER_RED = '#dc2626'
const SLIDER_GREY = '#d1d5db'

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

.quiz-shell-outer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background:
    radial-gradient(circle at center, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.12) 16%, rgba(255,255,255,0.07) 28%, rgba(255,255,255,0.04) 40%, rgba(0,0,0,0) 98%),
    linear-gradient(180deg, #16181c 0%, #050506 100%);
}

.quiz-shell-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

@media (min-width: 800px) and (min-height: 520px) {
  .quiz-shell-outer {
    padding: 24px;
    align-items: center;
  }

  .quiz-shell-inner {
    width: min(720px, 100%);
    height: min(720px, 100%);
    max-width: 720px;
    max-height: 720px;
    border-radius: 28px;
    box-shadow:
      0 24px 80px rgba(0,0,0,0.45),
      0 8px 24px rgba(0,0,0,0.28);
  }
}
`

function useQuizStyles() {
  useEffect(() => {
    let el = document.getElementById('sq-styles') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'sq-styles'
      document.head.appendChild(el)
    }
    if (el.textContent !== QUIZ_STYLES) {
      el.textContent = QUIZ_STYLES
    }
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

function getSliderTrackBackground(directionMode: 'unidirectional' | 'bidirectional' | 'stars', value: number): string {
  if (directionMode === 'stars') {
    return `linear-gradient(90deg, ${SLIDER_BLUE} 0%, ${SLIDER_BLUE} ${Math.max(0, Math.min(100, value * 100))}%, ${SLIDER_GREY} ${Math.max(0, Math.min(100, value * 100))}%, ${SLIDER_GREY} 100%)`
  }
  const pct = Math.max(0, Math.min(100, value * 100))
  if (directionMode === 'bidirectional') {
    if (pct < 50) {
      return `linear-gradient(90deg, ${SLIDER_GREY} 0%, ${SLIDER_GREY} ${pct}%, ${SLIDER_RED} ${pct}%, ${SLIDER_RED} 50%, ${SLIDER_GREY} 50%, ${SLIDER_GREY} 100%)`
    }
    if (pct > 50) {
      return `linear-gradient(90deg, ${SLIDER_GREY} 0%, ${SLIDER_GREY} 50%, ${SLIDER_BLUE} 50%, ${SLIDER_BLUE} ${pct}%, ${SLIDER_GREY} ${pct}%, ${SLIDER_GREY} 100%)`
    }
    return `linear-gradient(90deg, ${SLIDER_GREY} 0%, ${SLIDER_GREY} 100%)`
  }
  return `linear-gradient(90deg, ${SLIDER_BLUE} 0%, ${SLIDER_BLUE} ${pct}%, ${SLIDER_GREY} ${pct}%, ${SLIDER_GREY} 100%)`
}

function getSliderInputStyle(directionMode: 'unidirectional' | 'bidirectional' | 'stars', value: number): React.CSSProperties {
  return {
    width: '100%',
    height: 6,
    borderRadius: 999,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: getSliderTrackBackground(directionMode, value),
    outline: 'none',
    cursor: 'pointer',
  }
}

function getSliderInitialValue(directionMode?: 'unidirectional' | 'bidirectional' | 'stars'): number {
  if (directionMode === 'stars') return 0
  return directionMode === 'bidirectional' ? 0.5 : 0
}

function renderSortIcon(icon: SortIconKey, color: string, size = 18) {
  const shared = { color, size }
  switch (icon) {
    case 'heart': return <Heart {...shared} />
    case 'flame': return <Flame {...shared} />
    case 'leaf': return <Leaf {...shared} />
    case 'zap': return <Zap {...shared} />
    case 'sun': return <Sun {...shared} />
    case 'flag': return <Flag {...shared} />
    case 'triangle': return <Triangle {...shared} />
    case 'square': return <Square {...shared} />
    case 'thumbs_down': return <ThumbsDown {...shared} />
    case 'thumbs_up': return <ThumbsUp {...shared} />
    default: return <Star {...shared} />
  }
}

function normalizeSortAnswer(slide: SortSlide, rawValue: any) {
  const cards = Array.isArray(slide.cards) ? slide.cards : []
  const safeAssignments = rawValue?.assignments && typeof rawValue.assignments === 'object' ? rawValue.assignments : {}
  const originalOrder = cards.map(card => card.card_uuid)
  const assignedCardIds = new Set(
    Object.entries(safeAssignments)
      .filter(([cardUuid, categoryUuid]) => originalOrder.includes(cardUuid) && slide.categories.some(category => category.category_uuid === categoryUuid))
      .map(([cardUuid]) => cardUuid)
  )
  const providedStackOrder = Array.isArray(rawValue?.stackOrder)
    ? rawValue.stackOrder.filter((cardUuid: string) => originalOrder.includes(cardUuid) && !assignedCardIds.has(cardUuid))
    : []
  const normalizedAssignments = Object.fromEntries(
    Object.entries(safeAssignments).filter(([cardUuid, categoryUuid]) => originalOrder.includes(cardUuid) && slide.categories.some(category => category.category_uuid === categoryUuid))
  ) as Record<string, string>
  return {
    assignments: normalizedAssignments,
    stackOrder: [...providedStackOrder, ...originalOrder.filter(cardUuid => !assignedCardIds.has(cardUuid) && !providedStackOrder.includes(cardUuid))],
  }
}

function extractSlides(content: any): Slide[] {
  const slides: Slide[] = []

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'quizSelectBlock' || node.type === 'quizTextBlock' || node.type === 'quizSliderBlock' || node.type === 'quizSortBlock' || node.type === 'quizInfoBlock') {
      slides.push({ type: node.type, ...node.attrs })
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(visit)
    }
  }

  visit(content)
  return slides
}

function SortSlideView({
  slide,
  value,
  buildImageUrl,
  onSortCard,
  onReturnCard,
}: {
  slide: SortSlide
  value: { assignments: Record<string, string>; stackOrder: string[] }
  buildImageUrl: (blockObj: any) => string | null
  onSortCard: (slide: SortSlide, categoryUuid: string) => void
  onReturnCard: (slide: SortSlide, cardUuid: string) => void
}) {
  const [openTray, setOpenTray] = useState<'left' | 'right' | 'top' | null>(null)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [flyingCard, setFlyingCard] = useState<{
    card: SortCard
    from: 'center' | 'left' | 'right' | 'top'
    to: 'center' | 'left' | 'right' | 'top'
    phase: 'start' | 'end'
  } | null>(null)
  const backgroundUrl = buildImageUrl(slide.background_image_block_object)
  const background = getGradient(slide.background_gradient_seed || slide.question_uuid || 'sort-question')
  const currentCard = slide.cards.find(card => card.card_uuid === value.stackOrder[0]) || null
  const remainingCount = value.stackOrder.length
  const sortedByCategory = Object.fromEntries(
    slide.categories.map(category => [
      category.category_uuid,
      slide.cards.filter(card => value.assignments[card.card_uuid] === category.category_uuid),
    ])
  ) as Record<string, SortCard[]>
  const openCategory = slide.categories.find(category => category.position === openTray) || null
  const openCards = openCategory ? (sortedByCategory[openCategory.category_uuid] || []) : []

  useEffect(() => {
    const syncLayout = () => {
      setIsMobileLayout(window.innerWidth <= 900)
    }
    syncLayout()
    window.addEventListener('resize', syncLayout)
    return () => window.removeEventListener('resize', syncLayout)
  }, [])

  const getZoneStyle = (position: 'center' | 'left' | 'right' | 'top'): React.CSSProperties => {
    if (isMobileLayout) {
      switch (position) {
        case 'left':
          return { left: '20%', top: 104, transform: 'translate(-50%, 0)', width: 76, minHeight: 120 }
        case 'right':
          return { left: '80%', top: 104, transform: 'translate(-50%, 0)', width: 76, minHeight: 120 }
        case 'top':
          return { left: '50%', top: 88, transform: 'translate(-50%, 0)', width: 148, minHeight: 82 }
        default:
          return { left: '50%', top: 248, transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 360, minHeight: 238 }
      }
    }
    switch (position) {
      case 'left':
        return { left: 20, top: '56%', transform: 'translateY(-50%)', width: 92, minHeight: 146 }
      case 'right':
        return { right: 20, top: '56%', transform: 'translateY(-50%)', width: 92, minHeight: 146 }
      case 'top':
        return { left: '50%', top: 92, transform: 'translateX(-50%)', width: 164, minHeight: 86 }
      default:
        return { left: '50%', top: '56%', transform: 'translate(-50%, -50%)', width: 'calc(100% - 244px)', maxWidth: 272, minHeight: 238 }
    }
  }

  const getFlyingCardStyle = (animation: NonNullable<typeof flyingCard>): React.CSSProperties => {
    const fromStyle = getZoneStyle(animation.from)
    const toStyle = getZoneStyle(animation.to)
    const isEnd = animation.phase === 'end'
    return {
      position: 'absolute',
      zIndex: 8,
      borderRadius: 28,
      background: 'rgba(255,255,255,0.98)',
      boxShadow: '0 28px 70px rgba(15,23,42,0.24)',
      padding: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      color: '#0f172a',
      fontSize: 20,
      fontWeight: 800,
      opacity: isEnd ? 0 : 1,
      transform: `${isEnd ? toStyle.transform : fromStyle.transform} scale(${isEnd ? 0.48 : 1})`,
      left: isEnd ? (toStyle.left as any) : (fromStyle.left as any),
      right: isEnd ? (toStyle.right as any) : (fromStyle.right as any),
      top: isEnd ? (toStyle.top as any) : (fromStyle.top as any),
      width: isEnd ? (toStyle.width as any) : (fromStyle.width as any),
      minHeight: isEnd ? (toStyle.minHeight as any) : (fromStyle.minHeight as any),
      maxWidth: isEnd ? (toStyle.maxWidth as any) : (fromStyle.maxWidth as any),
      transition: 'all 280ms cubic-bezier(.2,.9,.2,1)',
      pointerEvents: 'none',
    }
  }

  const renderMiniPile = (count: number, category: SortCategory) => {
    const visibleCount = count >= 3 ? 3 : count
    if (visibleCount <= 0) return null
    return (
      <div style={{ position: 'relative', width: 62, height: 58 }}>
        {Array.from({ length: visibleCount }).map((_, idx) => (
          <div
            key={idx}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.96)',
              border: `2px solid ${category.color}`,
              boxShadow: '0 10px 26px rgba(15,23,42,0.12)',
              transform: `translate(${idx * 4}px, ${idx * 4}px) rotate(${idx % 2 === 0 ? -5 : 5}deg)`,
            }}
          >
            {idx === visibleCount - 1 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderSortIcon(category.icon, category.color, 18)}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const animateCardToRegion = (category: SortCategory) => {
    if (!currentCard) return
    const card = currentCard
    setFlyingCard({ card, from: 'center', to: category.position, phase: 'start' })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyingCard(current => current ? { ...current, phase: 'end' } : current)
      })
    })
    window.setTimeout(() => {
      onSortCard(slide, category.category_uuid)
      setFlyingCard(null)
    }, 290)
  }

  const animateCardBackToCenter = (card: SortCard) => {
    if (!openCategory) return
    setFlyingCard({ card, from: openCategory.position, to: 'center', phase: 'start' })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyingCard(current => current ? { ...current, phase: 'end' } : current)
      })
    })
    window.setTimeout(() => {
      onReturnCard(slide, card.card_uuid)
      setFlyingCard(null)
    }, 290)
  }

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: backgroundUrl ? '#000' : background }}>
      {backgroundUrl && (
        <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.28)' }} />
      <div style={{ position: 'absolute', inset: 0, padding: isMobileLayout ? '120px 12px 94px' : '126px 18px 102px', boxSizing: 'border-box' }}>
        {slide.categories.map(category => {
          const trayCards = sortedByCategory[category.category_uuid] || []
          const zoneStyle = getZoneStyle(category.position)
          if (trayCards.length <= 0) return null
          return (
            <button
              key={category.category_uuid}
              type="button"
              onClick={() => setOpenTray(category.position)}
              style={{
                position: 'absolute',
                ...zoneStyle,
                zIndex: 2,
                border: 'none',
                color: '#fff',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'transparent',
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderMiniPile(trayCards.length, category)}
                <span style={{ position: 'absolute', left: '50%', bottom: -16, transform: 'translateX(-50%)', minWidth: 24, height: 22, borderRadius: 999, background: 'rgba(15,23,42,0.58)', border: '1px solid rgba(255,255,255,0.28)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px', boxShadow: '0 8px 20px rgba(15,23,42,0.18)' }}>
                  {trayCards.length}
                </span>
              </div>
              {category.label && (
                <span style={{ marginTop: 22, fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.35)', textAlign: 'center' }}>
                  {category.label}
                </span>
              )}
            </button>
          )
        })}

        {currentCard ? (
          <div style={{ position: 'absolute', ...getZoneStyle('center'), zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '100%', minHeight: isMobileLayout ? 240 : 316 }}>
              {Array.from({ length: remainingCount >= 4 ? 3 : Math.max(0, remainingCount - 1) }).map((_, idx) => {
                const shadowIndex = (remainingCount >= 4 ? 3 : Math.max(0, remainingCount - 1)) - idx
                return (
                  <div
                    key={shadowIndex}
                    style={{
                      position: 'absolute',
                      left: 8 + shadowIndex * 2,
                      right: 8 + shadowIndex * 2,
                      top: 12 + shadowIndex * 8,
                      height: isMobileLayout ? 180 : 244,
                      borderRadius: 28,
                      background: 'rgba(255,255,255,0.56)',
                      transform: `rotate(${shadowIndex % 2 === 0 ? 4 : -4}deg)`,
                      boxShadow: '0 18px 40px rgba(15,23,42,0.14)',
                    }}
                  />
                )
              })}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, minHeight: isMobileLayout ? 180 : 244, borderRadius: 30, background: 'rgba(255,255,255,0.96)', boxShadow: '0 28px 70px rgba(15,23,42,0.22)', padding: isMobileLayout ? 18 : 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', textAlign: 'center', lineHeight: 1.2 }}>{currentCard.title || 'Untitled card'}</p>
                {currentCard.description && (
                  <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 500, color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>{currentCard.description}</p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                {remainingCount} remaining
              </p>
            </div>
            {remainingCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: slide.categories.length === 3 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 10, width: 'min(340px, calc(100% - 12px))', marginTop: 12 }}>
                {slide.categories.map(category => (
                  <button
                    key={`sort_btn_${category.category_uuid}`}
                    type="button"
                    onClick={() => animateCardToRegion(category)}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      minHeight: 48,
                      background: category.color,
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 16px 34px rgba(15,23,42,0.18)',
                      cursor: 'pointer',
                      transform: category.position === 'top' ? 'translateY(-4px)' : 'none',
                    }}
                  >
                    {renderSortIcon(category.icon, '#fff', 16)}
                    {category.label && <span>{category.label}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 32px', zIndex: 1 }}>
            <p style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 800, textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.65)' }}>
              All cards sorted
            </p>
          </div>
        )}
      </div>

      {openCategory && (
        <>
          <button
            type="button"
            aria-label="Close tray"
            onClick={() => setOpenTray(null)}
            style={{ position: 'absolute', inset: 0, zIndex: 1100, background: 'rgba(2,6,23,0.42)', border: 'none', cursor: 'pointer' }}
          />
          <div
            style={{
              position: 'absolute',
              zIndex: 1200,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 22px 56px rgba(15,23,42,0.22)',
              border: `1px solid ${openCategory.color}33`,
              overflow: 'hidden',
              ...(openCategory.position === 'left'
            ? { top: 84, bottom: 76, left: 0, width: '68%', borderRadius: '0 28px 28px 0' }
                : openCategory.position === 'right'
                  ? { top: 84, bottom: 76, right: 0, width: '68%', borderRadius: '28px 0 0 28px' }
                  : { top: 0, left: 18, right: 18, height: '50%', borderRadius: '0 0 28px 28px' }),
            }}
          >
            <button
              type="button"
              onClick={() => setOpenTray(null)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', background: openCategory.color, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {renderSortIcon(openCategory.icon, '#fff', 18)}
              {openCategory.label && <span style={{ fontSize: 14, fontWeight: 800 }}>{openCategory.label}</span>}
              <span style={{ marginLeft: 'auto', minWidth: 24, height: 24, borderRadius: 999, background: 'rgba(255,255,255,0.24)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px' }}>
                {openCards.length}
              </span>
            </button>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: openCategory.position === 'top' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 10, overflowY: 'auto', maxHeight: 'calc(100% - 58px)' }}>
              {openCards.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No cards in this tray yet.</p>
              ) : openCards.map(card => (
                <button
                  key={card.card_uuid}
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    animateCardBackToCenter(card)
                  }}
                  style={{ border: 'none', borderRadius: 18, background: '#fff', padding: '14px 14px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 5 }}>{card.title || 'Untitled'}</span>
                  {card.description && <span style={{ display: 'block', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{card.description}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {flyingCard && (
        <div style={getFlyingCardStyle(flyingCard)}>
          <span>{flyingCard.card.title || 'Untitled card'}</span>
        </div>
      )}
    </div>
  )
}

// ── Info slide view ────────────────────────────────────────────────────────────

function InfoSlideView({ info, isActive, buildImageUrl }: { info: InfoSlide; isActive: boolean; buildImageUrl: (blockObj: any) => string | null }) {
  const [animTriggered, setAnimTriggered] = useState(false)
  const [animDone, setAnimDone] = useState(false)

  useEffect(() => {
    if (isActive && !animTriggered) setAnimTriggered(true)
  }, [isActive])

  const imgUrl = buildImageUrl(info.image_block_object)
  const bg = getGradient(info.gradient_seed || info.slide_uuid || 'info')
  const animData = info.animation && info.animation !== 'none' ? QUIZ_INFO_ANIMATIONS[info.animation] : null
  const showAnim = animTriggered && !!animData && !animDone

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: imgUrl ? '#000' : bg }}>
      {showAnim && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
          <Lottie
            animationData={animData}
            loop={false}
            onComplete={() => setAnimDone(true)}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
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
  onSliderAnswerChange,
  buildImageUrl,
}: {
  slide: Slide
  isActive: boolean
  answers: Map<string, any>
  textScoringRules: Record<string, TextScoringRule>
  infoOverlay: QuizOption | null
  popUuid: string | null      // option that just got the pop animation
  onSelectOption: (slide: SelectSlide | SortSlide, optUuid: string) => void
  onTextAnswerChange: (slide: TextSlide | SortSlide, value: string) => void
  onSliderAnswerChange: (slide: SliderSlide, sliderUuid: string, value: number) => void
  buildImageUrl: (blockObj: any) => string | null
}) {
  // ── Info slide ──
  if (slide.type === 'quizInfoBlock') {
    return <InfoSlideView key={(slide as InfoSlide).slide_uuid} info={slide as InfoSlide} isActive={isActive} buildImageUrl={buildImageUrl} />
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
      <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: backgroundUrl ? '#000' : background }}>
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

  if (slide.type === 'quizSliderBlock') {
    const sliderSlide = slide as SliderSlide
    const sliderValues = (answers.get(sliderSlide.question_uuid) || {}) as Record<string, number>
    const labelMode = sliderSlide.label_mode || 'none'
    const directionMode = sliderSlide.direction_mode || 'unidirectional'
    const numberMax = Math.max(1, Number(sliderSlide.number_max || 5))
    const step = labelMode === 'numbers'
      ? (directionMode === 'bidirectional' ? 1 / (numberMax * 2) : 1 / numberMax)
      : 0.01
    const backgroundUrl = buildImageUrl(sliderSlide.background_image_block_object)
    const background = getGradient(sliderSlide.background_gradient_seed || sliderSlide.question_uuid || 'slider-question')
    const tickCount = labelMode === 'numbers'
      ? (directionMode === 'bidirectional' ? Math.min(20, numberMax * 2) : Math.min(10, numberMax))
      : 0
    const tickValues = tickCount > 0 ? Array.from({ length: tickCount + 1 }, (_, idx) => idx / tickCount) : []
    const hideOptionLabels = sliderSlide.slider_count === 1

    return (
      <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: backgroundUrl ? '#000' : background }}>
        <style>{`
          .quiz-player-slider-range {
            appearance: none;
            -webkit-appearance: none;
          }
          .quiz-player-slider-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 999px;
            background: #fff;
            border: 2px solid rgba(15, 23, 42, 0.12);
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.24);
          }
          .quiz-player-slider-range::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            background: #fff;
            border: 2px solid rgba(15, 23, 42, 0.12);
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.24);
          }
        `}</style>
        {backgroundUrl && (
          <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 96px', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {sliderSlide.question_text && (
              <p style={{ margin: 0, textAlign: 'center', color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.2, textShadow: '0 2px 10px rgba(0,0,0,0.65)' }}>
                {sliderSlide.question_text}
              </p>
            )}
            {directionMode !== 'stars' && labelMode === 'numbers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 11, fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>
                  <span>{directionMode === 'bidirectional' ? numberMax : 0}</span>
                  <span>{numberMax}</span>
                </div>
              </div>
            )}
            {directionMode !== 'stars' && labelMode === 'labels' && !hideOptionLabels && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 11, fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>
                  <span>{sliderSlide.left_axis_label || '\u00A0'}</span>
                  <span>{sliderSlide.right_axis_label || '\u00A0'}</span>
                </div>
              </div>
            )}
            {sliderSlide.sliders.map((row, idx) => {
              const value = typeof sliderValues[row.slider_uuid] === 'number'
                ? sliderValues[row.slider_uuid]
                : getSliderInitialValue(directionMode)
              const selectedStars = Math.round(value * 5)
              return (
                <div key={row.slider_uuid} style={{ display: 'grid', gridTemplateColumns: hideOptionLabels ? '1fr' : '112px 1fr', gap: 12, alignItems: 'center' }}>
                  {!hideOptionLabels && (
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.35)', lineHeight: 1.3, textAlign: 'right' }}>
                      {row.label || `Option ${idx + 1}`}
                    </div>
                  )}
                  <div>
                    {directionMode === 'stars' ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: hideOptionLabels ? 'center' : 'flex-start' }}>
                        {Array.from({ length: 5 }, (_, starIdx) => {
                          const nextStars = starIdx + 1
                          return (
                            <button
                              key={`${row.slider_uuid}_${starIdx}`}
                              type="button"
                              onClick={() => onSliderAnswerChange(sliderSlide, row.slider_uuid, nextStars / 5)}
                              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
                            >
                              <Star
                                size={30}
                                strokeWidth={2.2}
                                style={{ color: '#fff', fill: nextStars <= selectedStars ? '#fff' : 'transparent', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.3))' }}
                              />
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <>
                        <input
                          className="quiz-player-slider-range"
                          type="range"
                          min={0}
                          max={1}
                          step={step}
                          value={value}
                          onChange={e => onSliderAnswerChange(sliderSlide, row.slider_uuid, parseFloat(e.target.value))}
                          style={getSliderInputStyle(directionMode, value)}
                        />
                        {tickValues.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                            {tickValues.map(tick => (
                              <span key={`${row.slider_uuid}_${tick}`} style={{ width: 2, height: 8, borderRadius: 999, background: tick === 0.5 && directionMode === 'bidirectional' ? '#9ca3af' : '#d1d5db', display: 'block' }} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (slide.type === 'quizSortBlock') {
    const sortSlide = slide as SortSlide
    const sortValue = normalizeSortAnswer(sortSlide, answers.get(sortSlide.question_uuid))
    return (
      <SortSlideView
        slide={sortSlide}
        value={sortValue}
        buildImageUrl={buildImageUrl}
        onSortCard={onSelectOption}
        onReturnCard={onTextAnswerChange}
      />
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
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: isTextStyle ? (questionBgUrl ? '#000' : questionBg) : '#000' }}>
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
                  <img src={infoImgUrl} alt="" style={{ width: 'auto', maxWidth: '100%', maxHeight: '50%', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
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
  const [answers, setAnswers] = useState<Map<string, any>>(new Map())
  const [popUuid, setPopUuid] = useState<string | null>(null)
  const [nextVisible, setNextVisible] = useState(false)
  const [showingResponse, setShowingResponse] = useState(false)   // response slide visible
  const [responseIn, setResponseIn] = useState(false)             // drives slide-up transition
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [showResults, setShowResults] = useState(!!initialShowResults)
  const [loadingExistingResult, setLoadingExistingResult] = useState(!editorPreviewContent && !initialShowResults)
  const quizMode = activity?.details?.quiz_mode || 'categories'
  const activeVectors = quizMode === 'graded'
    ? (activity?.details?.graded_scoring_vectors || activity?.details?.scoring_vectors || [{ key: 'correct', label: 'Correct', type: 'binary', low_label: 'False', high_label: 'True' }])
    : (activity?.details?.category_scoring_vectors || activity?.details?.scoring_vectors || [])

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
    if (currentSlide.type === 'quizSliderBlock') {
      const slide = currentSlide as SliderSlide
      const sliderValues = (answers.get(slide.question_uuid) || {}) as Record<string, number>
      return slide.sliders.every(row => Object.prototype.hasOwnProperty.call(sliderValues, row.slider_uuid))
    }
    if (currentSlide.type === 'quizSortBlock') {
      const slide = currentSlide as SortSlide
      return normalizeSortAnswer(slide, answers.get(slide.question_uuid)).stackOrder.length === 0
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
      if (slide.type === 'quizSliderBlock') {
        const s = slide as SliderSlide
        const values = (answers.get(s.question_uuid) || {}) as Record<string, number>
        const normalizedValues = Object.fromEntries(
          s.sliders.map(row => {
            const raw = typeof values[row.slider_uuid] === 'number' ? values[row.slider_uuid] : getSliderInitialValue(s.direction_mode)
            return [row.slider_uuid, Math.max(0, Math.min(1, raw))]
          })
        )
        return {
          question_uuid: s.question_uuid,
          answer_json: { type: 'slider', values: normalizedValues },
        }
      }
      if (slide.type === 'quizSortBlock') {
        const s = slide as SortSlide
        const normalized = normalizeSortAnswer(s, answers.get(s.question_uuid))
        return {
          question_uuid: s.question_uuid,
          answer_json: { type: 'sort', assignments: normalized.assignments },
        }
      }
      const s = slide as SelectSlide
      const selectedUuid = answers.get(s.question_uuid) || null
      return {
        question_uuid: s.question_uuid,
        answer_json: selectedUuid ? { type: 'select', option_uuid: selectedUuid } : { type: 'skipped' },
      }
    })

    if (editorPreviewContent) {
      const previewScores = computeQuizScoresPreview(
        answerPayload,
        activity?.details?.option_scores || {},
        activity?.details?.text_scores || {},
        activeVectors
      )
      if (quizMode === 'graded') {
        const correctScore = Number(previewScores.correct ?? 0)
        const passPercent = Number(activity?.details?.grading_rules?.pass_percent ?? 70)
        let gradedQuestionCount = 0
        answerPayload.forEach(answer => {
          const answerJson = answer.answer_json || {}
          if (answerJson.type === 'select') gradedQuestionCount += 1
          if (answerJson.type === 'text' && (activity?.details?.text_scores?.[answer.question_uuid] || {}).mode === 'min_length') gradedQuestionCount += 1
          if (answerJson.type === 'slider') gradedQuestionCount += Object.keys(answerJson.values || {}).length
          if (answerJson.type === 'sort') gradedQuestionCount += Object.keys(answerJson.assignments || {}).length
        })
        setResult({
          id: 'preview',
          attempt_id: 'preview',
          attempt_uuid: 'preview',
          computed_at: new Date().toISOString(),
          result_json: {
            quiz_mode: quizMode,
            scores: previewScores,
            vectors: activeVectors,
            category_sets: [],
            matched_result: null,
            graded_result: {
              score_percent: Number((correctScore * 100).toFixed(1)),
              pass_percent: passPercent,
              passed: correctScore * 100 >= passPercent,
              attempt_number: 1,
              attempts_remaining: activity?.details?.grading_rules?.max_attempts ?? null,
              max_attempts: activity?.details?.grading_rules?.max_attempts ?? null,
              best_score_percent: Number((correctScore * 100).toFixed(1)),
              correct_answers: Math.round(correctScore * gradedQuestionCount),
              question_count: gradedQuestionCount,
            },
          },
        })
        setShowResults(true)
        return
      }
      setResult({
        id: 'preview',
        attempt_id: 'preview',
        attempt_uuid: 'preview',
        computed_at: new Date().toISOString(),
        result_json: {
          quiz_mode: quizMode,
          scores: previewScores,
          vectors: activeVectors,
          category_sets: [],
          matched_result: matchQuizResultPreview(previewScores, activity?.details?.result_options || []),
        },
      })
      setShowResults(true)
      return
    }

    setSubmitting(true)
    try {
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
  }, [slides, answers, activity, access_token, editorPreviewContent, activeVectors, quizMode, org?.id])

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

  const handleSelectOption = (slide: SelectSlide | SortSlide, optUuid: string) => {
    if (slide.type === 'quizSortBlock') {
      const sortSlide = slide as SortSlide
      const currentState = normalizeSortAnswer(sortSlide, answers.get(sortSlide.question_uuid))
      const currentCardUuid = currentState.stackOrder[0]
      if (!currentCardUuid) return
      const nextAssignments = { ...currentState.assignments, [currentCardUuid]: optUuid }
      const nextStackOrder = currentState.stackOrder.slice(1)
      setAnswers(prev => new Map(prev).set(sortSlide.question_uuid, { assignments: nextAssignments, stackOrder: nextStackOrder }))
      return
    }
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

  const handleTextAnswerChange = (slide: TextSlide | SortSlide, value: string) => {
    if (slide.type === 'quizSortBlock') {
      const sortSlide = slide as SortSlide
      const currentState = normalizeSortAnswer(sortSlide, answers.get(sortSlide.question_uuid))
      const nextAssignments = { ...currentState.assignments }
      delete nextAssignments[value]
      const nextStackOrder = [value, ...currentState.stackOrder.filter(cardUuid => cardUuid !== value)]
      setAnswers(prev => new Map(prev).set(sortSlide.question_uuid, { assignments: nextAssignments, stackOrder: nextStackOrder }))
      return
    }
    setAnswers(prev => new Map(prev).set(slide.question_uuid, value))
  }

  const handleSliderAnswerChange = (slide: SliderSlide, sliderUuid: string, value: number) => {
    setAnswers(prev => {
      const next = new Map(prev)
      const currentValues = { ...((next.get(slide.question_uuid) || {}) as Record<string, number>) }
      currentValues[sliderUuid] = value
      next.set(slide.question_uuid, currentValues)
      return next
    })
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
      <div className="quiz-shell-outer"><div className="quiz-shell-inner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="animate-spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#fff' }} />
        </div>
      </div></div>
    )
  }

  if (showResults) {
    return (
      <QuizResultsModal
        result={result}
        activity={activity}
        org={org}
        course={course}
        onRetake={handleRetake}
        onClose={onClose}
      />
    )
  }

  if (slides.length === 0) {
    return (
      <div className="quiz-shell-outer"><div className="quiz-shell-inner">
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
      : currentSlide.type === 'quizSliderBlock'
        ? (currentSlide as SliderSlide).question_text
        : currentSlide.type === 'quizSortBlock'
          ? (currentSlide as SortSlide).question_text
        : (currentSlide as InfoSlide).title
  const shouldShowHeaderTitle =
    currentSlide.type === 'quizSelectBlock'
      ? (currentSlide as SelectSlide).display_style !== 'text'
      : currentSlide.type === 'quizSliderBlock'
        ? false
        : currentSlide.type === 'quizSortBlock'
          ? true
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
    <div className="quiz-shell-outer"><div className="quiz-shell-inner">
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
        position: 'absolute', inset: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transform: `translate3d(0, -${currentIdx * 100}%, 0)`,
        transition: 'transform 520ms cubic-bezier(.2, .9, .2, 1)',
        willChange: 'transform',
      }}>
        {slides.map((slide, idx) => (
          <div key={idx} style={{ flex: '0 0 100%', height: '100%', minHeight: 0 }}>
            <SlideFrame
              slide={slide}
              isActive={idx === currentIdx}
              answers={answers}
              textScoringRules={textScoringRules}
              infoOverlay={null}
              popUuid={idx === currentIdx ? popUuid : null}
              onSelectOption={handleSelectOption}
              onTextAnswerChange={handleTextAnswerChange}
              onSliderAnswerChange={handleSliderAnswerChange}
              buildImageUrl={buildImageUrl}
            />
          </div>
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
          maxWidth: 320,
          margin: '0 auto',
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
