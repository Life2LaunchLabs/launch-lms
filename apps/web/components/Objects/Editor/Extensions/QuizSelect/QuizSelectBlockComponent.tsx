'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Upload, Loader2, X, Trash2, ListChecks, Copy, Dice6 } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { updateQuizScoring } from '@services/quiz/quiz'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

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
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

type Tab = 'question' | 'scoring' | 'response'
type DisplayStyle = 'image' | 'text'

const HEADER_BG = '#ede9fe'
const HEADER_BORDER = '#ddd6fe'
const ACCENT_COLOR = '#7c3aed'
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

function makeDefaultOption(): QuizOption {
  const uuid = uuidv4()
  return {
    option_uuid: uuid, label: '', image_file_id: null, image_block_object: null,
    gradient_seed: uuid, info_message: '', info_image_file_id: null,
    info_image_block_object: null, show_info_expanded: false,
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

function QuestionImageCard({
  opt, idx, tileHeight, isUploading, imageUrl,
  onLabelChange, onUpload, onClear, onRerandomize,
}: {
  opt: QuizOption; idx: number; tileHeight: number; isUploading: boolean; imageUrl: string | null
  onLabelChange: (uuid: string, label: string) => void
  onUpload: (file: File, optionUuid: string, field: 'main' | 'info' | 'background') => void
  onClear: (optionUuid: string | null, field: 'main' | 'info' | 'background') => void
  onRerandomize: (uuid: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bg = getGradient(opt.gradient_seed)

  return (
    <div style={{ position: 'relative', height: tileHeight || '100%', background: imageUrl ? '#000' : bg, overflow: 'hidden' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 44px' }}>
        <input
          value={opt.label}
          placeholder={`Option ${idx + 1}…`}
          onChange={e => onLabelChange(opt.option_uuid, e.target.value)}
          style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 14, fontWeight: 800, color: '#000', outline: 'none', lineHeight: 1.2 }}
        />
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {imageUrl ? (
          <CornerBtn onClick={() => onClear(opt.option_uuid, 'main')} title="Remove image"><X size={12} /></CornerBtn>
        ) : (
          <>
            <CornerBtn onClick={() => !isUploading && fileInputRef.current?.click()} isLoading={isUploading} title="Upload image">
              <Upload size={12} />
            </CornerBtn>
            <CornerBtn onClick={() => onRerandomize(opt.option_uuid)} title="Randomize gradient">
              <Dice6 size={12} />
            </CornerBtn>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f, opt.option_uuid, 'main') }} />
          </>
        )}
      </div>
    </div>
  )
}

function QuestionImageGrid({
  options, optionCount, uploadingMap, getImageUrl, questionText,
  onLabelChange, onUpload, onClear, onRerandomize, onTitleChange,
}: {
  options: QuizOption[]; optionCount: number; uploadingMap: Record<string, boolean>
  getImageUrl: (blockObj: any) => string | null
  questionText: string
  onLabelChange: (uuid: string, label: string) => void
  onUpload: (file: File, optionUuid: string, field: 'main' | 'info' | 'background') => void
  onClear: (optionUuid: string | null, field: 'main' | 'info' | 'background') => void
  onRerandomize: (uuid: string) => void
  onTitleChange: (text: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 420 }}>
      <div style={{ padding: '0 4px' }}>
        <input
          value={questionText}
          placeholder="Question text…"
          onChange={e => onTitleChange(e.target.value)}
          style={{ width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: '10px 16px', fontSize: 15, fontWeight: 800, color: '#111827', outline: 'none', lineHeight: 1.2, boxShadow: '0 6px 18px rgba(15,23,42,0.06)' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: optionCount === 4 ? '1fr 1fr' : '1fr', gridTemplateRows: optionCount === 4 ? '1fr 1fr' : `repeat(${optionCount}, minmax(0, 1fr))`, gap: 4, flex: 1, borderRadius: 12, overflow: 'hidden', background: '#111827' }}>
        {options.map((opt, idx) => (
          <QuestionImageCard
            key={opt.option_uuid} opt={opt} idx={idx} tileHeight={0}
            isUploading={!!uploadingMap[`${opt.option_uuid}_main`]}
            imageUrl={getImageUrl(opt.image_block_object)}
            onLabelChange={onLabelChange} onUpload={onUpload} onClear={onClear}
            onRerandomize={onRerandomize}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionTextStack({
  options, backgroundUrl, backgroundSeed, isUploading, questionText,
  onLabelChange, onUpload, onClear, onRerandomize, onTitleChange,
}: {
  options: QuizOption[]; backgroundUrl: string | null; backgroundSeed: string
  isUploading: boolean; questionText: string
  onLabelChange: (uuid: string, label: string) => void
  onUpload: (file: File, optionUuid: string, field: 'main' | 'info' | 'background') => void
  onClear: (optionUuid: string | null, field: 'main' | 'info' | 'background') => void
  onRerandomize: () => void
  onTitleChange: (text: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ position: 'relative', height: 420, borderRadius: 12, overflow: 'hidden', background: backgroundUrl ? '#000' : getGradient(backgroundSeed) }}>
      {backgroundUrl && <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
      {/* Corner buttons */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {backgroundUrl ? (
          <CornerBtn onClick={() => onClear(null, 'background')} title="Remove image"><X size={12} /></CornerBtn>
        ) : (
          <>
            <CornerBtn onClick={() => !isUploading && fileInputRef.current?.click()} isLoading={isUploading} title="Upload background">
              <Upload size={12} />
            </CornerBtn>
            <CornerBtn onClick={onRerandomize} title="Randomize gradient">
              <Dice6 size={12} />
            </CornerBtn>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f, '', 'background') }} />
          </>
        )}
      </div>
      {/* Content: title + options stack */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={questionText}
            placeholder="Question text…"
            onChange={e => onTitleChange(e.target.value)}
            style={OVERLAY_TITLE_STYLE}
          />
          {options.map((opt, idx) => (
            <input
              key={opt.option_uuid}
              value={opt.label}
              placeholder={`Option ${idx + 1}…`}
              onChange={e => onLabelChange(opt.option_uuid, e.target.value)}
              style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: 999, padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#111827', outline: 'none', lineHeight: 1.2, boxShadow: '0 10px 30px rgba(0,0,0,0.16)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ResponseCard({ opt, idx, optionCount, isUploading, imageUrl, onInfoChange, onUpload, onClear }: {
  opt: QuizOption; idx: number; optionCount: number; isUploading: boolean; imageUrl: string | null
  onInfoChange: (uuid: string, msg: string) => void
  onUpload: (file: File, optionUuid: string, field: 'main' | 'info' | 'background') => void
  onClear: (optionUuid: string | null, field: 'main' | 'info' | 'background') => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bg = getGradient(opt.gradient_seed)
  return (
    <div style={{ position: 'relative', height: '100%', background: imageUrl ? '#000' : bg, overflow: 'hidden' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 8, left: 10, zIndex: 5 }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.5)', maxWidth: 120, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {opt.label || `Option ${idx + 1}`}
        </span>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 44px 8px 10px' }}>
        <textarea value={opt.info_message} placeholder="Response shown after selection…" rows={2}
          onChange={e => onInfoChange(opt.option_uuid, e.target.value)}
          style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontWeight: 600, color: '#000', outline: 'none', lineHeight: 1.3, resize: 'none' }} />
      </div>
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

function ScoringCard({ opt, idx, vectors, optionScores, onScoreChange }: {
  opt: QuizOption; idx: number; vectors: ScoringVector[]
  optionScores: Record<string, Record<string, number>>
  onScoreChange: (optionUuid: string, vectorKey: string, value: number) => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 12px 12px' }}>
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
            const isBinary = vec.type === 'binary'
            return (
              <div key={vec.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
                {isBinary ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#374151', cursor: 'pointer', fontWeight: 700 }}>
                    <input type="checkbox" checked={val >= 0.5}
                      onChange={e => onScoreChange(opt.option_uuid, vec.key, e.target.checked ? 1 : 0)}
                      style={{ width: 14, height: 14, accentColor: ACCENT_COLOR }} />
                    <span>{vec.label || vec.key}</span>
                  </label>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ color: '#374151', fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{vec.label || vec.key}</span>
                      <span style={{ color: '#6b7280', fontSize: 10 }}>{val.toFixed(2)}</span>
                    </div>
                    <input type="range" min={vec.type === 'bidirectional' ? -1 : 0} max={1} step={0.05} value={val}
                      onChange={e => onScoreChange(opt.option_uuid, vec.key, parseFloat(e.target.value))}
                      style={{ width: '100%', height: 4, accentColor: ACCENT_COLOR, display: 'block' }} />
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
      {children}
    </button>
  )
}

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
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>(attrs.display_style === 'text' ? 'text' : 'image')
  const [optionCount, setOptionCount] = useState<number>(attrs.option_count || 2)
  const [options, setOptions] = useState<QuizOption[]>(() => {
    const existing: QuizOption[] = attrs.options || []
    const count = attrs.option_count || 2
    if (existing.length >= count) return existing.slice(0, count)
    return [...existing, ...Array.from({ length: count - existing.length }, makeDefaultOption)]
  })
  const [backgroundGradientSeed, setBackgroundGradientSeed] = useState<string>(
    attrs.background_gradient_seed || attrs.question_uuid || uuidv4()
  )
  const [backgroundImageFileId, setBackgroundImageFileId] = useState<string | null>(attrs.background_image_file_id || null)
  const [backgroundImageBlockObject, setBackgroundImageBlockObject] = useState<any | null>(attrs.background_image_block_object || null)
  const [showResponses, setShowResponses] = useState<boolean>(attrs.show_responses || false)
  const [activeTab, setActiveTab] = useState<Tab>('question')
  const [uploadingMap, setUploadingMap] = useState<Record<string, boolean>>({})

  const [optionScores, setOptionScores] = useState<Record<string, Record<string, number>>>(activity?.details?.option_scores || {})
  const [vectors, setVectors] = useState<ScoringVector[]>(getActiveScoringVectors(activity?.details))
  const scoringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.vectors) setVectors(detail.vectors)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  useEffect(() => {
    if (!showResponses && activeTab === 'response') setActiveTab('question')
  }, [showResponses, activeTab])

  const saveAttrs = useCallback((
    newOptions: QuizOption[], newCount: number, newText: string, newShowResponses: boolean,
    newDisplayStyle: DisplayStyle, newBackgroundSeed: string,
    newBackgroundImageFileId: string | null, newBackgroundImageBlockObject: any | null,
  ) => {
    props.updateAttributes({
      question_uuid: attrs.question_uuid || uuidv4(),
      question_text: newText,
      display_style: newDisplayStyle,
      option_count: newCount,
      options: newOptions,
      background_gradient_seed: newBackgroundSeed,
      background_image_file_id: newBackgroundImageFileId,
      background_image_block_object: newBackgroundImageBlockObject,
      show_responses: newShowResponses,
    })
  }, [props, attrs.question_uuid])

  const persistAttrs = useCallback((next: Partial<{
    options: QuizOption[]; optionCount: number; questionText: string; showResponses: boolean
    displayStyle: DisplayStyle; backgroundGradientSeed: string
    backgroundImageFileId: string | null; backgroundImageBlockObject: any | null
  }> = {}) => {
    saveAttrs(
      next.options ?? options, next.optionCount ?? optionCount, next.questionText ?? questionText,
      next.showResponses ?? showResponses, next.displayStyle ?? displayStyle,
      next.backgroundGradientSeed ?? backgroundGradientSeed,
      next.backgroundImageFileId ?? backgroundImageFileId,
      next.backgroundImageBlockObject ?? backgroundImageBlockObject,
    )
  }, [saveAttrs, options, optionCount, questionText, showResponses, displayStyle, backgroundGradientSeed, backgroundImageFileId, backgroundImageBlockObject])

  const saveScoring = useCallback((newScores: Record<string, Record<string, number>>) => {
    if (scoringSaveTimer.current) clearTimeout(scoringSaveTimer.current)
    scoringSaveTimer.current = setTimeout(async () => {
      try {
        await updateQuizScoring(activity?.activity_uuid, { scoring_vectors: vectors, option_scores: newScores }, access_token)
      } catch {}
    }, 800)
  }, [activity?.activity_uuid, vectors, access_token])

  const handleOptionCountChange = (count: number) => {
    let newOptions = [...options]
    if (count > options.length) {
      newOptions = [...newOptions, ...Array.from({ length: count - options.length }, makeDefaultOption)]
    } else {
      newOptions = newOptions.slice(0, count)
    }
    setOptionCount(count)
    setOptions(newOptions)
    persistAttrs({ options: newOptions, optionCount: count })
  }

  const handleDisplayStyleChange = (style: DisplayStyle) => {
    setDisplayStyle(style)
    persistAttrs({ displayStyle: style })
  }

  const handleLabelChange = (uuid: string, label: string) => {
    const newOpts = options.map(o => o.option_uuid === uuid ? { ...o, label } : o)
    setOptions(newOpts)
    persistAttrs({ options: newOpts })
  }

  const handleInfoChange = (uuid: string, info_message: string) => {
    const newOpts = options.map(o => o.option_uuid === uuid ? { ...o, info_message } : o)
    setOptions(newOpts)
    persistAttrs({ options: newOpts })
  }

  const handleToggleResponses = (val: boolean) => {
    setShowResponses(val)
    persistAttrs({ showResponses: val })
  }

  const handleQuestionTextChange = (text: string) => {
    setQuestionText(text)
    persistAttrs({ questionText: text })
  }

  const handleScoreChange = (optionUuid: string, vectorKey: string, value: number) => {
    const newScores = { ...optionScores, [optionUuid]: { ...(optionScores[optionUuid] || {}), [vectorKey]: value } }
    setOptionScores(newScores)
    saveScoring(newScores)
  }

  const handleRerandomizeBackground = () => {
    const newSeed = uuidv4()
    setBackgroundGradientSeed(newSeed)
    persistAttrs({ backgroundGradientSeed: newSeed })
  }

  const handleRerandomizeOptionGradient = (uuid: string) => {
    const newOpts = options.map(o => o.option_uuid === uuid ? { ...o, gradient_seed: uuidv4() } : o)
    setOptions(newOpts)
    persistAttrs({ options: newOpts })
  }

  const handleImageUpload = async (file: File, optionUuid: string, field: 'main' | 'info' | 'background') => {
    const key = field === 'background' ? 'background' : `${optionUuid}_${field}`
    setUploadingMap(m => ({ ...m, [key]: true }))
    try {
      const blockObj = await uploadNewImageFile(file, activity?.activity_uuid || '', access_token)
      if (field === 'background') {
        const nextFileId = blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null
        setBackgroundImageBlockObject(blockObj)
        setBackgroundImageFileId(nextFileId)
        persistAttrs({ backgroundImageBlockObject: blockObj, backgroundImageFileId: nextFileId })
        return
      }
      const newOpts = options.map(o => {
        if (o.option_uuid !== optionUuid) return o
        if (field === 'main') return { ...o, image_block_object: blockObj, image_file_id: blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null }
        return { ...o, info_image_block_object: blockObj, info_image_file_id: blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null }
      })
      setOptions(newOpts)
      persistAttrs({ options: newOpts })
    } finally {
      setUploadingMap(m => ({ ...m, [key]: false }))
    }
  }

  const handleImageClear = (optionUuid: string | null, field: 'main' | 'info' | 'background') => {
    if (field === 'background') {
      setBackgroundImageBlockObject(null)
      setBackgroundImageFileId(null)
      persistAttrs({ backgroundImageBlockObject: null, backgroundImageFileId: null })
      return
    }
    const newOpts = options.map(o => {
      if (o.option_uuid !== optionUuid) return o
      if (field === 'main') return { ...o, image_block_object: null, image_file_id: null }
      return { ...o, info_image_block_object: null, info_image_file_id: null }
    })
    setOptions(newOpts)
    persistAttrs({ options: newOpts })
  }

  const getImageUrl = (blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    return getActivityBlockMediaDirectory(
      org?.org_uuid, course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid, `${blockObj.content.file_id}.${blockObj.content.file_format}`, 'imageBlock'
    ) ?? null
  }

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const newAttrs = {
      ...nodeJSON.attrs,
      question_uuid: uuidv4(),
      background_gradient_seed: uuidv4(),
      options: (nodeJSON.attrs.options || []).map((o: any) => ({ ...o, option_uuid: uuidv4(), gradient_seed: uuidv4() })),
    }
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, { ...nodeJSON, attrs: newAttrs })
  }

  if (!isEditable) return null

  const gridStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: optionCount === 4 ? '1fr 1fr' : '1fr',
    gridTemplateRows: optionCount === 4 ? '1fr 1fr' : `repeat(${optionCount}, minmax(0, 1fr))`,
    gap: 4, borderRadius: 12, overflow: 'hidden', height: 420,
  }

  return (
    <NodeViewWrapper className="quiz-select-block my-4 w-full first:mt-0 last:mb-0">
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected
          ? '0 10px 26px rgba(124,58,237,0.16)'
          : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        {/* ── Header bar ── */}
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Type icon + label */}
          <ListChecks size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Multiple Choice</span>
          {/* Spacer */}
          <div style={{ flex: 1 }} />
          {/* Controls */}
          <select value={optionCount} onChange={e => handleOptionCountChange(parseInt(e.target.value, 10))}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}>
            <option value="2">2 options</option>
            <option value="3">3 options</option>
            <option value="4">4 options</option>
          </select>
          <select value={displayStyle} onChange={e => handleDisplayStyleChange(e.target.value as DisplayStyle)}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}>
            <option value="image">Image style</option>
            <option value="text">Text style</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showResponses} onChange={e => handleToggleResponses(e.target.checked)}
              style={{ accentColor: ACCENT_COLOR, width: 13, height: 13 }} />
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Responses</span>
          </label>
          <div style={{ width: 1, height: 16, background: '#ddd6fe', margin: '0 2px' }} />
          <button type="button" onClick={handleDuplicate} title="Duplicate question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#a78bfa' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Copy size={13} />
          </button>
          <button type="button" onClick={() => props.deleteNode()} title="Delete question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <Trash2 size={13} />
          </button>
        </div>

        {/* ── Tab strip ── */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 4px', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
          <TabBtn active={activeTab === 'question'} onClick={() => setActiveTab('question')}>Question</TabBtn>
          <TabBtn active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</TabBtn>
          {showResponses && <TabBtn active={activeTab === 'response'} onClick={() => setActiveTab('response')}>Response</TabBtn>}
        </div>

        {/* ── Content area ── */}
        <div style={{ padding: '12px', background: '#fff' }}>
          {activeTab === 'question' && (
            displayStyle === 'text' ? (
              <QuestionTextStack
                options={options}
                backgroundUrl={getImageUrl(backgroundImageBlockObject)}
                backgroundSeed={backgroundGradientSeed}
                isUploading={!!uploadingMap.background}
                questionText={questionText}
                onLabelChange={handleLabelChange}
                onUpload={handleImageUpload}
                onClear={handleImageClear}
                onRerandomize={handleRerandomizeBackground}
                onTitleChange={handleQuestionTextChange}
              />
            ) : (
              <QuestionImageGrid
                options={options}
                optionCount={optionCount}
                uploadingMap={uploadingMap}
                getImageUrl={getImageUrl}
                questionText={questionText}
                onLabelChange={handleLabelChange}
                onUpload={handleImageUpload}
                onClear={handleImageClear}
                onRerandomize={handleRerandomizeOptionGradient}
                onTitleChange={handleQuestionTextChange}
              />
            )
          )}

          {activeTab === 'scoring' && (
            <div style={gridStyle}>
              {options.map((opt, idx) => (
                <ScoringCard key={opt.option_uuid} opt={opt} idx={idx} vectors={vectors}
                  optionScores={optionScores} onScoreChange={handleScoreChange} />
              ))}
            </div>
          )}

          {activeTab === 'response' && showResponses && (
            <div style={gridStyle}>
              {options.map((opt, idx) => (
                <ResponseCard key={opt.option_uuid} opt={opt} idx={idx} optionCount={optionCount}
                  isUploading={!!uploadingMap[`${opt.option_uuid}_info`]}
                  imageUrl={getImageUrl(opt.info_image_block_object)}
                  onInfoChange={handleInfoChange} onUpload={handleImageUpload} onClear={handleImageClear} />
              ))}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default QuizSelectBlockComponent
