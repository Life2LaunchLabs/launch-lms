'use client'
import { NodeViewWrapper } from '@tiptap/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Copy, Dice6, Layers3, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updateQuizScoring } from '@services/quiz/quiz'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'

type Tab = 'question' | 'scoring'

interface MultiSelectOption {
  option_uuid: string
  label: string
}

interface MultiSelectCategory {
  category_uuid: string
  title: string
  options: MultiSelectOption[]
}

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

const HEADER_BG = '#fce7f3'
const ACCENT_COLOR = '#db2777'
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
  for (let i = 0; i < (seed || '').length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 80)) % 360
  return `linear-gradient(135deg, hsl(${h1},65%,55%), hsl(${h2},70%,45%))`
}

function getDefaultCorrectVector(): ScoringVector {
  return { key: 'correct', label: 'Correct', type: 'binary', low_label: 'False', high_label: 'True' }
}

function getActiveScoringVectors(details: any): ScoringVector[] {
  const quizMode = details?.quiz_mode === 'graded' ? 'graded' : details?.quiz_mode === 'ungraded' ? 'ungraded' : 'categories'
  if (quizMode === 'ungraded') return []
  if (quizMode === 'graded') {
    const gradedVectors = details?.graded_scoring_vectors || details?.scoring_vectors || []
    return gradedVectors.length > 0 ? gradedVectors : [getDefaultCorrectVector()]
  }
  return details?.category_scoring_vectors || details?.scoring_vectors || []
}

function getScoringPayload(
  quizMode: 'categories' | 'graded' | 'ungraded',
  vectors: ScoringVector[],
  optionScores: Record<string, Record<string, number>>,
  categoryVectors: ScoringVector[],
  gradedVectors: ScoringVector[]
) {
  return {
    scoring_vectors: quizMode === 'ungraded' ? [] : vectors,
    category_scoring_vectors: quizMode === 'categories' ? vectors : categoryVectors,
    graded_scoring_vectors: quizMode === 'graded' ? vectors : gradedVectors,
    option_scores: optionScores,
  }
}

function makeOption(label = ''): MultiSelectOption {
  return { option_uuid: uuidv4(), label }
}

function makeCategory(index: number): MultiSelectCategory {
  return {
    category_uuid: uuidv4(),
    title: `Category ${index + 1}`,
    options: [makeOption('Option 1'), makeOption('Option 2'), makeOption('Option 3')],
  }
}

function normalizeCategories(categories: MultiSelectCategory[] | undefined): MultiSelectCategory[] {
  const usable = Array.isArray(categories) ? categories : []
  if (usable.length > 0) {
    return usable.map((category, index) => ({
      category_uuid: category.category_uuid || uuidv4(),
      title: category.title || `Category ${index + 1}`,
      options: (category.options || []).map(option => ({
        option_uuid: option.option_uuid || uuidv4(),
        label: option.label || '',
      })),
    }))
  }
  return [makeCategory(0), makeCategory(1)]
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-0.5 rounded text-xs font-semibold outline-none transition-colors ${active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
      {children}
    </button>
  )
}

function ScoringCard({ option, vectors, optionScores, onScoreChange }: {
  option: MultiSelectOption
  vectors: ScoringVector[]
  optionScores: Record<string, Record<string, number>>
  onScoreChange: (optionUuid: string, vectorKey: string, value: number) => void
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 truncate text-xs font-extrabold text-neutral-700">{option.label || 'Untitled option'}</p>
      {vectors.length === 0 ? (
        <p className="text-[11px] text-neutral-400">No scoring dimensions. Add them in the Scoring tab.</p>
      ) : (
        <div className="space-y-2">
          {vectors.map(vec => {
            const val = optionScores[option.option_uuid]?.[vec.key] ?? 0
            const isBinary = vec.type === 'binary'
            return (
              <div key={vec.key} className="space-y-1">
                {isBinary ? (
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-neutral-700">
                    <input type="checkbox" checked={val >= 0.5} onChange={e => onScoreChange(option.option_uuid, vec.key, e.target.checked ? 1 : 0)} style={{ accentColor: ACCENT_COLOR }} />
                    {vec.label || vec.key}
                  </label>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[10px] font-bold text-neutral-700">{vec.label || vec.key}</span>
                      <span className="text-[10px] text-neutral-500">{val.toFixed(2)}</span>
                    </div>
                    <input type="range" min={vec.type === 'bidirectional' ? -1 : 0} max={1} step={0.05} value={val}
                      onChange={e => onScoreChange(option.option_uuid, vec.key, parseFloat(e.target.value))}
                      className="block h-1 w-full" style={{ accentColor: ACCENT_COLOR }} />
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

export default function QuizMultiSelectBlockComponent(props: any) {
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
  const [categories, setCategories] = useState<MultiSelectCategory[]>(() => normalizeCategories(attrs.categories))
  const [backgroundGradientSeed, setBackgroundGradientSeed] = useState<string>(attrs.background_gradient_seed || questionUuid || uuidv4())
  const [backgroundImageFileId, setBackgroundImageFileId] = useState<string | null>(attrs.background_image_file_id || null)
  const [backgroundImageBlockObject, setBackgroundImageBlockObject] = useState<any | null>(attrs.background_image_block_object || null)
  const [activeTab, setActiveTab] = useState<Tab>('question')
  const [quizMode, setQuizMode] = useState<'categories' | 'graded' | 'ungraded'>(
    activity?.details?.quiz_mode === 'graded' || activity?.details?.quiz_mode === 'ungraded' ? activity.details.quiz_mode : 'categories'
  )
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
      if (detail?.quizMode === 'graded' || detail?.quizMode === 'categories' || detail?.quizMode === 'ungraded') setQuizMode(detail.quizMode)
      if (detail?.categoryVectors) setCategoryVectors(detail.categoryVectors)
      if (detail?.gradedVectors) setGradedVectors(detail.gradedVectors)
      if (detail?.optionScores) setOptionScores(detail.optionScores)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  useEffect(() => {
    if (quizMode === 'ungraded' && activeTab === 'scoring') setActiveTab('question')
  }, [quizMode, activeTab])

  const persistAttrs = useCallback((next: Partial<{
    questionText: string
    categories: MultiSelectCategory[]
    backgroundGradientSeed: string
    backgroundImageFileId: string | null
    backgroundImageBlockObject: any | null
  }> = {}) => {
    props.updateAttributes({
      question_uuid: questionUuid,
      question_text: next.questionText ?? questionText,
      categories: next.categories ?? categories,
      background_gradient_seed: next.backgroundGradientSeed ?? backgroundGradientSeed,
      background_image_file_id: next.backgroundImageFileId ?? backgroundImageFileId,
      background_image_block_object: next.backgroundImageBlockObject ?? backgroundImageBlockObject,
    })
  }, [props, questionUuid, questionText, categories, backgroundGradientSeed, backgroundImageFileId, backgroundImageBlockObject])

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

  const updateCategories = (nextCategories: MultiSelectCategory[]) => {
    setCategories(nextCategories)
    persistAttrs({ categories: nextCategories })
  }

  const handleScoreChange = (optionUuid: string, vectorKey: string, value: number) => {
    const newScores = { ...optionScores, [optionUuid]: { ...(optionScores[optionUuid] || {}), [vectorKey]: value } }
    setOptionScores(newScores)
    saveScoring(newScores)
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

  const handleDuplicate = () => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
    if (pos === undefined) return
    const nodeJSON = props.node.toJSON()
    const newCategories = (nodeJSON.attrs.categories || []).map((category: MultiSelectCategory) => ({
      ...category,
      category_uuid: uuidv4(),
      options: (category.options || []).map(option => ({ ...option, option_uuid: uuidv4() })),
    }))
    const newAttrs = { ...nodeJSON.attrs, question_uuid: uuidv4(), background_gradient_seed: uuidv4(), categories: newCategories }
    props.editor.commands.insertContentAt(pos + props.node.nodeSize, { ...nodeJSON, attrs: newAttrs })
  }

  if (!isEditable) return null

  const backgroundUrl = getImageUrl(backgroundImageBlockObject)
  const allOptions = categories.flatMap(category => category.options)

  return (
    <NodeViewWrapper className="quiz-multi-select-block my-4 w-full first:mt-0 last:mb-0">
      <div style={{
        border: '1px solid rgba(255,255,255,0.78)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: props.selected ? '0 10px 26px rgba(219,39,119,0.16)' : '0 2px 10px rgba(0,0,0,0.07)',
        transition: 'box-shadow 0.15s ease',
      }}>
        <div style={{ background: HEADER_BG, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers3 size={14} style={{ color: ACCENT_COLOR, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>Multi Select</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={handleDuplicate} title="Duplicate question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f472b6' }}>
            <Copy size={13} />
          </button>
          <button type="button" onClick={() => props.deleteNode()} title="Delete question"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }}>
            <Trash2 size={13} />
          </button>
        </div>

        {quizMode !== 'ungraded' && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 12px 4px', background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
            <TabBtn active={activeTab === 'question'} onClick={() => setActiveTab('question')}>Question</TabBtn>
            <TabBtn active={activeTab === 'scoring'} onClick={() => setActiveTab('scoring')}>Scoring</TabBtn>
          </div>
        )}

        <div style={{ padding: 12, background: '#fff' }}>
          {activeTab === 'question' && (
            <div style={{ position: 'relative', minHeight: 480, borderRadius: 12, overflow: 'hidden', background: backgroundUrl ? '#000' : getGradient(backgroundGradientSeed) }}>
              {backgroundUrl && <img src={backgroundUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {backgroundUrl ? (
                  <button type="button" onClick={() => { setBackgroundImageBlockObject(null); setBackgroundImageFileId(null); persistAttrs({ backgroundImageBlockObject: null, backgroundImageFileId: null }) }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"><X size={12} /></button>
                ) : (
                  <>
                    <button type="button" onClick={() => !uploadingBackground && backgroundInputRef.current?.click()}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white">
                      {uploadingBackground ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    </button>
                    <button type="button" onClick={() => { const nextSeed = uuidv4(); setBackgroundGradientSeed(nextSeed); persistAttrs({ backgroundGradientSeed: nextSeed }) }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"><Dice6 size={12} /></button>
                    <input ref={backgroundInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) void handleBackgroundUpload(file) }} />
                  </>
                )}
              </div>
              <div style={{ position: 'relative', zIndex: 1, padding: '40px 24px' }}>
                <div className="mx-auto flex max-w-xl flex-col gap-4">
                  <input value={questionText} placeholder="Question text…" onChange={e => { setQuestionText(e.target.value); persistAttrs({ questionText: e.target.value }) }} style={OVERLAY_TITLE_STYLE} />
                  <div className="space-y-3">
                    {categories.map((category, categoryIdx) => (
                      <div key={category.category_uuid} className="space-y-2">
                        <div className="mb-2 flex items-center gap-2">
                          <input value={category.title} placeholder={`Category ${categoryIdx + 1}`} onChange={e => {
                            updateCategories(categories.map(item => item.category_uuid === category.category_uuid ? { ...item, title: e.target.value } : item))
                          }} style={{ ...OVERLAY_TITLE_STYLE, textAlign: 'left', borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(255,255,255,0.48)', background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none', padding: '0 0 8px', fontSize: 15, boxShadow: 'none' }} className="min-w-0 flex-1" />
                          <button type="button" onClick={() => updateCategories(categories.filter(item => item.category_uuid !== category.category_uuid))}
                            className="rounded-full bg-black/45 p-2 text-white hover:bg-black/60"><Trash2 size={13} /></button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {category.options.map((option, optionIdx) => (
                            <span key={option.option_uuid} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1">
                              <input value={option.label} placeholder={`Option ${optionIdx + 1}`} onChange={e => {
                                updateCategories(categories.map(item => item.category_uuid === category.category_uuid ? {
                                  ...item,
                                  options: item.options.map(opt => opt.option_uuid === option.option_uuid ? { ...opt, label: e.target.value } : opt),
                                } : item))
                              }} className="w-28 bg-transparent text-xs font-semibold text-neutral-700 outline-none" />
                              <button type="button" onClick={() => updateCategories(categories.map(item => item.category_uuid === category.category_uuid ? { ...item, options: item.options.filter(opt => opt.option_uuid !== option.option_uuid) } : item))}
                                className="text-neutral-400 hover:text-red-400"><X size={11} /></button>
                            </span>
                          ))}
                          <button type="button" onClick={() => updateCategories(categories.map(item => item.category_uuid === category.category_uuid ? { ...item, options: [...item.options, makeOption(`Option ${item.options.length + 1}`)] } : item))}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 bg-white/70 px-2.5 py-1 text-xs font-bold text-neutral-500">
                            <Plus size={11} /> Option
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => updateCategories([...categories, makeCategory(categories.length)])}
                      className="mx-auto inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur hover:bg-white/30">
                      <Plus size={12} /> Category
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && quizMode !== 'ungraded' && (
            <div className="grid min-h-[420px] gap-3 md:grid-cols-2">
              {allOptions.map(option => (
                <ScoringCard key={option.option_uuid} option={option} vectors={vectors} optionScores={optionScores} onScoreChange={handleScoreChange} />
              ))}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
