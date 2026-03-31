'use client'
import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { X, Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { updateQuizScoring, updateQuizCategories } from '@services/quiz/quiz'
import toast from 'react-hot-toast'

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional'
  low_label: string
  high_label: string
}

interface ResultCategory {
  uuid: string
  title: string
  description: string
  image_file_id: string | null
  scores: Record<string, number>
}

interface CategorySet {
  key: string
  label: string
  categories: ResultCategory[]
}

interface Props {
  activity: any
  editor: any
  onClose: () => void
}

export default function QuizScoringPanel({ activity, editor, onClose }: Props) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const details = activity.details || {}

  const [vectors, setVectors] = useState<ScoringVector[]>(details.scoring_vectors || [])
  const [categorySets, setCategorySets] = useState<CategorySet[]>(details.category_sets || [])
  const [isSaving, setIsSaving] = useState(false)
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({})

  const addVector = () => {
    setVectors(v => [
      ...v,
      { key: `dim_${uuidv4().slice(0, 6)}`, label: '', type: 'unidirectional', low_label: 'Low', high_label: 'High' },
    ])
  }

  const updateVector = (idx: number, field: keyof ScoringVector, value: string) => {
    setVectors(v => v.map((vec, i) => i === idx ? { ...vec, [field]: value } : vec))
  }

  const removeVector = (idx: number) => {
    setVectors(v => v.filter((_, i) => i !== idx))
  }

  const addCategorySet = () => {
    const key = `set_${uuidv4().slice(0, 6)}`
    setCategorySets(cs => [...cs, { key, label: '', categories: [] }])
    setExpandedSets(e => ({ ...e, [key]: true }))
  }

  const updateSetLabel = (setKey: string, label: string) => {
    setCategorySets(cs => cs.map(s => s.key === setKey ? { ...s, label } : s))
  }

  const removeSet = (setKey: string) => {
    setCategorySets(cs => cs.filter(s => s.key !== setKey))
  }

  const addCategory = (setKey: string) => {
    setCategorySets(cs =>
      cs.map(s =>
        s.key === setKey
          ? {
              ...s,
              categories: [
                ...s.categories,
                { uuid: uuidv4(), title: '', description: '', image_file_id: null, scores: {} },
              ],
            }
          : s
      )
    )
  }

  const updateCategory = (setKey: string, catUuid: string, field: keyof ResultCategory, value: any) => {
    setCategorySets(cs =>
      cs.map(s =>
        s.key === setKey
          ? {
              ...s,
              categories: s.categories.map(c =>
                c.uuid === catUuid ? { ...c, [field]: value } : c
              ),
            }
          : s
      )
    )
  }

  const setCategoryScore = (setKey: string, catUuid: string, vectorKey: string, value: number) => {
    setCategorySets(cs =>
      cs.map(s =>
        s.key === setKey
          ? {
              ...s,
              categories: s.categories.map(c =>
                c.uuid === catUuid
                  ? { ...c, scores: { ...c.scores, [vectorKey]: value } }
                  : c
              ),
            }
          : s
      )
    )
  }

  const removeCategory = (setKey: string, catUuid: string) => {
    setCategorySets(cs =>
      cs.map(s =>
        s.key === setKey
          ? { ...s, categories: s.categories.filter(c => c.uuid !== catUuid) }
          : s
      )
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateQuizScoring(activity.activity_uuid, { scoring_vectors: vectors, option_scores: details.option_scores || {} }, access_token)
      await updateQuizCategories(activity.activity_uuid, { category_sets: categorySets }, access_token)
      window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', { detail: { vectors } }))
      toast.success('Scoring & results saved')
    } catch {
      toast.error('Failed to save scoring')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-96 border-l border-neutral-100 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <span className="text-sm font-semibold text-neutral-700">Scoring & Results</span>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-neutral-100 outline-none transition-colors">
          <X size={14} className="text-neutral-500" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {/* ── Scoring Vectors ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Scoring Dimensions</h3>
            <button type="button" onClick={addVector} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 outline-none">
              <Plus size={12} /> Add
            </button>
          </div>
          {vectors.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No dimensions yet. Add one to enable scoring.</p>
          )}
          {vectors.map((vec, idx) => (
            <div key={idx} className="bg-neutral-50 rounded-lg p-3 mb-2 space-y-2 border border-neutral-100">
              <div className="flex items-center gap-2">
                <input
                  value={vec.label}
                  placeholder="Dimension label (e.g. Extraversion)"
                  onChange={e => updateVector(idx, 'label', e.target.value)}
                  className="flex-1 text-xs border border-neutral-200 rounded-md px-2 py-1.5 outline-none focus:border-violet-400"
                />
                <button type="button" onClick={() => removeVector(idx)} className="p-1 hover:bg-red-50 rounded outline-none transition-colors">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={vec.low_label}
                  placeholder="Low label"
                  onChange={e => updateVector(idx, 'low_label', e.target.value)}
                  className="flex-1 text-xs border border-neutral-200 rounded-md px-2 py-1 outline-none focus:border-violet-400"
                />
                <input
                  value={vec.high_label}
                  placeholder="High label"
                  onChange={e => updateVector(idx, 'high_label', e.target.value)}
                  className="flex-1 text-xs border border-neutral-200 rounded-md px-2 py-1 outline-none focus:border-violet-400"
                />
              </div>
              <select
                value={vec.type}
                onChange={e => updateVector(idx, 'type', e.target.value as any)}
                className="text-xs border border-neutral-200 rounded-md px-2 py-1 outline-none bg-white"
              >
                <option value="unidirectional">Unidirectional (0 → 1)</option>
                <option value="bidirectional">Bidirectional (−1 → 1)</option>
              </select>
            </div>
          ))}
        </section>

        {/* ── Result Categories ────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Result Categories</h3>
            <button type="button" onClick={addCategorySet} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 outline-none">
              <Plus size={12} /> Add set
            </button>
          </div>
          {categorySets.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No result categories yet. Add a set to show personalised results.</p>
          )}
          {categorySets.map(catSet => (
            <div key={catSet.key} className="bg-neutral-50 rounded-lg border border-neutral-100 mb-3 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100">
                <input
                  value={catSet.label}
                  placeholder="Category set name (e.g. Personality Type)"
                  onChange={e => updateSetLabel(catSet.key, e.target.value)}
                  className="flex-1 text-xs font-semibold border-0 outline-none bg-transparent text-neutral-700 placeholder:text-neutral-300"
                />
                <button
                  type="button"
                  onClick={() => setExpandedSets(e => ({ ...e, [catSet.key]: !e[catSet.key] }))}
                  className="p-1 hover:bg-neutral-200 rounded outline-none"
                >
                  {expandedSets[catSet.key] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <button type="button" onClick={() => removeSet(catSet.key)} className="p-1 hover:bg-red-50 rounded outline-none">
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>

              {expandedSets[catSet.key] && (
                <div className="p-3 space-y-2">
                  {catSet.categories.map(cat => (
                    <div key={cat.uuid} className="bg-white rounded-lg p-2.5 border border-neutral-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={cat.title}
                          placeholder="Category name"
                          onChange={e => updateCategory(catSet.key, cat.uuid, 'title', e.target.value)}
                          className="flex-1 text-xs font-semibold border border-neutral-200 rounded-md px-2 py-1 outline-none focus:border-amber-400"
                        />
                        <button type="button" onClick={() => removeCategory(catSet.key, cat.uuid)} className="p-1 hover:bg-red-50 rounded outline-none">
                          <Trash2 size={11} className="text-red-400" />
                        </button>
                      </div>
                      <textarea
                        value={cat.description}
                        placeholder="Description shown on results page"
                        rows={2}
                        onChange={e => updateCategory(catSet.key, cat.uuid, 'description', e.target.value)}
                        className="w-full text-xs border border-neutral-200 rounded-md px-2 py-1 outline-none focus:border-amber-400 resize-none"
                      />
                      {/* Target scores for this category */}
                      {vectors.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-neutral-400 font-medium">Target scores (for matching)</p>
                          {vectors.map(vec => (
                            <div key={vec.key} className="flex items-center gap-2">
                              <span className="text-xs text-neutral-500 w-20 truncate">{vec.label || vec.key}</span>
                              <input
                                type="range"
                                min={vec.type === 'bidirectional' ? -1 : 0}
                                max={1}
                                step={0.05}
                                value={cat.scores?.[vec.key] ?? 0.5}
                                onChange={e => setCategoryScore(catSet.key, cat.uuid, vec.key, parseFloat(e.target.value))}
                                className="flex-1 h-1.5 accent-amber-500"
                              />
                              <span className="text-xs text-neutral-500 w-8 text-right">
                                {(cat.scores?.[vec.key] ?? 0.5).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addCategory(catSet.key)}
                    className="w-full flex items-center justify-center gap-1 h-8 border-2 border-dashed border-neutral-200 rounded-lg text-xs text-neutral-500 hover:border-amber-300 hover:text-amber-600 transition-colors outline-none"
                  >
                    <Plus size={11} /> Add category
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {/* Footer save */}
      <div className="px-4 py-3 border-t border-neutral-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-xs font-medium outline-none transition-colors disabled:opacity-60"
        >
          <Save size={12} />
          {isSaving ? 'Saving…' : 'Save scoring & results'}
        </button>
      </div>
    </div>
  )
}
