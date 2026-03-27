'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import { v4 as uuidv4 } from 'uuid'
import {
  ArrowLeft, Save, Eye, EyeOff, ListChecks, Info as InfoIcon,
  Plus, Trash2, Upload, X, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { getUriWithOrg } from '@services/config/config'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext'
import { OrgProvider } from '@components/Contexts/OrgContext'
import QuizSelectBlock from '@components/Objects/Editor/Extensions/QuizSelect/QuizSelectBlock'
import QuizInfoBlock from '@components/Objects/Editor/Extensions/QuizInfo/QuizInfoBlock'
import { CourseProvider } from '@components/Contexts/CourseContext'
import { updateActivity } from '@services/courses/activities'
import { updateQuizScoring, updateQuizResults } from '@services/quiz/quiz'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import toast from 'react-hot-toast'
import QuizActivityPlayer from '../Player/QuizActivityPlayer'

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional'
  low_label: string
  high_label: string
}

interface QuizResultOption {
  uuid: string
  label: string
  title: string
  body: string
  cover_image_file_id: string | null
  cover_image_block_object: any | null
  scores: Record<string, number>
}

type Tab = 'general' | 'content' | 'scoring' | 'results'

interface QuizActivityEditorProps {
  activity: any
  course: any
  org: any
}

// ── Tab button (assignment-editor style) ─────────────────────────────────────

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <div
      onClick={onClick}
      className={`flex space-x-4 py-2 w-fit text-center border-black transition-all ease-linear ${active ? 'border-b-4' : 'opacity-50'} cursor-pointer`}
    >
      <div className="flex items-center space-x-2.5 mx-2">
        {icon}
        <div className="text-sm font-semibold">{label}</div>
      </div>
    </div>
  )
}

// ── Main editor ────────────────────────────────────────────────────────────

export default function QuizActivityEditor({ activity, course, org }: QuizActivityEditorProps) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const [activeTab, setActiveTab] = useState<Tab>('content')
  const [previewMode, setPreviewMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [quizName, setQuizName] = useState<string>(activity.name || '')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Scoring state ─────────────────────────────────────────────────────
  const details = activity.details || {}
  const [vectors, setVectors] = useState<ScoringVector[]>(details.scoring_vectors || [])
  const [scoringDirty, setScoringDirty] = useState(false)
  const [isSavingScoring, setIsSavingScoring] = useState(false)

  // ── Results state ─────────────────────────────────────────────────────
  const [resultOptions, setResultOptions] = useState<QuizResultOption[]>(details.result_options || [])
  const [selectedResultUuid, setSelectedResultUuid] = useState<string | null>(null)
  const [resultsDirty, setResultsDirty] = useState(false)
  const [isSavingResults, setIsSavingResults] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const selectedResult = resultOptions.find(r => r.uuid === selectedResultUuid) ?? null

  // ── Editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    editable: !previewMode,
    extensions: [
      Document,
      Text,
      QuizSelectBlock.configure({ activity }),
      QuizInfoBlock.configure({ activity }),
    ],
    content: activity.content && Object.keys(activity.content).length > 0
      ? activity.content
      : { type: 'doc', content: [] },
  })

  useEffect(() => { editor?.setEditable(!previewMode) }, [previewMode, editor])

  // ── Content save ──────────────────────────────────────────────────────
  const save = useCallback(async (showToast = true) => {
    if (!editor) return
    setIsSaving(true)
    try {
      await updateActivity({ content: editor.getJSON(), name: quizName }, activity.activity_uuid, access_token)
      if (showToast) toast.success('Quiz saved')
    } catch {
      toast.error('Failed to save quiz')
    } finally {
      setIsSaving(false)
    }
  }, [editor, quizName, activity.activity_uuid, access_token])

  useEffect(() => {
    if (!editor) return
    const handler = () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => save(false), 2000)
    }
    editor.on('update', handler)
    return () => { editor.off('update', handler); if (saveTimeout.current) clearTimeout(saveTimeout.current) }
  }, [editor, save])

  // ── Scoring save ──────────────────────────────────────────────────────
  const saveScoring = useCallback(async () => {
    setIsSavingScoring(true)
    try {
      await updateQuizScoring(activity.activity_uuid, { scoring_vectors: vectors, option_scores: details.option_scores || {} }, access_token)
      window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', { detail: { vectors } }))
      setScoringDirty(false)
    } catch {
      toast.error('Failed to save scoring')
    } finally {
      setIsSavingScoring(false)
    }
  }, [vectors, activity.activity_uuid, details.option_scores, access_token])

  // ── Results save ──────────────────────────────────────────────────────
  const saveResults = useCallback(async () => {
    setIsSavingResults(true)
    try {
      await updateQuizResults(activity.activity_uuid, { result_options: resultOptions }, access_token)
      setResultsDirty(false)
    } catch {
      toast.error('Failed to save results')
    } finally {
      setIsSavingResults(false)
    }
  }, [resultOptions, activity.activity_uuid, access_token])

  // Auto-save on tab change
  const handleTabChange = useCallback(async (newTab: Tab) => {
    if (activeTab === 'scoring' && scoringDirty) await saveScoring()
    if (activeTab === 'results' && resultsDirty) await saveResults()
    setActiveTab(newTab)
  }, [activeTab, scoringDirty, resultsDirty, saveScoring, saveResults])

  // ── Block insertion ───────────────────────────────────────────────────
  const insertSelectBlock = (optionCount: 2 | 3 | 4) => {
    if (!editor) return
    const questionUuid = uuidv4()
    const options = Array.from({ length: optionCount }, () => ({
      option_uuid: uuidv4(), label: '', image_file_id: null, image_block_object: null,
      gradient_seed: uuidv4(), info_message: '', info_image_file_id: null,
      info_image_block_object: null, show_info_expanded: false,
    }))
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizSelectBlock',
      attrs: { question_uuid: questionUuid, question_text: '', option_count: optionCount, options },
    }).run()
  }

  const insertInfoBlock = () => {
    if (!editor) return
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizInfoBlock',
      attrs: { slide_uuid: uuidv4(), gradient_seed: uuidv4(), title: '', body: '', image_block_object: null, image_file_id: null },
    }).run()
  }

  // ── Scoring helpers ───────────────────────────────────────────────────
  const addVector = () => { setVectors(v => [...v, { key: `dim_${uuidv4().slice(0, 6)}`, label: '', type: 'unidirectional', low_label: 'Low', high_label: 'High' }]); setScoringDirty(true) }
  const updateVector = (idx: number, field: keyof ScoringVector, value: string) => { setVectors(v => v.map((vec, i) => i === idx ? { ...vec, [field]: value } : vec)); setScoringDirty(true) }
  const removeVector = (idx: number) => { setVectors(v => v.filter((_, i) => i !== idx)); setScoringDirty(true) }

  // ── Results helpers ───────────────────────────────────────────────────
  const addResultOption = () => {
    const newOpt: QuizResultOption = { uuid: uuidv4(), label: 'New result', title: '', body: '', cover_image_file_id: null, cover_image_block_object: null, scores: {} }
    const updated = [...resultOptions, newOpt]
    setResultOptions(updated)
    setSelectedResultUuid(newOpt.uuid)
    setResultsDirty(true)
  }

  const updateResult = (uuid: string, field: keyof QuizResultOption, value: any) => {
    setResultOptions(prev => prev.map(r => r.uuid === uuid ? { ...r, [field]: value } : r))
    setResultsDirty(true)
  }

  const removeResult = (uuid: string) => {
    setResultOptions(prev => prev.filter(r => r.uuid !== uuid))
    if (selectedResultUuid === uuid) setSelectedResultUuid(null)
    setResultsDirty(true)
  }

  const handleCoverUpload = async (file: File) => {
    if (!selectedResultUuid) return
    setCoverUploading(true)
    try {
      const blockObj = await uploadNewImageFile(file, activity.activity_uuid, access_token)
      updateResult(selectedResultUuid, 'cover_image_block_object', blockObj)
      updateResult(selectedResultUuid, 'cover_image_file_id', blockObj?.content?.file_id ? `${blockObj.content.file_id}.${blockObj.content.file_format}` : null)
    } finally {
      setCoverUploading(false)
    }
  }

  const handleCoverClear = () => {
    if (!selectedResultUuid) return
    updateResult(selectedResultUuid, 'cover_image_block_object', null)
    updateResult(selectedResultUuid, 'cover_image_file_id', null)
  }

  const getCoverUrl = (blockObj: any): string | null => {
    if (!blockObj?.content?.file_id) return null
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.course_uuid,
      blockObj.content.activity_uuid || activity.activity_uuid,
      blockObj.block_uuid,
      `${blockObj.content.file_id}.${blockObj.content.file_format}`,
      'imageBlock'
    ) ?? null
  }

  const cleanCourseId = course?.course_uuid?.replace('course_', '')
  const backUrl = getUriWithOrg(org?.slug || '', '') + `/course/${cleanCourseId}`

  return (
    <OrgProvider orgslug={org?.slug || ''}>
    <CourseProvider courseuuid={course?.course_uuid}>
      <EditorOptionsProvider options={{ isEditable: !previewMode }}>
        <div className="flex flex-col h-screen bg-white">

          {/* ── Top bar ── */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-white sticky top-0 z-30">
            <Link href={backUrl} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-500 outline-none" title="Back to course">
              <ArrowLeft size={16} />
            </Link>
            <div className="w-px h-5 bg-neutral-200 mx-1" />
            <span className="text-sm font-semibold text-neutral-700 truncate max-w-48">{quizName || activity.name}</span>
            <div className="flex-1" />
            <button type="button" onClick={() => setPreviewMode(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium outline-none transition-colors ${previewMode ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'}`}>
              {previewMode ? <EyeOff size={13} /> : <Eye size={13} />}
              {previewMode ? 'Exit preview' : 'Preview'}
            </button>
            <button type="button" onClick={() => save(true)} disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-xs font-medium outline-none transition-colors disabled:opacity-60">
              <Save size={13} />
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* ── Tab strip ── */}
          {!previewMode && (
            <div className="flex space-x-2 px-6 border-b border-neutral-100 bg-white sticky top-[41px] z-20">
              <TabBtn active={activeTab === 'general'} onClick={() => handleTabChange('general')} icon={<InfoIcon size={16} />} label="General" />
              <TabBtn active={activeTab === 'content'} onClick={() => handleTabChange('content')} icon={<ListChecks size={16} />} label="Content" />
              <TabBtn active={activeTab === 'scoring'} onClick={() => handleTabChange('scoring')} icon={<Save size={16} />} label="Scoring" />
              <TabBtn active={activeTab === 'results'} onClick={() => handleTabChange('results')} icon={<Eye size={16} />} label="Results" />
            </div>
          )}

          {/* ── Body ── */}
          <div className="flex-1 overflow-auto">

            {/* Preview */}
            {previewMode && (
              <QuizActivityPlayer activity={activity} editorPreviewContent={editor?.getJSON()} onClose={() => setPreviewMode(false)} />
            )}

            {/* ── General ── */}
            {!previewMode && activeTab === 'general' && (
              <div className="max-w-xl mx-auto py-10 px-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Quiz name</label>
                  <input value={quizName} onChange={e => setQuizName(e.target.value)} onBlur={() => save(false)} placeholder="Enter quiz name…"
                    className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400 transition-colors" />
                </div>
              </div>
            )}

            {/* ── Content ── */}
            {!previewMode && activeTab === 'content' && (
              <div className="relative">
                <div className="sticky top-0 z-10 flex items-center gap-1.5 px-6 py-2 bg-white/90 backdrop-blur border-b border-neutral-100">
                  <span className="text-xs text-neutral-400 mr-1">Add:</span>
                  <button type="button" onClick={() => insertSelectBlock(2)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium outline-none transition-colors"><ListChecks size={13} /> 2-opt</button>
                  <button type="button" onClick={() => insertSelectBlock(3)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium outline-none transition-colors"><ListChecks size={13} /> 3-opt</button>
                  <button type="button" onClick={() => insertSelectBlock(4)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium outline-none transition-colors"><ListChecks size={13} /> 4-opt</button>
                  <button type="button" onClick={insertInfoBlock} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium outline-none transition-colors"><InfoIcon size={13} /> Info slide</button>
                </div>
                <div className="max-w-2xl mx-auto py-8 px-6 space-y-4">
                  {editor && <EditorContent editor={editor} className="quiz-editor-content outline-none" />}
                  {editor && editor.isEmpty && (
                    <div className="text-center py-16 text-neutral-300 select-none">
                      <p className="text-sm">Use the toolbar above to add questions and info slides.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Scoring ── */}
            {!previewMode && activeTab === 'scoring' && (
              <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Scoring Dimensions</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">Define the axes each answer contributes to.</p>
                  </div>
                  <button type="button" onClick={addVector} className="flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-700 outline-none">
                    <Plus size={13} /> Add dimension
                  </button>
                </div>
                {vectors.length === 0 && <p className="text-xs text-neutral-400 italic">No dimensions yet.</p>}
                <div className="space-y-2">
                  {vectors.map((vec, idx) => (
                    <div key={idx} className="bg-neutral-50 rounded-xl p-4 border border-neutral-100 space-y-3">
                      <div className="flex items-center gap-2">
                        <input value={vec.label} placeholder="Dimension label (e.g. Extraversion)" onChange={e => updateVector(idx, 'label', e.target.value)}
                          className="flex-1 text-sm font-semibold border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400" />
                        <button type="button" onClick={() => removeVector(idx)} className="p-1.5 hover:bg-red-50 rounded-lg outline-none">
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-neutral-400 font-medium block mb-1">Low end label</label>
                          <input value={vec.low_label} placeholder="e.g. Introvert" onChange={e => updateVector(idx, 'low_label', e.target.value)}
                            className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-neutral-400 font-medium block mb-1">High end label</label>
                          <input value={vec.high_label} placeholder="e.g. Extravert" onChange={e => updateVector(idx, 'high_label', e.target.value)}
                            className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1.5 outline-none focus:border-violet-400" />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="text-xs text-neutral-400 font-medium block mb-1">Type</label>
                          <select value={vec.type} onChange={e => updateVector(idx, 'type', e.target.value as any)}
                            className="text-xs border border-neutral-200 rounded-lg px-2 py-1.5 outline-none bg-white">
                            <option value="unidirectional">0 → 1</option>
                            <option value="bidirectional">−1 → 1</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={saveScoring} disabled={isSavingScoring}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-xs font-medium outline-none transition-colors disabled:opacity-60">
                  <Save size={13} />
                  {isSavingScoring ? 'Saving…' : scoringDirty ? 'Save scoring' : 'Scoring saved'}
                </button>
              </div>
            )}

            {/* ── Results ── */}
            {!previewMode && activeTab === 'results' && (
              <div className="flex h-full" style={{ minHeight: 'calc(100vh - 90px)' }}>

                {/* Left: sticky selector panel */}
                <div className="w-64 flex-shrink-0 border-r border-neutral-100 flex flex-col" style={{ position: 'sticky', top: 0, height: 'calc(100vh - 90px)', overflowY: 'auto' }}>
                  <div className="p-4 border-b border-neutral-100">
                    <button type="button" onClick={addResultOption}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold outline-none transition-colors">
                      <Plus size={13} /> Add option
                    </button>
                  </div>
                  <div className="flex-1 p-2 space-y-1">
                    {resultOptions.length === 0 && (
                      <p className="text-xs text-neutral-400 italic px-2 py-3">No results yet. Add one above.</p>
                    )}
                    {resultOptions.map(opt => (
                      <button key={opt.uuid} type="button" onClick={() => setSelectedResultUuid(opt.uuid)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors outline-none ${selectedResultUuid === opt.uuid ? 'bg-violet-50 text-violet-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                        {opt.label || 'Untitled result'}
                      </button>
                    ))}
                  </div>
                  {/* Scoring section — bottom of panel */}
                  {vectors.length > 0 && selectedResult && (
                    <div className="border-t border-neutral-100 p-3 space-y-2">
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Scoring</p>
                      {vectors.map(vec => {
                        const val = selectedResult.scores?.[vec.key] ?? 0
                        return (
                          <div key={vec.key} className="space-y-1">
                            <div className="flex justify-between items-baseline">
                              <span className="text-xs font-semibold text-neutral-600 truncate max-w-[60%]">{vec.label || vec.key}</span>
                              <span className="text-xs text-neutral-400">{val.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={vec.type === 'bidirectional' ? -1 : 0}
                              max={1}
                              step={0.05}
                              value={val}
                              onChange={e => updateResult(selectedResult.uuid, 'scores', {
                                ...selectedResult.scores,
                                [vec.key]: parseFloat(e.target.value),
                              })}
                              className="w-full h-1.5 accent-violet-500"
                            />
                            <div className="flex justify-between">
                              <span className="text-[10px] text-neutral-300">{vec.low_label || 'Low'}</span>
                              <span className="text-[10px] text-neutral-300">{vec.high_label || 'High'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {resultsDirty && (
                    <div className="p-3 border-t border-neutral-100">
                      <button type="button" onClick={saveResults} disabled={isSavingResults}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-xs font-medium outline-none transition-colors disabled:opacity-60">
                        <Save size={12} />
                        {isSavingResults ? 'Saving…' : 'Save results'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: result detail editor */}
                <div className="flex-1 overflow-auto">
                  {!selectedResult ? (
                    <div className="flex items-center justify-center h-full text-neutral-300 select-none">
                      <p className="text-sm">Select a result option to edit it.</p>
                    </div>
                  ) : (
                    <div className="max-w-2xl mx-auto py-8 px-8 space-y-6">

                      {/* Label + delete row */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Result label</label>
                          <input
                            value={selectedResult.label}
                            placeholder="Short label shown in selector…"
                            onChange={e => updateResult(selectedResult.uuid, 'label', e.target.value)}
                            className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400 transition-colors"
                          />
                        </div>
                        <button type="button" onClick={() => removeResult(selectedResult.uuid)}
                          className="mt-5 p-2 hover:bg-red-50 rounded-lg outline-none transition-colors flex-shrink-0">
                          <Trash2 size={15} className="text-red-400" />
                        </button>
                      </div>

                      {/* Cover image */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Cover image</label>
                        {(() => {
                          const coverUrl = getCoverUrl(selectedResult.cover_image_block_object)
                          return coverUrl ? (
                            <div className="relative w-full h-52 rounded-xl overflow-hidden group">
                              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                              <button type="button" onClick={handleCoverClear}
                                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity outline-none">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div onClick={() => !coverUploading && coverInputRef.current?.click()}
                              className="w-full h-52 border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-neutral-300 hover:bg-neutral-50 transition-colors">
                              {coverUploading ? <Loader2 size={20} className="animate-spin text-neutral-400" /> : (
                                <>
                                  <Upload size={18} className="text-neutral-300 mb-2" />
                                  <span className="text-xs text-neutral-400">Upload cover image</span>
                                </>
                              )}
                              <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f) }} />
                            </div>
                          )
                        })()}
                      </div>

                      {/* Title */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Title</label>
                        <input
                          value={selectedResult.title}
                          placeholder="Result title shown to learner…"
                          onChange={e => updateResult(selectedResult.uuid, 'title', e.target.value)}
                          className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-base font-bold outline-none focus:border-violet-400 transition-colors"
                        />
                      </div>

                      {/* Body */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Body text</label>
                        <textarea
                          value={selectedResult.body}
                          placeholder="Description of this result…"
                          rows={5}
                          onChange={e => updateResult(selectedResult.uuid, 'body', e.target.value)}
                          className="w-full text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors resize-none"
                        />
                      </div>

                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </EditorOptionsProvider>
    </CourseProvider>
    </OrgProvider>
  )
}
