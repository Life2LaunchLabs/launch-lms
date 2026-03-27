'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Upload, Loader2, X, Trash2 } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { updateQuizScoring } from '@services/quiz/quiz'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface QuizOption {
  option_uuid: string
  label: string
  image_file_id: string | null
  image_block_object: any | null
  gradient_seed: string
  info_message: string
  info_image_file_id: string | null
  info_image_block_object: any | null
  show_info_expanded: boolean
}

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional'
  low_label: string
  high_label: string
}

type Tab = 'question' | 'scoring' | 'response'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultOption(): QuizOption {
  const uuid = uuidv4()
  return {
    option_uuid: uuid,
    label: '',
    image_file_id: null,
    image_block_object: null,
    gradient_seed: uuid,
    info_message: '',
    info_image_file_id: null,
    info_image_block_object: null,
    show_info_expanded: false,
  }
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

// ── Shared frosted corner button ─────────────────────────────────────────────

function CornerBtn({ onClick, isLoading, children }: { onClick: () => void; isLoading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        border: 'none', cursor: isLoading ? 'default' : 'pointer',
        color: '#fff', padding: 0, flexShrink: 0,
      }}
    >
      {isLoading ? <Loader2 size={12} className="animate-spin" /> : children}
    </button>
  )
}

// ── Question card (full-bleed gradient/image, centered label input) ───────────

function QuestionCard({ opt, idx, optionCount, isUploading, imageUrl, onLabelChange, onUpload, onClear }: {
  opt: QuizOption; idx: number; optionCount: number; isUploading: boolean; imageUrl: string | null
  onLabelChange: (uuid: string, label: string) => void
  onUpload: (file: File, uuid: string, field: 'main' | 'info') => void
  onClear: (uuid: string, field: 'main' | 'info') => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bg = getGradient(opt.gradient_seed)
  const h = optionCount === 4 ? 120 : 110

  return (
    <div style={{ position: 'relative', height: h, background: imageUrl ? '#000' : bg, overflow: 'hidden' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
      {/* Centered label input */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 44px' }}>
        <input
          value={opt.label}
          placeholder={`Option ${idx + 1}…`}
          onChange={e => onLabelChange(opt.option_uuid, e.target.value)}
          style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 14, fontWeight: 800, color: '#000', outline: 'none', lineHeight: 1.2 }}
        />
      </div>
      {/* Upload / Remove */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
        {imageUrl ? (
          <CornerBtn onClick={() => onClear(opt.option_uuid, 'main')}><X size={12} /></CornerBtn>
        ) : (
          <>
            <CornerBtn onClick={() => !isUploading && fileInputRef.current?.click()} isLoading={isUploading}><Upload size={12} /></CornerBtn>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f, opt.option_uuid, 'main') }} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Response card (label top-left, info-message input centered, info-image upload) ──

function ResponseCard({ opt, idx, optionCount, isUploading, imageUrl, onInfoChange, onUpload, onClear }: {
  opt: QuizOption; idx: number; optionCount: number; isUploading: boolean; imageUrl: string | null
  onInfoChange: (uuid: string, msg: string) => void
  onUpload: (file: File, uuid: string, field: 'main' | 'info') => void
  onClear: (uuid: string, field: 'main' | 'info') => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bg = getGradient(opt.gradient_seed)
  const h = optionCount === 4 ? 120 : 110

  return (
    <div style={{ position: 'relative', height: h, background: imageUrl ? '#000' : bg, overflow: 'hidden' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />

      {/* Option label — top-left */}
      <div style={{ position: 'absolute', top: 8, left: 10, zIndex: 5 }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.5)', maxWidth: 120, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {opt.label || `Option ${idx + 1}`}
        </span>
      </div>

      {/* Centered info-message textarea */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 44px 8px 10px' }}>
        <textarea
          value={opt.info_message}
          placeholder="Response shown after selection…"
          rows={2}
          onChange={e => onInfoChange(opt.option_uuid, e.target.value)}
          style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontWeight: 600, color: '#000', outline: 'none', lineHeight: 1.3, resize: 'none' }}
        />
      </div>

      {/* Upload / Remove info image */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
        {imageUrl ? (
          <CornerBtn onClick={() => onClear(opt.option_uuid, 'info')}><X size={12} /></CornerBtn>
        ) : (
          <>
            <CornerBtn onClick={() => !isUploading && fileInputRef.current?.click()} isLoading={isUploading}><Upload size={12} /></CornerBtn>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f, opt.option_uuid, 'info') }} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Scoring card (label + line + sliders) ────────────────────────────────────

function ScoringCard({ opt, idx, vectors, optionScores, onScoreChange }: {
  opt: QuizOption; idx: number; vectors: ScoringVector[]
  optionScores: Record<string, Record<string, number>>
  onScoreChange: (optionUuid: string, vectorKey: string, value: number) => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 12px 12px' }}>
      {/* Option label */}
      <p style={{ color: '#374151', fontSize: 12, fontWeight: 800, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {opt.label || `Option ${idx + 1}`}
      </p>
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 0 8px' }} />

      {vectors.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 11, margin: 0 }}>No scoring dimensions. Add them in the Scoring &amp; Results panel.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vectors.map(vec => {
            const val = optionScores[opt.option_uuid]?.[vec.key] ?? 0
            return (
              <div key={vec.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#374151', fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {vec.label || vec.key}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 10 }}>{val.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={vec.type === 'bidirectional' ? -1 : 0}
                  max={1}
                  step={0.05}
                  value={val}
                  onChange={e => onScoreChange(opt.option_uuid, vec.key, parseFloat(e.target.value))}
                  style={{ width: '100%', height: 4, accentColor: '#7c3aed', display: 'block' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>{vec.low_label || 'Low'}</span>
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>{vec.high_label || 'High'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab pill button ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${
        active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}

// ── Main block component ──────────────────────────────────────────────────────

function QuizSelectBlockComponent(props: any) {
  const editorState = useEditorProvider() as any
  const isEditable = editorState.isEditable
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const course = useCourse() as any

  const attrs = props.node.attrs
  const activity = props.extension.options.activity

  const [questionText, setQuestionText] = useState<string>(attrs.question_text || '')
  const [optionCount, setOptionCount] = useState<number>(attrs.option_count || 2)
  const [options, setOptions] = useState<QuizOption[]>(() => {
    const existing: QuizOption[] = attrs.options || []
    const count = attrs.option_count || 2
    if (existing.length >= count) return existing.slice(0, count)
    return [...existing, ...Array.from({ length: count - existing.length }, makeDefaultOption)]
  })
  const [showResponses, setShowResponses] = useState<boolean>(attrs.show_responses || false)
  const [activeTab, setActiveTab] = useState<Tab>('question')
  const [uploadingMap, setUploadingMap] = useState<Record<string, boolean>>({})

  // Scoring state — initialized from activity details, saved to API
  const [optionScores, setOptionScores] = useState<Record<string, Record<string, number>>>(
    activity?.details?.option_scores || {}
  )
  const [vectors, setVectors] = useState<ScoringVector[]>(activity?.details?.scoring_vectors || [])
  const scoringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refresh vectors whenever the scoring panel saves
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.vectors) setVectors(detail.vectors)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  // Keep activeTab valid when showResponses toggles off
  useEffect(() => {
    if (!showResponses && activeTab === 'response') setActiveTab('question')
  }, [showResponses, activeTab])

  // ── Persistence helpers ──────────────────────────────────────────────────

  const saveAttrs = useCallback((newOptions: QuizOption[], newCount: number, newText: string, newShowResponses: boolean) => {
    props.updateAttributes({
      question_uuid: attrs.question_uuid || uuidv4(),
      question_text: newText,
      option_count: newCount,
      options: newOptions,
      show_responses: newShowResponses,
    })
  }, [props, attrs.question_uuid])

  const saveScoring = useCallback((newScores: Record<string, Record<string, number>>) => {
    if (scoringSaveTimer.current) clearTimeout(scoringSaveTimer.current)
    scoringSaveTimer.current = setTimeout(async () => {
      try {
        await updateQuizScoring(
          activity?.activity_uuid,
          { scoring_vectors: vectors, option_scores: newScores },
          access_token
        )
      } catch { /* silently ignore */ }
    }, 800)
  }, [activity?.activity_uuid, vectors, access_token])

  // ── Option count ─────────────────────────────────────────────────────────

  const handleOptionCountChange = (count: number) => {
    let newOptions = [...options]
    if (count > options.length) {
      newOptions = [...newOptions, ...Array.from({ length: count - options.length }, makeDefaultOption)]
    } else {
      newOptions = newOptions.slice(0, count)
    }
    setOptionCount(count)
    setOptions(newOptions)
    saveAttrs(newOptions, count, questionText, showResponses)
  }

  // ── Label ────────────────────────────────────────────────────────────────

  const handleLabelChange = (uuid: string, label: string) => {
    const newOpts = options.map(o => o.option_uuid === uuid ? { ...o, label } : o)
    setOptions(newOpts)
    saveAttrs(newOpts, optionCount, questionText, showResponses)
  }

  // ── Info / Response message ──────────────────────────────────────────────

  const handleInfoChange = (uuid: string, info_message: string) => {
    const newOpts = options.map(o => o.option_uuid === uuid ? { ...o, info_message } : o)
    setOptions(newOpts)
    saveAttrs(newOpts, optionCount, questionText, showResponses)
  }

  // ── Show responses toggle ────────────────────────────────────────────────

  const handleToggleResponses = (val: boolean) => {
    setShowResponses(val)
    saveAttrs(options, optionCount, questionText, val)
  }

  // ── Scoring ──────────────────────────────────────────────────────────────

  const handleScoreChange = (optionUuid: string, vectorKey: string, value: number) => {
    const newScores = {
      ...optionScores,
      [optionUuid]: { ...(optionScores[optionUuid] || {}), [vectorKey]: value },
    }
    setOptionScores(newScores)
    saveScoring(newScores)
  }

  // ── Image uploads ────────────────────────────────────────────────────────

  const handleImageUpload = async (file: File, optionUuid: string, field: 'main' | 'info') => {
    const key = `${optionUuid}_${field}`
    setUploadingMap(m => ({ ...m, [key]: true }))
    try {
      const blockObj = await uploadNewImageFile(file, activity?.activity_uuid || '', access_token)
      const newOpts = options.map(o => {
        if (o.option_uuid !== optionUuid) return o
        if (field === 'main') return { ...o, image_block_object: blockObj, image_file_id: blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null }
        return { ...o, info_image_block_object: blockObj, info_image_file_id: blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null }
      })
      setOptions(newOpts)
      saveAttrs(newOpts, optionCount, questionText, showResponses)
    } finally {
      setUploadingMap(m => ({ ...m, [key]: false }))
    }
  }

  const handleImageClear = (optionUuid: string, field: 'main' | 'info') => {
    const newOpts = options.map(o => {
      if (o.option_uuid !== optionUuid) return o
      if (field === 'main') return { ...o, image_block_object: null, image_file_id: null }
      return { ...o, info_image_block_object: null, info_image_file_id: null }
    })
    setOptions(newOpts)
    saveAttrs(newOpts, optionCount, questionText, showResponses)
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

  if (!isEditable) return null

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: optionCount === 4 ? '1fr 1fr' : '1fr',
    gap: 4,
    borderRadius: 12,
    overflow: 'hidden',
  }

  return (
    <NodeViewWrapper className="quiz-select-block w-full">
      <div className="bg-neutral-50 rounded-xl px-5 py-4 nice-shadow">

        {/* ── Header: label + opt-count buttons + responses toggle + delete ── */}
        <div className="flex items-center gap-2 mb-3">
          <span className="uppercase tracking-widest text-xs font-bold text-violet-500">Question</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Option count */}
            {([2, 3, 4] as const).map(n => (
              <button key={n} type="button" onClick={() => handleOptionCountChange(n)}
                className={`px-2 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${optionCount === n ? 'bg-violet-600 text-white' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'}`}>
                {n} opt
              </button>
            ))}
            <div className="w-px h-4 bg-neutral-200 mx-0.5" />
            {/* Responses toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showResponses}
                onChange={e => handleToggleResponses(e.target.checked)}
                className="accent-violet-600 w-3.5 h-3.5"
              />
              <span className="text-xs text-neutral-500 font-medium">Responses</span>
            </label>
            <div className="w-px h-4 bg-neutral-200 mx-0.5" />
            {/* Delete block */}
            <button
              type="button"
              onClick={() => props.deleteNode()}
              className="p-1 rounded hover:bg-red-50 outline-none transition-colors"
              title="Delete question"
            >
              <Trash2 size={13} className="text-red-400" />
            </button>
          </div>
        </div>

        {/* ── Question text ── */}
        <input
          value={questionText}
          placeholder="Question text…"
          onChange={e => { setQuestionText(e.target.value); saveAttrs(options, optionCount, e.target.value, showResponses) }}
          className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm font-semibold mb-3 outline-none focus:border-violet-400 transition-colors"
        />

        {/* ── Tab strip ── */}
        <div className="flex gap-1 mb-2">
          <TabBtn active={activeTab === 'question'} onClick={() => setActiveTab('question')}>Question</TabBtn>
          <TabBtn active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</TabBtn>
          {showResponses && <TabBtn active={activeTab === 'response'} onClick={() => setActiveTab('response')}>Response</TabBtn>}
        </div>

        {/* ── Question tab ── */}
        {activeTab === 'question' && (
          <div style={gridStyle}>
            {options.map((opt, idx) => (
              <QuestionCard
                key={opt.option_uuid}
                opt={opt} idx={idx} optionCount={optionCount}
                isUploading={!!uploadingMap[`${opt.option_uuid}_main`]}
                imageUrl={getImageUrl(opt.image_block_object)}
                onLabelChange={handleLabelChange}
                onUpload={handleImageUpload}
                onClear={handleImageClear}
              />
            ))}
          </div>
        )}

        {/* ── Scoring tab ── */}
        {activeTab === 'scoring' && (
          <div style={gridStyle}>
            {options.map((opt, idx) => (
              <ScoringCard
                key={opt.option_uuid}
                opt={opt} idx={idx} vectors={vectors}
                optionScores={optionScores}
                onScoreChange={handleScoreChange}
              />
            ))}
          </div>
        )}

        {/* ── Response tab ── */}
        {activeTab === 'response' && showResponses && (
          <div style={gridStyle}>
            {options.map((opt, idx) => (
              <ResponseCard
                key={opt.option_uuid}
                opt={opt} idx={idx} optionCount={optionCount}
                isUploading={!!uploadingMap[`${opt.option_uuid}_info`]}
                imageUrl={getImageUrl(opt.info_image_block_object)}
                onInfoChange={handleInfoChange}
                onUpload={handleImageUpload}
                onClear={handleImageClear}
              />
            ))}
          </div>
        )}

      </div>
    </NodeViewWrapper>
  )
}

export default QuizSelectBlockComponent
