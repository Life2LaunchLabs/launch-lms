'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Copy, Dice6, Flag, Flame, Heart, Layers3, Leaf, Loader2, Plus, Square, Star,
  Sun, ThumbsDown, ThumbsUp, Trash2, Triangle, Upload, X, Zap,
} from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { updateQuizScoring } from '@services/quiz/quiz'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

type Tab = 'question' | 'scoring'
type TrayPosition = 'left' | 'right' | 'top'
type SortIconKey = 'star' | 'heart' | 'flame' | 'leaf' | 'zap' | 'sun' | 'flag' | 'triangle' | 'square' | 'thumbs_up' | 'thumbs_down'

interface SortCard {
  card_uuid: string
  title: string
  description: string
}

interface SortCategory {
  category_uuid: string
  label: string
  color: string
  icon: SortIconKey
  position: TrayPosition
}

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

const HEADER_BG = '#e0f2fe'
const ACCENT_COLOR = '#0284c7'
const DEFAULT_CATEGORY_COLORS = ['#dc2626', '#16a34a', '#2563eb']
const DEFAULT_CATEGORY_ICONS: SortIconKey[] = ['thumbs_down', 'thumbs_up', 'star']
const ICON_OPTIONS: { value: SortIconKey; label: string }[] = [
  { value: 'thumbs_down', label: 'Thumbs down' },
  { value: 'thumbs_up', label: 'Thumbs up' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'flame', label: 'Flame' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'zap', label: 'Zap' },
  { value: 'sun', label: 'Sun' },
  { value: 'flag', label: 'Flag' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
]

function getGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < (seed || '').length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 80)) % 360
  return `linear-gradient(135deg, hsl(${h1},65%,55%), hsl(${h2},70%,45%))`
}

function getDefaultCorrectVector(): ScoringVector {
  return { key: 'correct', label: 'Correct', type: 'binary', low_label: 'False', high_label: 'True' }
}

function getActiveScoringVectors(details: any): ScoringVector[] {
  const quizMode = details?.quiz_mode === 'graded' ? 'graded' : 'categories'
  if (quizMode === 'graded') {
    const gradedVectors = details?.graded_scoring_vectors || details?.scoring_vectors || []
    return gradedVectors.length > 0 ? gradedVectors : [getDefaultCorrectVector()]
  }
  return details?.category_scoring_vectors || details?.scoring_vectors || []
}

function getScoringPayload(
  quizMode: 'categories' | 'graded',
  vectors: ScoringVector[],
  optionScores: Record<string, Record<string, number>>,
  categoryVectors: ScoringVector[],
  gradedVectors: ScoringVector[]
) {
  return {
    scoring_vectors: vectors,
    category_scoring_vectors: quizMode === 'categories' ? vectors : categoryVectors,
    graded_scoring_vectors: quizMode === 'graded' ? vectors : gradedVectors,
    option_scores: optionScores,
  }
}

function getSortScoreKey(cardUuid: string, categoryUuid: string) {
  return `${cardUuid}::${categoryUuid}`
}

function renderSortIcon(icon: SortIconKey, props: { size?: number; color?: string }) {
  const shared = { size: props.size ?? 16, color: props.color }
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

function makeDefaultCard(index: number): SortCard {
  return {
    card_uuid: uuidv4(),
    title: `Card ${index + 1}`,
    description: '',
  }
}

function makeDefaultCategory(position: TrayPosition, index: number): SortCategory {
  return {
    category_uuid: uuidv4(),
    label: position === 'top' ? 'Maybe' : position === 'left' ? 'Thumbs down' : 'Thumbs up',
    color: DEFAULT_CATEGORY_COLORS[index] || '#6b7280',
    icon: DEFAULT_CATEGORY_ICONS[index] || 'star',
    position,
  }
}

function getNormalizedCategoryLabel(category: Partial<SortCategory> | undefined, fallback: string) {
  if (!category) return fallback
  return category.label === undefined || category.label === null ? fallback : category.label
}

function normalizeCards(cards: SortCard[] | undefined) {
  const seen = new Set<string>()
  const next = (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .map((card, index) => {
      const nextUuid = !card.card_uuid || seen.has(card.card_uuid) ? uuidv4() : card.card_uuid
      seen.add(nextUuid)
      return {
        card_uuid: nextUuid,
        title: card.title || `Card ${index + 1}`,
        description: card.description || '',
      }
    })
  return next.length > 0 ? next : [makeDefaultCard(0), makeDefaultCard(1), makeDefaultCard(2)]
}

function normalizeCategories(categories: SortCategory[] | undefined) {
  const usable = Array.isArray(categories) ? categories.filter(Boolean) : []
  const seenUuids = new Set<string>()
  const byPosition = new Map<TrayPosition, SortCategory>()
  usable.forEach((category, idx) => {
    const position = category.position === 'top' || category.position === 'right' ? category.position : 'left'
    if (!byPosition.has(position)) {
      const nextUuid = !category.category_uuid || seenUuids.has(category.category_uuid) ? uuidv4() : category.category_uuid
      seenUuids.add(nextUuid)
      byPosition.set(position, {
        category_uuid: nextUuid,
        label: getNormalizedCategoryLabel(category, position === 'top' ? 'Top tray' : `Category ${idx + 1}`),
        color: category.color || DEFAULT_CATEGORY_COLORS[idx] || '#6b7280',
        icon: ICON_OPTIONS.some(option => option.value === category.icon) ? category.icon : DEFAULT_CATEGORY_ICONS[idx] || 'star',
        position,
      })
    }
  })

  if (!byPosition.has('left')) byPosition.set('left', makeDefaultCategory('left', 0))
  if (!byPosition.has('right')) byPosition.set('right', makeDefaultCategory('right', 1))

  return ['left', 'top', 'right']
    .map(position => byPosition.get(position as TrayPosition))
    .filter(Boolean) as SortCategory[]
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
    >
      {children}
    </button>
  )
}

function CornerBtn({ onClick, isLoading, title, children }: { onClick: () => void; isLoading?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)', border: 'none',
        cursor: isLoading ? 'default' : 'pointer', color: '#fff', padding: 0, flexShrink: 0,
      }}
    >
      {isLoading ? <Loader2 size={12} className="animate-spin" /> : children}
    </button>
  )
}

function QuizSortBlockComponent(props: any) {
  const editorState = useEditorProvider() as any
  const isEditable = editorState.isEditable
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const course = useCourse() as any

  const attrs = props.node.attrs
  const activity = props.extension.options.activity
  const questionUuidRef = useRef<string>(attrs.question_uuid || uuidv4())
  const questionUuid = questionUuidRef.current
  const backgroundInputRef = useRef<HTMLInputElement>(null)

  const [questionText, setQuestionText] = useState<string>(attrs.question_text || '')
  const [cards, setCards] = useState<SortCard[]>(() => normalizeCards(attrs.cards))
  const [categories, setCategories] = useState<SortCategory[]>(() => normalizeCategories(attrs.categories))
  const [selectedCardUuid, setSelectedCardUuid] = useState<string | null>(() => normalizeCards(attrs.cards)[0]?.card_uuid || null)
  const [draggedCardUuid, setDraggedCardUuid] = useState<string | null>(null)
  const [dragOverCardUuid, setDragOverCardUuid] = useState<string | null>(null)
  const [iconPickerCategoryUuid, setIconPickerCategoryUuid] = useState<string | null>(null)
  const [backgroundGradientSeed, setBackgroundGradientSeed] = useState<string>(attrs.background_gradient_seed || questionUuid || uuidv4())
  const [backgroundImageFileId, setBackgroundImageFileId] = useState<string | null>(attrs.background_image_file_id || null)
  const [backgroundImageBlockObject, setBackgroundImageBlockObject] = useState<any | null>(attrs.background_image_block_object || null)
  const [activeTab, setActiveTab] = useState<Tab>('question')
  const [quizMode, setQuizMode] = useState<'categories' | 'graded'>(activity?.details?.quiz_mode === 'graded' ? 'graded' : 'categories')
  const [vectors, setVectors] = useState<ScoringVector[]>(getActiveScoringVectors(activity?.details))
  const [categoryVectors, setCategoryVectors] = useState<ScoringVector[]>(activity?.details?.category_scoring_vectors || activity?.details?.scoring_vectors || [])
  const [gradedVectors, setGradedVectors] = useState<ScoringVector[]>(activity?.details?.graded_scoring_vectors || activity?.details?.scoring_vectors || [getDefaultCorrectVector()])
  const [optionScores, setOptionScores] = useState<Record<string, Record<string, number>>>(activity?.details?.option_scores || {})
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const scoringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.vectors) setVectors(detail.vectors)
      if (detail?.quizMode === 'graded' || detail?.quizMode === 'categories') setQuizMode(detail.quizMode)
      if (detail?.categoryVectors) setCategoryVectors(detail.categoryVectors)
      if (detail?.gradedVectors) setGradedVectors(detail.gradedVectors)
      if (detail?.optionScores) setOptionScores(detail.optionScores)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  useEffect(() => {
    if (!selectedCardUuid || cards.some(card => card.card_uuid === selectedCardUuid)) return
    setSelectedCardUuid(cards[0]?.card_uuid || null)
  }, [cards, selectedCardUuid])

  const persistAttrs = useCallback((next: Partial<{
    questionText: string
    cards: SortCard[]
    categories: SortCategory[]
    backgroundGradientSeed: string
    backgroundImageFileId: string | null
    backgroundImageBlockObject: any | null
  }> = {}) => {
    props.updateAttributes({
      question_uuid: questionUuid,
      question_text: next.questionText ?? questionText,
      cards: next.cards ?? cards,
      categories: next.categories ?? categories,
      background_gradient_seed: next.backgroundGradientSeed ?? backgroundGradientSeed,
      background_image_file_id: next.backgroundImageFileId ?? backgroundImageFileId,
      background_image_block_object: next.backgroundImageBlockObject ?? backgroundImageBlockObject,
    })
  }, [props, questionUuid, questionText, cards, categories, backgroundGradientSeed, backgroundImageFileId, backgroundImageBlockObject])

  const saveScoring = useCallback((newScores: Record<string, Record<string, number>>) => {
    if (scoringSaveTimer.current) clearTimeout(scoringSaveTimer.current)
    scoringSaveTimer.current = setTimeout(async () => {
      try {
        await updateQuizScoring(
          activity?.activity_uuid,
          getScoringPayload(quizMode, vectors, newScores, categoryVectors, gradedVectors),
          access_token
        )
        window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', { detail: { optionScores: newScores } }))
      } catch {}
    }, 800)
  }, [activity?.activity_uuid, quizMode, vectors, categoryVectors, gradedVectors, access_token])

  const getImageUrl = useCallback((blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid,
      `${blockObj.content.file_id}.${blockObj.content.file_format}`,
      'imageBlock'
    ) ?? null
  }, [org?.org_uuid, course?.courseStructure?.course_uuid, activity?.activity_uuid])

  const selectedCard = useMemo(
    () => cards.find(card => card.card_uuid === selectedCardUuid) || cards[0] || null,
    [cards, selectedCardUuid]
  )

  const handleQuestionTextChange = (value: string) => {
    setQuestionText(value)
    persistAttrs({ questionText: value })
  }

  const handleAddCard = () => {
    const nextCard = makeDefaultCard(cards.length)
    const nextCards = [...cards, nextCard]
    setCards(nextCards)
    setSelectedCardUuid(nextCard.card_uuid)
    persistAttrs({ cards: nextCards })
  }

  const handleUpdateCard = (cardUuid: string, field: keyof SortCard, value: string) => {
    const nextCards = cards.map(card => card.card_uuid === cardUuid ? { ...card, [field]: value } : card)
    setCards(nextCards)
    persistAttrs({ cards: nextCards })
  }

  const handleDeleteCard = (cardUuid: string) => {
    if (cards.length <= 1) return
    const nextCards = cards.filter(card => card.card_uuid !== cardUuid)
    setCards(nextCards)
    const nextScores = { ...optionScores }
    categories.forEach(category => { delete nextScores[getSortScoreKey(cardUuid, category.category_uuid)] })
    setOptionScores(nextScores)
    saveScoring(nextScores)
    setSelectedCardUuid(current => current === cardUuid ? (nextCards[0]?.card_uuid || null) : current)
    persistAttrs({ cards: nextCards })
  }

  const reorderCards = (fromCardUuid: string, toCardUuid: string) => {
    if (fromCardUuid === toCardUuid) return
    const fromIndex = cards.findIndex(card => card.card_uuid === fromCardUuid)
    const toIndex = cards.findIndex(card => card.card_uuid === toCardUuid)
    if (fromIndex < 0 || toIndex < 0) return
    const nextCards = [...cards]
    const [moved] = nextCards.splice(fromIndex, 1)
    nextCards.splice(toIndex, 0, moved)
    setCards(nextCards)
    persistAttrs({ cards: nextCards })
  }

  const handleCategoryCountChange = (count: number) => {
    const normalizedCount = count === 3 ? 3 : 2
    let nextCategories = [...categories]
    if (normalizedCount === 3) {
      if (!nextCategories.some(category => category.position === 'top')) {
        nextCategories = [...nextCategories, makeDefaultCategory('top', 2)]
      }
    } else {
      const removedTop = nextCategories.find(category => category.position === 'top')
      nextCategories = nextCategories.filter(category => category.position !== 'top')
      if (removedTop) {
        const nextScores = { ...optionScores }
        cards.forEach(card => { delete nextScores[getSortScoreKey(card.card_uuid, removedTop.category_uuid)] })
        setOptionScores(nextScores)
        saveScoring(nextScores)
      }
    }
    nextCategories = normalizeCategories(nextCategories)
    setCategories(nextCategories)
    persistAttrs({ categories: nextCategories })
  }

  const handleCategoryChange = (categoryUuid: string, field: keyof SortCategory, value: string) => {
    const nextCategories = categories.map(category => category.category_uuid === categoryUuid ? { ...category, [field]: value } : category)
    setCategories(nextCategories)
    persistAttrs({ categories: nextCategories })
  }

  const handleBackgroundUpload = async (file: File) => {
    setUploadingBackground(true)
    try {
      const blockObj = await uploadNewImageFile(file, activity?.activity_uuid || '', access_token)
      const nextFileId = blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null
      setBackgroundImageBlockObject(blockObj)
      setBackgroundImageFileId(nextFileId)
      persistAttrs({ backgroundImageBlockObject: blockObj, backgroundImageFileId: nextFileId })
    } finally {
      setUploadingBackground(false)
    }
  }

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const duplicatedCards = (nodeJSON.attrs.cards || []).map((card: SortCard, idx: number) => {
      const nextUuid = uuidv4()
      return { ...card, card_uuid: nextUuid, _source_card_uuid: card.card_uuid, title: card.title || `Card ${idx + 1}` }
    })
    const duplicatedCategories = normalizeCategories(nodeJSON.attrs.categories || []).map((category: SortCategory) => ({
      ...category,
      category_uuid: uuidv4(),
      _source_category_uuid: category.category_uuid,
    }))
    const nextOptionScores = { ...optionScores }
    duplicatedCards.forEach((card: any) => {
      duplicatedCategories.forEach((category: any) => {
        const sourceKey = getSortScoreKey(card._source_card_uuid, category._source_category_uuid)
        const targetKey = getSortScoreKey(card.card_uuid, category.category_uuid)
        if (optionScores[sourceKey]) nextOptionScores[targetKey] = { ...optionScores[sourceKey] }
      })
      delete card._source_card_uuid
    })
    duplicatedCategories.forEach((category: any) => delete category._source_category_uuid)
    setOptionScores(nextOptionScores)
    saveScoring(nextOptionScores)
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, {
      ...nodeJSON,
      attrs: {
        ...nodeJSON.attrs,
        question_uuid: uuidv4(),
        background_gradient_seed: uuidv4(),
        cards: duplicatedCards,
        categories: duplicatedCategories,
      },
    })
  }

  const handleScoreChange = (cardUuid: string, categoryUuid: string, vectorKey: string, value: number) => {
    const scoreKey = getSortScoreKey(cardUuid, categoryUuid)
    const nextScores = {
      ...optionScores,
      [scoreKey]: {
        ...(optionScores[scoreKey] || {}),
        [vectorKey]: value,
      },
    }
    setOptionScores(nextScores)
    saveScoring(nextScores)
  }

  if (!isEditable) return null

  return (
    <NodeViewWrapper className="quiz-sort-block my-4 w-full first:mt-0 last:mb-0">
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected ? '0 10px 26px rgba(2,132,199,0.16)' : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers3 size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Sort</span>
          <div style={{ flex: 1 }} />
          <select value={categories.length >= 3 ? 3 : 2} onChange={e => handleCategoryCountChange(parseInt(e.target.value, 10))}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #bae6fd', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}>
            <option value="2">2 trays</option>
            <option value="3">3 trays</option>
          </select>
          <div style={{ width: 1, height: 16, background: '#bae6fd', margin: '0 2px' }} />
          <button type="button" onClick={handleDuplicate} title="Duplicate question" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#38bdf8' }}>
            <Copy size={13} />
          </button>
          <button type="button" onClick={() => props.deleteNode()} title="Delete question" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }}>
            <Trash2 size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 4px', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
          <TabBtn active={activeTab === 'question'} onClick={() => setActiveTab('question')}>Question</TabBtn>
          <TabBtn active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</TabBtn>
        </div>

        <div style={{ padding: 12, background: '#fff' }}>
          {activeTab === 'question' && (
            <div style={{ position: 'relative', minHeight: 560, borderRadius: 24, overflow: 'hidden', background: backgroundImageBlockObject ? '#000' : getGradient(backgroundGradientSeed), border: '1px solid rgba(15,23,42,0.08)' }}>
              {backgroundImageBlockObject && (
                <img src={getImageUrl(backgroundImageBlockObject) || ''} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(3,7,18,0.06) 0%, rgba(3,7,18,0.2) 100%)' }} />
              <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {backgroundImageBlockObject ? (
                  <CornerBtn onClick={() => {
                    setBackgroundImageBlockObject(null)
                    setBackgroundImageFileId(null)
                    persistAttrs({ backgroundImageBlockObject: null, backgroundImageFileId: null })
                  }} title="Remove background">
                    <X size={12} />
                  </CornerBtn>
                ) : (
                  <>
                    <CornerBtn onClick={() => !uploadingBackground && backgroundInputRef.current?.click()} isLoading={uploadingBackground} title="Upload background">
                      <Upload size={12} />
                    </CornerBtn>
                    <CornerBtn onClick={() => {
                      const nextSeed = uuidv4()
                      setBackgroundGradientSeed(nextSeed)
                      persistAttrs({ backgroundGradientSeed: nextSeed })
                    }} title="Shuffle gradient">
                      <Dice6 size={12} />
                    </CornerBtn>
                  </>
                )}
                <input ref={backgroundInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
                  onChange={e => { const file = e.target.files?.[0]; if (file) void handleBackgroundUpload(file) }} />
              </div>

              <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 20, padding: 20 }}>
                <div style={{ borderRadius: 24, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 18px 40px rgba(15,23,42,0.12)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>Cards</p>
                    <button type="button" onClick={handleAddCard} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, border: 'none', background: '#0284c7', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 10px', cursor: 'pointer' }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 458, overflowY: 'auto' }}>
                    {cards.map((card, idx) => {
                      const active = card.card_uuid === selectedCard?.card_uuid
                      return (
                        <button key={card.card_uuid} type="button" draggable onClick={() => setSelectedCardUuid(card.card_uuid)}
                          onDragStart={() => {
                            setDraggedCardUuid(card.card_uuid)
                            setDragOverCardUuid(null)
                          }}
                          onDragOver={event => {
                            event.preventDefault()
                            if (draggedCardUuid && draggedCardUuid !== card.card_uuid) setDragOverCardUuid(card.card_uuid)
                          }}
                          onDrop={event => {
                            event.preventDefault()
                            if (draggedCardUuid) reorderCards(draggedCardUuid, card.card_uuid)
                            setDraggedCardUuid(null)
                            setDragOverCardUuid(null)
                          }}
                          onDragEnd={() => {
                            setDraggedCardUuid(null)
                            setDragOverCardUuid(null)
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            textAlign: 'left',
                            borderRadius: 18,
                            border: dragOverCardUuid === card.card_uuid ? '1px solid rgba(2,132,199,0.5)' : active ? '1px solid rgba(2,132,199,0.22)' : '1px solid rgba(148,163,184,0.16)',
                            background: dragOverCardUuid === card.card_uuid ? 'rgba(224,242,254,0.96)' : active ? 'rgba(224,242,254,0.88)' : '#fff',
                            padding: '12px 14px',
                            cursor: 'grab',
                            boxShadow: active ? '0 10px 30px rgba(2,132,199,0.12)' : '0 6px 16px rgba(15,23,42,0.06)',
                            opacity: draggedCardUuid === card.card_uuid ? 0.55 : 1,
                          }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: active ? '#0369a1' : '#94a3b8' }}>#{idx + 1}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title || 'Untitled card'}</span>
                          {card.description && <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.description}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: 540, background: 'rgba(255,255,255,0.84)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderRadius: 28, padding: 18, border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 24px 54px rgba(15,23,42,0.16)' }}>
                      <input value={questionText} placeholder="Prompt above the stack..." onChange={e => handleQuestionTextChange(e.target.value)}
                        style={{ width: '100%', border: 'none', borderRadius: 18, background: '#f8fafc', padding: '14px 16px', fontSize: 16, fontWeight: 800, color: '#0f172a', outline: 'none', marginBottom: 16 }} />
                      {selectedCard ? (
                        <div style={{ borderRadius: 26, background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid rgba(148,163,184,0.16)', padding: 18, boxShadow: '0 22px 48px rgba(15,23,42,0.12)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>Selected card</span>
                            <button type="button" onClick={() => handleDeleteCard(selectedCard.card_uuid)} disabled={cards.length <= 1}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, border: 'none', background: cards.length <= 1 ? '#e5e7eb' : '#fee2e2', color: cards.length <= 1 ? '#94a3b8' : '#b91c1c', fontSize: 11, fontWeight: 700, padding: '6px 10px', cursor: cards.length <= 1 ? 'not-allowed' : 'pointer' }}>
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                          <input value={selectedCard.title} placeholder="Card title" onChange={e => handleUpdateCard(selectedCard.card_uuid, 'title', e.target.value)}
                            style={{ width: '100%', border: 'none', borderRadius: 16, background: '#fff', padding: '14px 16px', fontSize: 18, fontWeight: 800, color: '#0f172a', outline: 'none', boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.18)' }} />
                          <textarea value={selectedCard.description} placeholder="Optional description" rows={4} onChange={e => handleUpdateCard(selectedCard.card_uuid, 'description', e.target.value)}
                            style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 16, background: '#fff', padding: '14px 16px', fontSize: 14, fontWeight: 500, color: '#334155', outline: 'none', resize: 'none', lineHeight: 1.5, boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.18)' }} />
                        </div>
                      ) : (
                        <div style={{ borderRadius: 24, border: '1px dashed rgba(148,163,184,0.36)', padding: 32, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Select a card to edit it.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: categories.length === 3 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {categories.map(category => (
                      <div key={category.category_uuid} style={{ position: 'relative', borderRadius: 22, background: category.color, border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 14px 32px rgba(15,23,42,0.08)', padding: 14, color: '#fff' }}>
                        <input type="color" value={category.color} onChange={e => handleCategoryChange(category.category_uuid, 'color', e.target.value)}
                          title="Change tray color"
                          style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, border: '1px solid rgba(255,255,255,0.65)', borderRadius: 999, padding: 3, background: 'rgba(255,255,255,0.22)', cursor: 'pointer' }} />
                        <button type="button" onClick={() => setIconPickerCategoryUuid(current => current === category.category_uuid ? null : category.category_uuid)}
                          title="Change icon"
                          style={{ width: 42, height: 42, borderRadius: 999, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 12 }}>
                          {renderSortIcon(category.icon, { size: 18, color: '#fff' })}
                        </button>
                        {iconPickerCategoryUuid === category.category_uuid && (
                          <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, padding: 10, borderRadius: 16, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.24)' }}>
                            {ICON_OPTIONS.map(option => {
                              const active = option.value === category.icon
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    handleCategoryChange(category.category_uuid, 'icon', option.value)
                                    setIconPickerCategoryUuid(null)
                                  }}
                                  title={option.label}
                                  style={{
                                    width: '100%',
                                    aspectRatio: '1 / 1',
                                    borderRadius: 12,
                                    border: active ? '2px solid rgba(255,255,255,0.95)' : '1px solid rgba(255,255,255,0.24)',
                                    background: active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {renderSortIcon(option.value, { size: 16, color: '#fff' })}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        <input value={category.label} placeholder="Category label" onChange={e => handleCategoryChange(category.category_uuid, 'label', e.target.value)}
                          style={{ width: '100%', border: 'none', borderRadius: 14, padding: '10px 12px', fontSize: 13, fontWeight: 800, outline: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff' }} />
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.84)', lineHeight: 1.4 }}>
                          {category.position === 'top' ? 'Top tray button sits elevated.' : `Cards sort into the ${category.position} tray.`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cards.map((card, idx) => (
                <div key={card.card_uuid} style={{ borderRadius: 22, border: '1px solid rgba(148,163,184,0.16)', background: '#f8fafc', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.12)', background: '#fff' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{card.title || `Card ${idx + 1}`}</span>
                  </div>
                  {vectors.length === 0 ? (
                    <div style={{ padding: 14 }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Add scoring dimensions in the quiz scoring tab first.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))`, gap: 12, padding: 12 }}>
                      {categories.map(category => {
                        const scoreKey = getSortScoreKey(card.card_uuid, category.category_uuid)
                        return (
                          <div key={category.category_uuid} style={{ borderRadius: 16, background: '#fff', border: '1px solid rgba(148,163,184,0.14)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: category.color, color: '#fff' }}>
                              {renderSortIcon(category.icon, { size: 14, color: '#fff' })}
                              <span style={{ fontSize: 12, fontWeight: 800 }}>{category.label || 'Untitled category'}</span>
                            </div>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {vectors.map(vector => {
                                const value = optionScores[scoreKey]?.[vector.key] ?? 0
                                const isBinary = vector.type === 'binary'
                                return (
                                  <div key={vector.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {isBinary ? (
                                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={value >= 0.5}
                                          onChange={e => handleScoreChange(card.card_uuid, category.category_uuid, vector.key, e.target.checked ? 1 : 0)}
                                          style={{ width: 14, height: 14, accentColor: category.color }}
                                        />
                                        <span>{vector.label || vector.key}</span>
                                      </label>
                                    ) : (
                                      <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: '#334155' }}>{vector.label || vector.key}</span>
                                          <span style={{ fontSize: 10, color: '#64748b' }}>{value.toFixed(2)}</span>
                                        </div>
                                        <input
                                          type="range"
                                          min={vector.type === 'bidirectional' ? -1 : 0}
                                          max={1}
                                          step={0.05}
                                          value={value}
                                          onChange={e => handleScoreChange(card.card_uuid, category.category_uuid, vector.key, parseFloat(e.target.value))}
                                          style={{ width: '100%', accentColor: category.color }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
                                          <span>{vector.low_label || 'Low'}</span>
                                          <span>{vector.high_label || 'High'}</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default QuizSortBlockComponent
