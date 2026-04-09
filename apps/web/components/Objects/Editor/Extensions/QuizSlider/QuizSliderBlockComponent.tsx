'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { SlidersHorizontal, Trash2, Upload, Loader2, X, Copy, Dice6, Star } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updateQuizScoring } from '@services/quiz/quiz'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

type Tab = 'question' | 'scoring'
type DirectionMode = 'unidirectional' | 'bidirectional' | 'stars'
type LabelMode = 'none' | 'numbers' | 'labels'

interface QuizSliderOption {
  slider_uuid: string
  label: string
}

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

const HEADER_BG = '#fef3c7'
const ACCENT_COLOR = '#d97706'
const SLIDER_BLUE = '#2563eb'
const SLIDER_RED = '#dc2626'
const SLIDER_GREY = '#d1d5db'
const OVERLAY_TITLE_STYLE: React.CSSProperties = {
  width: '100%',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.14)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.24)',
  borderRadius: 999,
  padding: '10px 16px',
  fontSize: 15,
  fontWeight: 800,
  color: '#fff',
  outline: 'none',
  lineHeight: 1.2,
  boxShadow: '0 14px 34px rgba(15,23,42,0.18)',
}

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

function makeDefaultSliderOption(): QuizSliderOption {
  return { slider_uuid: uuidv4(), label: '' }
}

function normalizeSliderOptions(sliders: QuizSliderOption[], count: number): QuizSliderOption[] {
  if (sliders.length >= count) return sliders.slice(0, count)
  return [...sliders, ...Array.from({ length: count - sliders.length }, makeDefaultSliderOption)]
}

function applySingleSliderLabel(sliders: QuizSliderOption[], count: number, questionText: string): QuizSliderOption[] {
  if (count !== 1 || sliders.length === 0) return sliders
  return sliders.map((slider, idx) => idx === 0 ? { ...slider, label: questionText } : slider)
}

function getSliderStep(labelMode: LabelMode, directionMode: DirectionMode, numberMax: number): number {
  if (directionMode === 'stars') return 0.25
  if (labelMode !== 'numbers') return 0.01
  const safeMax = Math.max(1, numberMax)
  return directionMode === 'bidirectional' ? 1 / (safeMax * 2) : 1 / safeMax
}

function getTickValues(labelMode: LabelMode, directionMode: DirectionMode, numberMax: number): number[] {
  if (directionMode === 'stars') return []
  if (labelMode !== 'numbers') return []
  const safeMax = Math.max(1, Math.min(10, numberMax))
  const count = directionMode === 'bidirectional' ? safeMax * 2 : safeMax
  return Array.from({ length: count + 1 }, (_, idx) => idx / count)
}

function getSliderTrackBackground(directionMode: DirectionMode, value: number): string {
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

function getSliderInputStyle(directionMode: DirectionMode, value: number): React.CSSProperties {
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

function getPreviewSliderValue(directionMode: DirectionMode): number {
  if (directionMode === 'bidirectional') return 0.5
  if (directionMode === 'stars') return 0
  return 0
}

function normalizeDirectionMode(value: unknown): DirectionMode {
  if (value === 'bidirectional' || value === 'stars') return value
  return 'unidirectional'
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

function ScoringCard({
  slider,
  idx,
  vectors,
  optionScores,
  onScoreChange,
}: {
  slider: QuizSliderOption
  idx: number
  vectors: ScoringVector[]
  optionScores: Record<string, Record<string, number>>
  onScoreChange: (sliderUuid: string, vectorKey: string, value: number) => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 12px 12px', borderRadius: 16 }}>
      <p style={{ color: '#374151', fontSize: 12, fontWeight: 800, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {slider.label || `Slider ${idx + 1}`}
      </p>
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 0 8px' }} />
      {vectors.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 11, margin: 0 }}>No scoring dimensions. Add them in the Scoring tab.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vectors.map(vec => {
            const val = optionScores[slider.slider_uuid]?.[vec.key] ?? 0
            const isBinary = vec.type === 'binary'
            return (
              <div key={vec.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
                {isBinary ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#374151', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={val >= 0.5}
                      onChange={e => onScoreChange(slider.slider_uuid, vec.key, e.target.checked ? 1 : 0)}
                      style={{ width: 14, height: 14, accentColor: ACCENT_COLOR }}
                    />
                    <span>{vec.label || vec.key}</span>
                  </label>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ color: '#374151', fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{vec.label || vec.key}</span>
                      <span style={{ color: '#6b7280', fontSize: 10 }}>{val.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={vec.type === 'bidirectional' ? -1 : 0}
                      max={1}
                      step={0.05}
                      value={val}
                      onChange={e => onScoreChange(slider.slider_uuid, vec.key, parseFloat(e.target.value))}
                      style={{ width: '100%', height: 4, accentColor: ACCENT_COLOR, display: 'block' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: '#9ca3af' }}>{vec.low_label || 'Low'}</span>
                      <span style={{ fontSize: 9, color: '#9ca3af' }}>{vec.high_label || 'High'}</span>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuizSliderBlockComponent(props: any) {
  const editorState = useEditorProvider() as any
  const isEditable = editorState.isEditable
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const activity = props.extension.options.activity
  const org = useOrg() as any
  const course = useCourse() as any
  const attrs = props.node.attrs
  const questionUuidRef = useRef<string>(attrs.question_uuid || uuidv4())
  const questionUuid = questionUuidRef.current
  const backgroundInputRef = useRef<HTMLInputElement>(null)

  const [questionText, setQuestionText] = useState<string>(attrs.question_text || '')
  const [sliderCount, setSliderCount] = useState<number>(Math.max(1, Math.min(6, attrs.slider_count || 2)))
  const [directionMode, setDirectionMode] = useState<DirectionMode>(normalizeDirectionMode(attrs.direction_mode))
  const [labelMode, setLabelMode] = useState<LabelMode>(attrs.label_mode === 'numbers' || attrs.label_mode === 'labels' ? attrs.label_mode : 'none')
  const [numberMax, setNumberMax] = useState<number>(Math.max(1, attrs.number_max || 5))
  const [leftAxisLabel, setLeftAxisLabel] = useState<string>(attrs.left_axis_label || '')
  const [rightAxisLabel, setRightAxisLabel] = useState<string>(attrs.right_axis_label || '')
  const [sliders, setSliders] = useState<QuizSliderOption[]>(() => {
    const count = Math.max(1, Math.min(6, attrs.slider_count || 2))
    return applySingleSliderLabel(normalizeSliderOptions(attrs.sliders || [], count), count, attrs.question_text || '')
  })
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

  const persistAttrs = useCallback((next: Partial<{
    questionText: string
    sliderCount: number
    directionMode: DirectionMode
    labelMode: LabelMode
    numberMax: number
    leftAxisLabel: string
    rightAxisLabel: string
    sliders: QuizSliderOption[]
    backgroundGradientSeed: string
    backgroundImageFileId: string | null
    backgroundImageBlockObject: any | null
  }> = {}) => {
    const resolvedSliderCount = next.sliderCount ?? sliderCount
    const resolvedQuestionText = next.questionText ?? questionText
    const resolvedSliders = applySingleSliderLabel(next.sliders ?? sliders, resolvedSliderCount, resolvedQuestionText)
    props.updateAttributes({
      question_uuid: questionUuid,
      question_text: resolvedQuestionText,
      slider_count: resolvedSliderCount,
      direction_mode: next.directionMode ?? directionMode,
      label_mode: next.labelMode ?? labelMode,
      number_max: next.numberMax ?? numberMax,
      left_axis_label: next.leftAxisLabel ?? leftAxisLabel,
      right_axis_label: next.rightAxisLabel ?? rightAxisLabel,
      sliders: resolvedSliders,
      background_gradient_seed: next.backgroundGradientSeed ?? backgroundGradientSeed,
      background_image_file_id: next.backgroundImageFileId ?? backgroundImageFileId,
      background_image_block_object: next.backgroundImageBlockObject ?? backgroundImageBlockObject,
    })
  }, [props, questionUuid, questionText, sliderCount, directionMode, labelMode, numberMax, leftAxisLabel, rightAxisLabel, sliders, backgroundGradientSeed, backgroundImageFileId, backgroundImageBlockObject])

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

  const handleSliderCountChange = (count: number) => {
    const nextCount = Math.max(1, Math.min(6, count))
    const nextSliders = applySingleSliderLabel(normalizeSliderOptions(sliders, nextCount), nextCount, questionText)
    setSliderCount(nextCount)
    setSliders(nextSliders)
    persistAttrs({ sliderCount: nextCount, sliders: nextSliders })
  }

  const handleSliderLabelChange = (sliderUuid: string, label: string) => {
    if (sliderCount === 1) return
    const nextSliders = sliders.map(slider => slider.slider_uuid === sliderUuid ? { ...slider, label } : slider)
    setSliders(nextSliders)
    persistAttrs({ sliders: nextSliders })
  }

  const handleLabelModeChange = (nextMode: LabelMode) => {
    if (directionMode === 'stars') return
    setLabelMode(nextMode)
    persistAttrs({ labelMode: nextMode })
  }

  const handleScoreChange = (sliderUuid: string, vectorKey: string, value: number) => {
    const newScores = { ...optionScores, [sliderUuid]: { ...(optionScores[sliderUuid] || {}), [vectorKey]: value } }
    setOptionScores(newScores)
    saveScoring(newScores)
  }

  const getImageUrl = (blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid,
      `${blockObj.content.file_id}.${blockObj.content.file_format}`,
      'imageBlock'
    ) ?? null
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

  const clearBackground = () => {
    setBackgroundImageBlockObject(null)
    setBackgroundImageFileId(null)
    persistAttrs({ backgroundImageBlockObject: null, backgroundImageFileId: null })
  }

  const handleRerandomizeGradient = () => {
    const nextSeed = uuidv4()
    setBackgroundGradientSeed(nextSeed)
    persistAttrs({ backgroundGradientSeed: nextSeed })
  }

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const duplicatedSliders = (nodeJSON.attrs.sliders || []).map((slider: QuizSliderOption) => {
      const nextSliderUuid = uuidv4()
      return {
        ...slider,
        slider_uuid: nextSliderUuid,
        _source_slider_uuid: slider.slider_uuid,
      }
    })
    const nextOptionScores = { ...optionScores }
    duplicatedSliders.forEach((slider: QuizSliderOption & { _source_slider_uuid?: string }) => {
      if (slider._source_slider_uuid && optionScores[slider._source_slider_uuid]) {
        nextOptionScores[slider.slider_uuid] = { ...optionScores[slider._source_slider_uuid] }
      }
      delete slider._source_slider_uuid
    })
    setOptionScores(nextOptionScores)
    saveScoring(nextOptionScores)
    const newAttrs = {
      ...nodeJSON.attrs,
      question_uuid: uuidv4(),
      background_gradient_seed: uuidv4(),
      sliders: duplicatedSliders,
    }
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, { ...nodeJSON, attrs: newAttrs })
  }

  const tickValues = useMemo(() => getTickValues(labelMode, directionMode, numberMax), [labelMode, directionMode, numberMax])
  const sliderStep = useMemo(() => getSliderStep(labelMode, directionMode, numberMax), [labelMode, directionMode, numberMax])
  const hideOptionLabels = sliderCount === 1
  const previewValue = getPreviewSliderValue(directionMode)

  if (!isEditable) return null

  const backgroundUrl = getImageUrl(backgroundImageBlockObject)

  return (
    <NodeViewWrapper className="quiz-slider-block my-4 w-full first:mt-0 last:mb-0">
      <style>{`
        .quiz-slider-range {
          appearance: none;
          -webkit-appearance: none;
        }
        .quiz-slider-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #fff;
          border: 2px solid rgba(15, 23, 42, 0.12);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
        }
        .quiz-slider-range::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #fff;
          border: 2px solid rgba(15, 23, 42, 0.12);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
        }
      `}</style>
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected ? '0 10px 26px rgba(217,119,6,0.16)' : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SlidersHorizontal size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Rating</span>
          <div style={{ flex: 1 }} />
          <select
            value={sliderCount}
            onChange={e => handleSliderCountChange(parseInt(e.target.value, 10))}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #fcd34d', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}
          >
            <option value="1">1 slider</option>
            <option value="2">2 sliders</option>
            <option value="3">3 sliders</option>
            <option value="4">4 sliders</option>
            <option value="5">5 sliders</option>
            <option value="6">6 sliders</option>
          </select>
          <select
            value={directionMode}
            onChange={e => {
              const next = e.target.value as DirectionMode
              setDirectionMode(next)
              if (next === 'stars') {
                setLabelMode('none')
                persistAttrs({ directionMode: next, labelMode: 'none' })
              } else {
                persistAttrs({ directionMode: next })
              }
            }}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #fcd34d', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}
          >
            <option value="unidirectional">Uni</option>
            <option value="bidirectional">Bi</option>
            <option value="stars">Stars</option>
          </select>
          {directionMode !== 'stars' && (
            <select
              value={labelMode}
              onChange={e => handleLabelModeChange(e.target.value as LabelMode)}
              style={{ fontSize: 11, fontWeight: 600, border: '1px solid #fcd34d', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}
            >
              <option value="none">No labels</option>
              <option value="numbers">Numbers</option>
              <option value="labels">Labels</option>
            </select>
          )}
          <div style={{ width: 1, height: 16, background: '#fcd34d', margin: '0 2px' }} />
          <button
            type="button"
            onClick={handleDuplicate}
            title="Duplicate question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f59e0b' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fffbeb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={() => props.deleteNode()}
            title="Delete question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 4px', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
          <TabBtn active={activeTab === 'question'} onClick={() => setActiveTab('question')}>Question</TabBtn>
          <TabBtn active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</TabBtn>
        </div>

        <div style={{ padding: '12px', background: '#fff' }}>
          {activeTab === 'question' && (
            <div style={{ position: 'relative', height: 420, borderRadius: 12, overflow: 'hidden', background: backgroundUrl ? '#000' : getGradient(backgroundGradientSeed) }}>
              {backgroundUrl && <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {backgroundUrl ? (
                  <button
                    type="button"
                    onClick={clearBackground}
                    title="Remove image"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => !uploadingBackground && backgroundInputRef.current?.click()}
                      title="Upload background"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}
                    >
                      {uploadingBackground ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleRerandomizeGradient}
                      title="Randomize gradient"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}
                    >
                      <Dice6 size={12} />
                    </button>
                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleBackgroundUpload(file) }}
                    />
                  </>
                )}
              </div>

              <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    value={questionText}
                    placeholder="Question title…"
                    onChange={e => {
                      const nextText = e.target.value
                      const nextSliders = applySingleSliderLabel(sliders, sliderCount, nextText)
                      setQuestionText(nextText)
                      if (sliderCount === 1) setSliders(nextSliders)
                      persistAttrs({ questionText: nextText, sliders: nextSliders })
                    }}
                    style={OVERLAY_TITLE_STYLE}
                  />

                  {directionMode !== 'stars' && labelMode === 'numbers' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        min={1}
                        value={numberMax}
                        onChange={e => {
                          const next = Math.max(1, parseInt(e.target.value || '1', 10) || 1)
                          setNumberMax(next)
                          persistAttrs({ numberMax: next })
                        }}
                        style={{ width: 84, background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 999, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#111827', outline: 'none' }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 700 }}>
                        Max value {directionMode === 'bidirectional' ? 'shown on both sides' : 'shown on the right'}
                      </span>
                    </div>
                  )}

                  {directionMode !== 'stars' && labelMode === 'labels' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input
                        value={leftAxisLabel}
                        placeholder="Left label…"
                        onChange={e => { setLeftAxisLabel(e.target.value); persistAttrs({ leftAxisLabel: e.target.value }) }}
                        style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 999, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#111827', outline: 'none' }}
                      />
                      <input
                        value={rightAxisLabel}
                        placeholder="Right label…"
                        onChange={e => { setRightAxisLabel(e.target.value); persistAttrs({ rightAxisLabel: e.target.value }) }}
                        style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 999, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#111827', outline: 'none' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                          <span>{leftAxisLabel || '\u00A0'}</span>
                          <span>{rightAxisLabel || '\u00A0'}</span>
                        </div>
                      </div>
                    )}
                    {sliders.map((slider, idx) => (
                      <div key={slider.slider_uuid} style={{ display: 'grid', gridTemplateColumns: hideOptionLabels ? '1fr' : '120px 1fr', gap: 12, alignItems: 'center' }}>
                        {!hideOptionLabels && (
                          <input
                            value={slider.label}
                            placeholder={`Option ${idx + 1}…`}
                            onChange={e => handleSliderLabelChange(slider.slider_uuid, e.target.value)}
                            style={{ width: '100%', textAlign: 'right', background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 999, padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#111827', outline: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.16)' }}
                          />
                        )}
                        <div>
                          {directionMode === 'stars' ? (
                            <div style={{ display: 'flex', gap: 8, justifyContent: hideOptionLabels ? 'center' : 'flex-start' }}>
                              {Array.from({ length: 5 }, (_, starIdx) => (
                                <Star
                                  key={`${slider.slider_uuid}_${starIdx}`}
                                  size={28}
                                  strokeWidth={2.2}
                                  style={{ color: '#fff', fill: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.3))' }}
                                />
                              ))}
                            </div>
                          ) : (
                            <>
                              <input
                                className="quiz-slider-range"
                                type="range"
                                min={0}
                                max={1}
                                step={sliderStep}
                                value={previewValue}
                                readOnly
                                style={getSliderInputStyle(directionMode, previewValue)}
                              />
                              {tickValues.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                  {tickValues.map(tick => (
                                    <span key={`${slider.slider_uuid}_${tick}`} style={{ width: 2, height: 8, borderRadius: 999, background: tick === 0.5 && directionMode === 'bidirectional' ? '#9ca3af' : '#d1d5db', display: 'block' }} />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 min-h-[420px]">
              <p className="text-xs text-neutral-500">
                Each row uses its configured vector scores as the full-strength value, and the learner&apos;s slider position applies a 0..1 multiplier to all of them.
              </p>
              <div className="grid gap-3">
                {sliders.map((slider, idx) => (
                  <ScoringCard
                    key={slider.slider_uuid}
                    slider={{ ...slider, label: hideOptionLabels ? questionText : slider.label }}
                    idx={idx}
                    vectors={vectors}
                    optionScores={optionScores}
                    onScoreChange={handleScoreChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default QuizSliderBlockComponent
