'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { AlignLeft, Trash2, Upload, Loader2, X, Copy, Dice6 } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updateQuizScoring } from '@services/quiz/quiz'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

type Tab = 'question' | 'scoring'
type InputSize = 'single_line' | 'short_answer' | 'open_ended'
type TextScoringMode = 'optional' | 'min_length'

interface TextScoringRule {
  mode: TextScoringMode
  min_chars: number
}

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

const HEADER_BG = '#d1fae5'
const HEADER_BORDER = '#a7f3d0'
const ACCENT_COLOR = '#059669'
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
      {children}
    </button>
  )
}

function QuizTextBlockComponent(props: any) {
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
  const [description, setDescription] = useState<string>(attrs.description || '')
  const [placeholder, setPlaceholder] = useState<string>(attrs.placeholder || '')
  const [inputSize, setInputSize] = useState<InputSize>(attrs.input_size || 'single_line')
  const [backgroundGradientSeed, setBackgroundGradientSeed] = useState<string>(attrs.background_gradient_seed || questionUuid || uuidv4())
  const [backgroundImageFileId, setBackgroundImageFileId] = useState<string | null>(attrs.background_image_file_id || null)
  const [backgroundImageBlockObject, setBackgroundImageBlockObject] = useState<any | null>(attrs.background_image_block_object || null)
  const [activeTab, setActiveTab] = useState<Tab>('question')
  const [vectors, setVectors] = useState<ScoringVector[]>(getActiveScoringVectors(activity?.details))
  const [textScores, setTextScores] = useState<Record<string, TextScoringRule>>(activity?.details?.text_scores || {})
  const scoringSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uploadingBackground, setUploadingBackground] = useState(false)

  const scoringRule = textScores[questionUuid] || { mode: 'optional', min_chars: 0 }
  const showMinChars = scoringRule.mode === 'min_length'
  const hasCorrectVector = vectors.some(vec => vec.key === 'correct')

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.vectors) setVectors(detail.vectors)
      if (detail?.textScores) setTextScores(detail.textScores)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  const persistAttrs = useCallback((next: Partial<{
    questionText: string; description: string; placeholder: string; inputSize: InputSize
    backgroundGradientSeed: string; backgroundImageFileId: string | null; backgroundImageBlockObject: any | null
  }> = {}) => {
    props.updateAttributes({
      question_uuid: questionUuid,
      question_text: next.questionText ?? questionText,
      description: next.description ?? description,
      placeholder: next.placeholder ?? placeholder,
      input_size: next.inputSize ?? inputSize,
      background_gradient_seed: next.backgroundGradientSeed ?? backgroundGradientSeed,
      background_image_file_id: next.backgroundImageFileId ?? backgroundImageFileId,
      background_image_block_object: next.backgroundImageBlockObject ?? backgroundImageBlockObject,
    })
  }, [props, questionUuid, questionText, description, placeholder, inputSize, backgroundGradientSeed, backgroundImageFileId, backgroundImageBlockObject])

  const saveScoring = useCallback((nextTextScores: Record<string, TextScoringRule>) => {
    if (scoringSaveTimer.current) clearTimeout(scoringSaveTimer.current)
    scoringSaveTimer.current = setTimeout(async () => {
      try {
        await updateQuizScoring(activity?.activity_uuid, { text_scores: nextTextScores }, access_token)
        window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', { detail: { textScores: nextTextScores } }))
      } catch {}
    }, 800)
  }, [activity?.activity_uuid, access_token])

  const updateScoringRule = (nextRule: TextScoringRule) => {
    const nextTextScores = { ...textScores, [questionUuid]: nextRule }
    setTextScores(nextTextScores)
    saveScoring(nextTextScores)
  }

  const getImageUrl = (blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    return getActivityBlockMediaDirectory(
      org?.org_uuid, course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid, `${blockObj.content.file_id}.${blockObj.content.file_format}`, 'imageBlock'
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
    const newSeed = uuidv4()
    setBackgroundGradientSeed(newSeed)
    persistAttrs({ backgroundGradientSeed: newSeed })
  }

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const newAttrs = { ...nodeJSON.attrs, question_uuid: uuidv4(), background_gradient_seed: uuidv4() }
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, { ...nodeJSON, attrs: newAttrs })
  }

  if (!isEditable) return null

  const backgroundUrl = getImageUrl(backgroundImageBlockObject)

  return (
    <NodeViewWrapper className="quiz-text-block my-4 w-full first:mt-0 last:mb-0">
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected
          ? '0 10px 26px rgba(5,150,105,0.16)'
          : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        {/* ── Header bar ── */}
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlignLeft size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Text Question</span>
          <div style={{ flex: 1 }} />
          <select value={inputSize}
            onChange={e => { const v = e.target.value as InputSize; setInputSize(v); persistAttrs({ inputSize: v }) }}
            style={{ fontSize: 11, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 6, padding: '2px 6px', background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer' }}>
            <option value="single_line">Single line</option>
            <option value="short_answer">Short answer</option>
            <option value="open_ended">Open ended</option>
          </select>
          <div style={{ width: 1, height: 16, background: '#a7f3d0', margin: '0 2px' }} />
          <button type="button" onClick={handleDuplicate} title="Duplicate question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6ee7b7' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#ecfdf5')}
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
        </div>

        {/* ── Content area ── */}
        <div style={{ padding: '12px', background: '#fff' }}>
          {activeTab === 'question' && (
            <div style={{ position: 'relative', height: 420, borderRadius: 12, overflow: 'hidden', background: backgroundUrl ? '#000' : getGradient(backgroundGradientSeed) }}>
              {backgroundUrl && <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
              {/* Corner buttons */}
              <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {backgroundUrl ? (
                  <button type="button" onClick={clearBackground} title="Remove image"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                    <X size={12} />
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => !uploadingBackground && backgroundInputRef.current?.click()} title="Upload background"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                      {uploadingBackground ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    </button>
                    <button type="button" onClick={handleRerandomizeGradient} title="Randomize gradient"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', color: '#fff' }}>
                      <Dice6 size={12} />
                    </button>
                    <input ref={backgroundInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleBackgroundUpload(file) }} />
                  </>
                )}
              </div>
              {/* Inputs inside gradient card */}
              <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    value={questionText}
                    placeholder="Question title…"
                    onChange={e => { setQuestionText(e.target.value); persistAttrs({ questionText: e.target.value }) }}
                    style={OVERLAY_TITLE_STYLE}
                  />
                  <textarea
                    value={description}
                    placeholder="Description (optional)…"
                    rows={2}
                    onChange={e => { setDescription(e.target.value); persistAttrs({ description: e.target.value }) }}
                    style={{ width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 18, padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', resize: 'none', lineHeight: 1.45, boxShadow: '0 14px 34px rgba(15,23,42,0.12)' }}
                  />
                  {inputSize === 'single_line' ? (
                    <input
                      value={placeholder}
                      placeholder="Placeholder text for learner's answer…"
                      onChange={e => { setPlaceholder(e.target.value); persistAttrs({ placeholder: e.target.value }) }}
                      style={{ width: '100%', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.95)', padding: '12px 16px', fontSize: 14, color: '#9ca3af', outline: 'none', lineHeight: 1.2 }}
                    />
                  ) : (
                    <textarea
                      value={placeholder}
                      placeholder="Placeholder text for learner's answer…"
                      rows={inputSize === 'short_answer' ? 3 : 5}
                      onChange={e => { setPlaceholder(e.target.value); persistAttrs({ placeholder: e.target.value }) }}
                      style={{ width: '100%', borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.95)', padding: '12px 16px', fontSize: 14, color: '#9ca3af', outline: 'none', resize: 'none', lineHeight: 1.4 }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4 min-h-[420px]">
              <div>
                <label className="text-xs text-neutral-400 font-medium block mb-1">Rule</label>
                <select value={scoringRule.mode}
                  onChange={e => updateScoringRule({ mode: e.target.value as TextScoringMode, min_chars: e.target.value === 'min_length' ? Math.max(1, scoringRule.min_chars || 10) : 0 })}
                  className="text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none bg-white text-neutral-700">
                  <option value="optional">Optional</option>
                  <option value="min_length">Minimum length</option>
                </select>
              </div>
              {showMinChars && (
                <div>
                  <label className="text-xs text-neutral-400 font-medium block mb-1">Min chars</label>
                  <input type="number" min={1} value={scoringRule.min_chars}
                    onChange={e => updateScoringRule({ mode: 'min_length', min_chars: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })}
                    className="w-32 text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400" />
                </div>
              )}
              <div className="rounded-xl bg-neutral-50 border border-neutral-100 p-3 space-y-1">
                <p className="text-xs font-semibold text-neutral-700">
                  {scoringRule.mode === 'optional'
                    ? 'This question is optional and does not affect grading.'
                    : `Responses with at least ${scoringRule.min_chars} characters are marked correct.`}
                </p>
                {!hasCorrectVector && (
                  <p className="text-xs text-neutral-400">This rule only affects the `Correct` vector, so it takes effect in graded quizzes.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export default QuizTextBlockComponent
