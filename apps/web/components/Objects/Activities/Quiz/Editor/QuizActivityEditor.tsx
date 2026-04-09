'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import { v4 as uuidv4 } from 'uuid'
import {
  ArrowLeft, Save, Eye, EyeOff, ListChecks, Info as InfoIcon,
  Plus, Trash2, Upload, X, Loader2, Type, AlignLeft, GripVertical, SlidersHorizontal, Layers3,
} from 'lucide-react'
import Link from 'next/link'
import { getUriWithOrg } from '@services/config/config'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext'
import { OrgProvider } from '@components/Contexts/OrgContext'
import QuizSelectBlock from '@components/Objects/Editor/Extensions/QuizSelect/QuizSelectBlock'
import QuizInfoBlock from '@components/Objects/Editor/Extensions/QuizInfo/QuizInfoBlock'
import QuizTextBlock from '@components/Objects/Editor/Extensions/QuizText/QuizTextBlock'
import QuizSliderBlock from '@components/Objects/Editor/Extensions/QuizSlider/QuizSliderBlock'
import QuizSortBlock from '@components/Objects/Editor/Extensions/QuizSort/QuizSortBlock'
import { CourseProvider } from '@components/Contexts/CourseContext'
import { updateActivity } from '@services/courses/activities'
import { updateQuizScoring, updateQuizResults, updateQuizSettings } from '@services/quiz/quiz'
import { uploadNewImageFile } from '@services/blocks/Image/images'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import toast from 'react-hot-toast'
import QuizActivityPlayer from '../Player/QuizActivityPlayer'
import QuizResultContentEditor from '../Results/QuizResultContentEditor'

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoringVector {
  key: string
  label: string
  type: 'unidirectional' | 'bidirectional' | 'binary'
  low_label: string
  high_label: string
}

type QuizMode = 'categories' | 'graded'

interface GradingRules {
  pass_percent: number
  max_attempts: number | null
}

interface QuizResultOption {
  uuid: string
  label: string
  title: string
  subtitle: string
  body: string
  var_overrides: Record<string, any> | null
  cover_image_file_id: string | null
  cover_image_block_object: any | null
  scores: Record<string, number>
}

type Tab = 'general' | 'content' | 'scoring' | 'results'

function getDefaultCorrectVector(): ScoringVector {
  return {
    key: 'correct',
    label: 'Correct',
    type: 'binary',
    low_label: 'False',
    high_label: 'True',
  }
}

function getDefaultGradedVectors(): ScoringVector[] {
  return [getDefaultCorrectVector()]
}

function ensureGradedVectors(vectors?: ScoringVector[] | null): ScoringVector[] {
  return vectors && vectors.length > 0 ? vectors : getDefaultGradedVectors()
}

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

interface EditorBlockInfo { type: string; attrs: any; pos: number; nodeSize: number }

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
  const [quizMode, setQuizMode] = useState<QuizMode>(details.quiz_mode === 'graded' ? 'graded' : 'categories')
  const [gradingRules, setGradingRules] = useState<GradingRules>({
    pass_percent: details.grading_rules?.pass_percent ?? 70,
    max_attempts: details.grading_rules?.max_attempts ?? null,
  })
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [categoryVectors, setCategoryVectors] = useState<ScoringVector[]>(details.category_scoring_vectors || (details.quiz_mode === 'categories' ? (details.scoring_vectors || []) : []))
  const [gradedVectors, setGradedVectors] = useState<ScoringVector[]>(
    ensureGradedVectors(details.graded_scoring_vectors || (details.quiz_mode === 'graded' ? details.scoring_vectors : undefined))
  )
  const [vectors, setVectors] = useState<ScoringVector[]>(
    details.quiz_mode === 'graded'
      ? ensureGradedVectors(details.graded_scoring_vectors || details.scoring_vectors)
      : (details.category_scoring_vectors || details.scoring_vectors || [])
  )
  const [optionScores, setOptionScores] = useState<Record<string, Record<string, number>>>(details.option_scores || {})
  const [textScores, setTextScores] = useState<Record<string, any>>(details.text_scores || {})
  const [scoringDirty, setScoringDirty] = useState(false)
  const [isSavingScoring, setIsSavingScoring] = useState(false)

  // ── Results state ─────────────────────────────────────────────────────
  const [resultOptions, setResultOptions] = useState<QuizResultOption[]>(details.result_options || [])
  const [resultsTemplate, setResultsTemplate] = useState<any>(details.results_template || null)
  const [selectedResultUuid, setSelectedResultUuid] = useState<string | null>(null)
  const [resultsDirty, setResultsDirty] = useState(false)
  const [isSavingResults, setIsSavingResults] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const selectedResult = resultOptions.find(r => r.uuid === selectedResultUuid) ?? null

  // ── Sidebar state ─────────────────────────────────────────────────────
  const [editorBlocks, setEditorBlocks] = useState<EditorBlockInfo[]>([])
  const [sidebarDragSrc, setSidebarDragSrc] = useState<number | null>(null)
  const [sidebarDragOver, setSidebarDragOver] = useState<number | null>(null)
  const suppressBlockExtraction = useRef(false)

  // ── Editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    editable: !previewMode,
    extensions: [
      Document,
      Text,
      QuizSelectBlock.configure({ activity }),
      QuizTextBlock.configure({ activity }),
      QuizSliderBlock.configure({ activity }),
      QuizSortBlock.configure({ activity }),
      QuizInfoBlock.configure({ activity }),
    ],
    content: activity.content && Object.keys(activity.content).length > 0
      ? activity.content
      : { type: 'doc', content: [] },
  })

  useEffect(() => { editor?.setEditable(!previewMode) }, [previewMode, editor])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.optionScores) setOptionScores(detail.optionScores)
      if (detail?.textScores) setTextScores(detail.textScores)
    }
    window.addEventListener('lh:quiz-scoring-updated', handler)
    return () => window.removeEventListener('lh:quiz-scoring-updated', handler)
  }, [])

  // ── Extract sidebar blocks ────────────────────────────────────────────
  const extractAndSetBlocks = useCallback((editorInstance: NonNullable<typeof editor>) => {
    const blocks: EditorBlockInfo[] = []
    editorInstance.state.doc.forEach((node, pos) => {
      if (['quizSelectBlock', 'quizTextBlock', 'quizSliderBlock', 'quizSortBlock', 'quizInfoBlock'].includes(node.type.name)) {
        blocks.push({ type: node.type.name, attrs: node.attrs, pos, nodeSize: node.nodeSize })
      }
    })
    setEditorBlocks(blocks)
  }, [])

  useEffect(() => {
    if (!editor) return
    const extractBlocks = () => {
      if (suppressBlockExtraction.current) return
      extractAndSetBlocks(editor)
    }
    extractAndSetBlocks(editor)
    editor.on('update', extractBlocks)
    return () => { editor.off('update', extractBlocks) }
  }, [editor, extractAndSetBlocks])

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
      const activeVectors = quizMode === 'graded' ? ensureGradedVectors(vectors) : vectors
      const nextCategoryVectors = quizMode === 'categories' ? vectors : categoryVectors
      const nextGradedVectors = quizMode === 'graded' ? ensureGradedVectors(vectors) : ensureGradedVectors(gradedVectors)
      await updateQuizScoring(
        activity.activity_uuid,
        {
          scoring_vectors: activeVectors,
          category_scoring_vectors: nextCategoryVectors,
          graded_scoring_vectors: nextGradedVectors,
        },
        access_token
      )
      if (quizMode === 'graded' && activeVectors !== vectors) {
        setVectors(activeVectors)
      }
      setGradedVectors(nextGradedVectors)
      window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', {
        detail: {
          vectors: activeVectors,
          quizMode,
          categoryVectors: nextCategoryVectors,
          gradedVectors: nextGradedVectors,
        },
      }))
      setScoringDirty(false)
    } catch {
      toast.error('Failed to save scoring')
    } finally {
      setIsSavingScoring(false)
    }
  }, [vectors, quizMode, categoryVectors, gradedVectors, activity.activity_uuid, access_token])

  // ── Results save ──────────────────────────────────────────────────────
  const saveResults = useCallback(async () => {
    setIsSavingResults(true)
    try {
      await updateQuizResults(activity.activity_uuid, {
        result_options: resultOptions,
        results_template: resultsTemplate,
      }, access_token)
      setResultsDirty(false)
    } catch {
      toast.error('Failed to save results')
    } finally {
      setIsSavingResults(false)
    }
  }, [resultOptions, resultsTemplate, activity.activity_uuid, access_token])

  const saveCurrentTab = useCallback(async () => {
    if (activeTab === 'scoring' && scoringDirty) {
      await saveScoring()
      return
    }
    if (activeTab === 'results' && resultsDirty) {
      await saveResults()
      return
    }
    await save(true)
  }, [activeTab, scoringDirty, resultsDirty, saveScoring, saveResults, save])

  // ── Content update from editor ────────────────────────────────────────
  const handleContentUpdate = useCallback((newTemplate: any, newOverrides: Record<string, any>) => {
    setResultsTemplate(newTemplate)
    if (selectedResultUuid) {
      setResultOptions(prev => prev.map(r =>
        r.uuid === selectedResultUuid ? { ...r, var_overrides: newOverrides } : r
      ))
    }
    setResultsDirty(true)
  }, [selectedResultUuid])

  const saveSettings = useCallback(async (nextMode: QuizMode, nextRules: GradingRules) => {
    setIsSavingSettings(true)
    try {
      await updateQuizSettings(
        activity.activity_uuid,
        { quiz_mode: nextMode, grading_rules: nextRules },
        access_token
      )
    } catch {
      toast.error('Failed to save quiz settings')
    } finally {
      setIsSavingSettings(false)
    }
  }, [activity.activity_uuid, access_token])

  // Auto-save on tab change
  const handleTabChange = useCallback(async (newTab: Tab) => {
    if (activeTab === 'scoring' && scoringDirty) await saveScoring()
    if (activeTab === 'results' && resultsDirty) await saveResults()
    setActiveTab(newTab)
  }, [activeTab, scoringDirty, resultsDirty, saveScoring, saveResults])

  useEffect(() => {
    if (quizMode === 'graded' && (activeTab === 'scoring' || activeTab === 'results')) {
      setActiveTab('general')
    }
  }, [quizMode, activeTab])

  // ── Sidebar helpers ───────────────────────────────────────────────────
  const scrollToBlock = (idx: number) => {
    const allBlocks = document.querySelectorAll('.quiz-select-block, .quiz-text-block, .quiz-slider-block, .quiz-sort-block, .quiz-info-block')
    const el = allBlocks[idx] as HTMLElement | undefined
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reorderBlocks = useCallback((fromIdx: number, toIdx: number) => {
    if (!editor || fromIdx === toIdx) return

    // Collect all top-level nodes with their positions
    const nodes: { node: any; from: number; to: number }[] = []
    editor.state.doc.forEach((node, offset) => {
      nodes.push({ node, from: offset, to: offset + node.nodeSize })
    })
    if (fromIdx >= nodes.length || toIdx >= nodes.length) return

    const src = nodes[fromIdx]
    const srcJSON = src.node.toJSON()

    // Suppress the update listener during the two-dispatch sequence so the
    // sidebar never sees the intermediate state (one node deleted, not yet re-inserted).
    suppressBlockExtraction.current = true

    // Step 1: delete the source node — destroys its React node view so the
    // component at the destination mounts fresh with the correct attrs.
    const tr1 = editor.view.state.tr.delete(src.from, src.to)
    editor.view.dispatch(tr1)

    // Step 2: insert into the updated state at the correct destination
    const newState = editor.view.state
    const newNodes: { node: any; from: number; to: number }[] = []
    newState.doc.forEach((node, offset) => {
      newNodes.push({ node, from: offset, to: offset + node.nodeSize })
    })

    // After deletion the target index may have shifted
    const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
    let insertPos: number
    if (adjustedToIdx >= newNodes.length) {
      insertPos = newState.doc.content.size
    } else if (fromIdx > toIdx) {
      // Moving up: insert before the target
      insertPos = newNodes[adjustedToIdx].from
    } else {
      // Moving down: insert after the target
      insertPos = newNodes[adjustedToIdx].to
    }

    const tr2 = newState.tr.insert(insertPos, newState.schema.nodeFromJSON(srcJSON))
    editor.view.dispatch(tr2)

    // Re-enable listener and sync sidebar from the final settled state
    suppressBlockExtraction.current = false
    extractAndSetBlocks(editor)
  }, [editor, extractAndSetBlocks])

  const getSidebarBlockInfo = (block: EditorBlockInfo) => {
    switch (block.type) {
      case 'quizSelectBlock': {
        const opts = (block.attrs.options || []) as any[]
        return {
          iconType: 'listchecks' as const,
          color: '#7c3aed',
          title: block.attrs.question_text || 'Multiple choice',
          preview: opts.map((o: any) => o.label || '—').filter(Boolean).join(' / '),
        }
      }
      case 'quizTextBlock':
        return {
          iconType: 'alignleft' as const,
          color: '#059669',
          title: block.attrs.question_text || 'Text question',
          preview: block.attrs.description || block.attrs.placeholder || '',
        }
      case 'quizSliderBlock': {
        const sliders = (block.attrs.sliders || []) as any[]
        return {
          iconType: 'sliders' as const,
          color: '#d97706',
          title: block.attrs.question_text || 'Rating question',
          preview: sliders.map((slider: any) => slider.label || '—').filter(Boolean).join(' / '),
        }
      }
      case 'quizSortBlock': {
        const cards = (block.attrs.cards || []) as any[]
        const categories = (block.attrs.categories || []) as any[]
        return {
          iconType: 'layers3' as const,
          color: '#0284c7',
          title: block.attrs.question_text || 'Sort question',
          preview: `${cards.length} cards · ${categories.map((category: any) => category.label || '—').join(' / ')}`,
        }
      }
      case 'quizInfoBlock':
        return {
          iconType: 'info' as const,
          color: '#3b82f6',
          title: block.attrs.title || 'Info slide',
          preview: block.attrs.body || '',
        }
      default:
        return { iconType: null as null, color: '#6b7280', title: 'Block', preview: '' }
    }
  }

  // ── Block insertion ───────────────────────────────────────────────────
  const insertSelectBlock = (optionCount: 2 | 3 | 4) => {
    if (!editor) return
    const questionUuid = uuidv4()
    const backgroundSeed = uuidv4()
    const options = Array.from({ length: optionCount }, () => ({
      option_uuid: uuidv4(), label: '', image_file_id: null, image_block_object: null,
      gradient_seed: uuidv4(), info_message: '', info_image_file_id: null,
      info_image_block_object: null, show_info_expanded: false,
    }))
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizSelectBlock',
      attrs: {
        question_uuid: questionUuid,
        question_text: '',
        display_style: 'image',
        option_count: optionCount,
        options,
        background_gradient_seed: backgroundSeed,
        background_image_file_id: null,
        background_image_block_object: null,
      },
    }).run()
  }

  const insertInfoBlock = () => {
    if (!editor) return
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizInfoBlock',
      attrs: { slide_uuid: uuidv4(), gradient_seed: uuidv4(), title: '', body: '', image_block_object: null, image_file_id: null },
    }).run()
  }

  const insertTextBlock = () => {
    if (!editor) return
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizTextBlock',
      attrs: {
        question_uuid: uuidv4(),
        question_text: '',
        description: '',
        placeholder: '',
        input_size: 'single_line',
        background_gradient_seed: uuidv4(),
        background_image_file_id: null,
        background_image_block_object: null,
      },
    }).run()
  }

  const insertSliderBlock = () => {
    if (!editor) return
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizSliderBlock',
      attrs: {
        question_uuid: uuidv4(),
        question_text: '',
        slider_count: 1,
        direction_mode: 'stars',
        label_mode: 'none',
        number_max: 5,
        left_axis_label: '',
        right_axis_label: '',
        sliders: Array.from({ length: 1 }, () => ({ slider_uuid: uuidv4(), label: '' })),
        background_gradient_seed: uuidv4(),
        background_image_file_id: null,
        background_image_block_object: null,
      },
    }).run()
  }

  const insertSortBlock = () => {
    if (!editor) return
    editor.chain().insertContentAt(editor.state.doc.content.size, {
      type: 'quizSortBlock',
      attrs: {
        question_uuid: uuidv4(),
        question_text: '',
        cards: Array.from({ length: 3 }, (_, idx) => ({ card_uuid: uuidv4(), title: `Card ${idx + 1}`, description: '' })),
        categories: [
          { category_uuid: uuidv4(), label: 'Thumbs down', color: '#dc2626', icon: 'thumbs_down', position: 'left' },
          { category_uuid: uuidv4(), label: 'Thumbs up', color: '#16a34a', icon: 'thumbs_up', position: 'right' },
        ],
        background_gradient_seed: uuidv4(),
        background_image_file_id: null,
        background_image_block_object: null,
      },
    }).run()
  }

  const handleQuizModeChange = async (nextMode: QuizMode) => {
    const nextCategoryVectors = quizMode === 'categories' ? vectors : categoryVectors
    const nextGradedVectors = ensureGradedVectors(
      quizMode === 'graded' ? vectors : gradedVectors
    )
    setCategoryVectors(nextCategoryVectors)
    setGradedVectors(nextGradedVectors)
    setQuizMode(nextMode)
    const activeVectors = nextMode === 'graded'
      ? ensureGradedVectors(nextGradedVectors)
      : nextCategoryVectors
    setVectors(activeVectors)
    setScoringDirty(false)
    window.dispatchEvent(new CustomEvent('lh:quiz-scoring-updated', {
      detail: {
        vectors: activeVectors,
        quizMode: nextMode,
        categoryVectors: nextCategoryVectors,
        gradedVectors: nextGradedVectors,
      },
    }))
    try {
      await updateQuizScoring(
        activity.activity_uuid,
        {
          scoring_vectors: activeVectors,
          category_scoring_vectors: nextCategoryVectors,
          graded_scoring_vectors: nextGradedVectors,
        },
        access_token
      )
    } catch {
      toast.error('Failed to switch quiz scoring mode')
    }
    await saveSettings(nextMode, gradingRules)
  }

  const handlePassPercentChange = async (value: number) => {
    const nextRules = { ...gradingRules, pass_percent: value }
    setGradingRules(nextRules)
    await saveSettings(quizMode, nextRules)
  }

  const handleRetakeLimitChange = async (value: string) => {
    const trimmed = value.trim()
    const nextRules = {
      ...gradingRules,
      max_attempts: trimmed === '' ? null : Math.max(1, parseInt(trimmed, 10) || 1),
    }
    setGradingRules(nextRules)
    await saveSettings(quizMode, nextRules)
  }

  // ── Scoring helpers ───────────────────────────────────────────────────
  const addVector = () => {
    setVectors(v => {
      const newVector: ScoringVector = {
        key: `dim_${uuidv4().slice(0, 6)}`,
        label: '',
        type: 'unidirectional',
        low_label: 'Low',
        high_label: 'High',
      }
      const next = [...v, newVector]
      if (quizMode === 'categories') setCategoryVectors(next)
      else setGradedVectors(next)
      return next
    })
    setScoringDirty(true)
  }
  const updateVector = (idx: number, field: keyof ScoringVector, value: string) => {
    setVectors(v => {
      const next = v.map((vec, i) => i === idx ? { ...vec, [field]: value } : vec)
      if (quizMode === 'categories') setCategoryVectors(next)
      else setGradedVectors(next)
      return next
    })
    setScoringDirty(true)
  }
  const removeVector = (idx: number) => {
    setVectors(v => {
      const next = v.filter((_, i) => i !== idx)
      if (quizMode === 'categories') setCategoryVectors(next)
      else setGradedVectors(next)
      return next
    })
    setScoringDirty(true)
  }

  // ── Results helpers ───────────────────────────────────────────────────
  const addResultOption = () => {
    const newOpt: QuizResultOption = { uuid: uuidv4(), label: 'New result', title: '', subtitle: '', body: '', var_overrides: null, cover_image_file_id: null, cover_image_block_object: null, scores: {} }
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

  const handleSelectResultOption = useCallback(async (uuid: string) => {
    if (uuid === selectedResultUuid) return
    if (resultsDirty) {
      await saveResults()
    }
    setSelectedResultUuid(uuid)
  }, [selectedResultUuid, resultsDirty, saveResults])

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
        <div className="flex flex-col h-screen bg-gray-50">

          {/* ── Top bar ── */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-white/95 backdrop-blur sticky top-0 z-30 nice-shadow">
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
            <button type="button" onClick={() => void saveCurrentTab()} disabled={isSaving || isSavingScoring || isSavingResults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white text-xs font-medium outline-none transition-colors disabled:opacity-60">
              <Save size={13} />
              {(isSaving || isSavingScoring || isSavingResults) ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* ── Tab strip ── */}
          {!previewMode && (
            <div className="flex space-x-2 px-6 border-b border-neutral-100 bg-white/95 backdrop-blur sticky top-[41px] z-20 shadow-md shadow-gray-300/20">
              <TabBtn active={activeTab === 'general'} onClick={() => handleTabChange('general')} icon={<InfoIcon size={16} />} label="General" />
              <TabBtn active={activeTab === 'content'} onClick={() => handleTabChange('content')} icon={<ListChecks size={16} />} label="Content" />
              {quizMode !== 'graded' && (
                <TabBtn active={activeTab === 'scoring'} onClick={() => handleTabChange('scoring')} icon={<Save size={16} />} label="Scoring" />
              )}
              {quizMode !== 'graded' && (
                <TabBtn active={activeTab === 'results'} onClick={() => handleTabChange('results')} icon={<Eye size={16} />} label="Results" />
              )}
            </div>
          )}

          {/* ── Body ── */}
          <div className="flex-1 overflow-auto bg-[#f4f5f7]">

            {/* Preview */}
            {previewMode && (
              <QuizActivityPlayer
                activity={{
                  ...activity,
                  name: quizName,
                  details: {
                    ...details,
                    quiz_mode: quizMode,
                    grading_rules: gradingRules,
                    scoring_vectors: vectors,
                    category_scoring_vectors: categoryVectors,
                    graded_scoring_vectors: gradedVectors,
                    option_scores: optionScores,
                    text_scores: textScores,
                    result_options: resultOptions,
                    results_template: resultsTemplate,
                  },
                }}
                editorPreviewContent={editor?.getJSON()}
                onClose={() => setPreviewMode(false)}
              />
            )}

            {/* ── General ── */}
            {!previewMode && activeTab === 'general' && (
              <div className="max-w-xl mx-auto py-10 px-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Quiz name</label>
                  <input value={quizName} onChange={e => setQuizName(e.target.value)} onBlur={() => save(false)} placeholder="Enter quiz name…"
                    className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Type</label>
                  <select
                    value={quizMode}
                    onChange={e => void handleQuizModeChange(e.target.value as QuizMode)}
                    className="w-full text-neutral-800 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400 transition-colors"
                  >
                    <option value="categories">Categories</option>
                    <option value="graded">Graded</option>
                  </select>
                  <p className="text-xs text-neutral-400 mt-1.5">
                    {quizMode === 'graded'
                      ? 'Graded quizzes lock scoring to the Correct binary vector and use pass/fail results.'
                      : 'Category quizzes use custom scoring vectors and result cards.'}
                  </p>
                </div>
                {quizMode === 'graded' && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Grading Rules</p>
                      <p className="text-xs text-emerald-700/80 mt-1">This quiz uses the built-in Correct vector and is configured entirely from this screen.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-emerald-800 mb-1">Pass percent</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={gradingRules.pass_percent}
                          onChange={e => setGradingRules(prev => ({ ...prev, pass_percent: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10) || 0)) }))}
                          onBlur={e => void handlePassPercentChange(Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10) || 0)))}
                          className="w-full text-sm font-semibold border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-emerald-800 mb-1">Retake limit</label>
                        <input
                          type="number"
                          min={1}
                          placeholder="Unlimited"
                          value={gradingRules.max_attempts ?? ''}
                          onChange={e => setGradingRules(prev => ({ ...prev, max_attempts: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                          onBlur={e => void handleRetakeLimitChange(e.target.value)}
                          className="w-full text-sm font-semibold border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-emerald-700/80">
                      {isSavingSettings ? 'Saving settings…' : 'Leave retake limit blank for unlimited attempts.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Content ── */}
            {!previewMode && activeTab === 'content' && (
              <div className="min-h-full">
                <div className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/92 backdrop-blur-xl shadow-md shadow-gray-300/20">
                  <div className="px-4 sm:px-6 py-3">
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400 mr-1">Add question</span>
                      <button type="button" onClick={() => insertSelectBlock(2)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium outline-none transition-colors"><ListChecks size={13} /> Multiple choice</button>
                      <button type="button" onClick={insertTextBlock} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium outline-none transition-colors"><Type size={13} /> Text question</button>
                      <button type="button" onClick={insertSliderBlock} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-medium outline-none transition-colors"><SlidersHorizontal size={13} /> Rating</button>
                      <button type="button" onClick={insertSortBlock} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-medium outline-none transition-colors"><Layers3 size={13} /> Sort</button>
                      <button type="button" onClick={insertInfoBlock} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium outline-none transition-colors"><InfoIcon size={13} /> Info slide</button>
                    </div>
                  </div>
                </div>

                <div className="mx-auto flex w-full max-w-7xl items-start gap-6 px-4 py-6 sm:px-6">

                  {/* ── Left sidebar ── */}
                  <div
                    className="hidden lg:block w-[224px] shrink-0 sticky top-[84px] self-start rounded-2xl border border-neutral-200/70 bg-white/92 backdrop-blur p-3 nice-shadow overflow-y-auto"
                    style={{ maxHeight: 'calc(100dvh - 108px)', boxSizing: 'border-box' }}
                  >
                    <div className="px-1 pb-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">Blocks</p>
                    </div>
                    {editorBlocks.length === 0 ? (
                      <div style={{ padding: '24px 12px', textAlign: 'center', color: '#d1d5db', fontSize: 12 }}>
                        No blocks yet
                      </div>
                    ) : (
                      <div style={{ padding: '4px 0' }}>
                        {editorBlocks.map((block, idx) => {
                          const info = getSidebarBlockInfo(block)
                          const isDragOver = sidebarDragOver === idx
                          return (
                            <div key={block.attrs.question_uuid || block.attrs.slide_uuid || `${block.pos}-${idx}`} style={{ display: 'flex', alignItems: 'stretch' }}>
                              <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}>
                                {idx + 1}
                              </div>
                              <div
                                draggable
                                onClick={() => scrollToBlock(idx)}
                                onDragStart={e => {
                                  setSidebarDragSrc(idx)
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragOver={e => { e.preventDefault(); setSidebarDragOver(idx) }}
                                onDragLeave={() => setSidebarDragOver(current => current === idx ? null : current)}
                                onDrop={e => {
                                  e.preventDefault()
                                  if (sidebarDragSrc !== null) reorderBlocks(sidebarDragSrc, idx)
                                  setSidebarDragSrc(null)
                                  setSidebarDragOver(null)
                                }}
                                onDragEnd={() => {
                                  setSidebarDragSrc(null)
                                  setSidebarDragOver(null)
                                }}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  maxWidth: '100%',
                                  margin: '2px 0 2px 2px',
                                  padding: '8px 10px',
                                  borderRadius: 12,
                                  cursor: 'pointer',
                                  background: isDragOver ? '#f3f4f6' : sidebarDragSrc === idx ? '#f9fafb' : '#fff',
                                  border: `1px solid ${isDragOver ? '#e5e7eb' : '#f3f4f6'}`,
                                  opacity: sidebarDragSrc === idx ? 0.5 : 1,
                                  transition: 'all 0.1s ease',
                                  userSelect: 'none',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2,
                                  boxShadow: '0 8px 20px rgba(15,23,42,0.05)',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <GripVertical size={9} style={{ color: '#d1d5db', flexShrink: 0 }} />
                                  <span style={{ color: info.color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    {info.iconType === 'listchecks' && <ListChecks size={11} />}
                                    {info.iconType === 'alignleft' && <AlignLeft size={11} />}
                                    {info.iconType === 'sliders' && <SlidersHorizontal size={11} />}
                                    {info.iconType === 'layers3' && <Layers3 size={11} />}
                                    {info.iconType === 'info' && <InfoIcon size={11} />}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: info.title ? '#374151' : '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, maxWidth: '100%' }}>
                                    {info.title || 'Untitled'}
                                  </span>
                                </div>
                                {info.preview && (
                                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 13, minWidth: 0, maxWidth: '100%' }}>
                                    {info.preview}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Main content area ── */}
                  <div className="flex-1 min-w-0">
                    <div className="max-w-3xl mx-auto space-y-4">
                      {editor && <EditorContent editor={editor} className="quiz-editor-content outline-none" />}
                      {editor && editor.isEmpty && (
                        <div className="text-center py-16 text-neutral-300 select-none">
                          <p className="text-sm">Use the toolbar above to add questions and info slides.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Scoring ── */}
            {!previewMode && activeTab === 'scoring' && quizMode !== 'graded' && (
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
                            <option value="binary">True / False</option>
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
                  {quizMode === 'graded' ? (
                    <>
                      <div className="p-4 border-b border-neutral-100 space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Scoring Rules</p>
                        <p className="text-xs text-neutral-500">These settings drive pass/fail results and attempt limits.</p>
                      </div>
                      <div className="flex-1 p-4 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Min percent to pass</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={gradingRules.pass_percent}
                            onChange={e => setGradingRules(prev => ({ ...prev, pass_percent: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10) || 0)) }))}
                            onBlur={e => void handlePassPercentChange(Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10) || 0)))}
                            className="w-full text-sm font-semibold border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Retakes allowed</label>
                          <input
                            type="number"
                            min={1}
                            placeholder="Unlimited"
                            value={gradingRules.max_attempts ?? ''}
                            onChange={e => setGradingRules(prev => ({ ...prev, max_attempts: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            onBlur={e => void handleRetakeLimitChange(e.target.value)}
                            className="w-full text-sm font-semibold border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400"
                          />
                          <p className="text-[11px] text-neutral-400 mt-1.5">Blank means learners can retry as many times as they want.</p>
                        </div>
                        <div className="rounded-xl bg-neutral-50 border border-neutral-100 p-3 space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Locked Vector</p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-neutral-700">Correct</span>
                            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">Binary</span>
                          </div>
                        </div>
                        <p className="text-xs text-neutral-400">{isSavingSettings ? 'Saving rules…' : 'Learners complete this activity by passing the quiz, not by clicking next.'}</p>
                      </div>
                    </>
                  ) : (
                    <>
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
                          <button key={opt.uuid} type="button" onClick={() => void handleSelectResultOption(opt.uuid)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors outline-none ${selectedResultUuid === opt.uuid ? 'bg-violet-50 text-violet-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                            {opt.label || 'Untitled result'}
                          </button>
                        ))}
                      </div>
                      {vectors.length > 0 && selectedResult && (
                        <div className="border-t border-neutral-100 p-3 space-y-2">
                          <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Scoring</p>
                          {vectors.map(vec => {
                            const val = selectedResult.scores?.[vec.key] ?? 0
                            return (
                              <div key={vec.key} className="space-y-1">
                                <div className="flex justify-between items-baseline">
                                  <span className="text-xs font-semibold text-neutral-600 truncate max-w-[60%]">{vec.label || vec.key}</span>
                                  <span className="text-xs text-neutral-400">{vec.type === 'binary' ? (val >= 0.5 ? 'True' : 'False') : val.toFixed(2)}</span>
                                </div>
                                {vec.type === 'binary' ? (
                                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                                    <input
                                      type="checkbox"
                                      checked={val >= 0.5}
                                      onChange={e => updateResult(selectedResult.uuid, 'scores', {
                                        ...selectedResult.scores,
                                        [vec.key]: e.target.checked ? 1 : 0,
                                      })}
                                      className="accent-violet-600 w-4 h-4"
                                    />
                                    Match this result to the vector
                                  </label>
                                ) : (
                                  <>
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
                                  </>
                                )}
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
                    </>
                  )}
                </div>

                {/* Right: result detail editor */}
                <div className="flex-1 overflow-auto">
                  {quizMode === 'graded' ? (
                    <div className="flex items-center justify-center h-full text-neutral-300 select-none">
                      <div className="text-center space-y-2">
                        <p className="text-sm font-medium text-neutral-400">Graded results layout coming next.</p>
                        <p className="text-xs text-neutral-300">This space is reserved for future pass/fail messaging content.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-2xl mx-auto py-8 px-8 space-y-6">

                      {/* Per-result fields — only when a result is selected */}
                      {selectedResult ? (
                        <>
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

                          {/* Subtitle */}
                          <div>
                            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Subtitle</label>
                            <input
                              value={selectedResult.subtitle ?? ''}
                              placeholder="Short line above the title…"
                              onChange={e => updateResult(selectedResult.uuid, 'subtitle', e.target.value)}
                              className="w-full text-neutral-700 bg-white border border-neutral-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors"
                            />
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
                        </>
                      ) : (
                        <p className="text-xs text-neutral-400 italic">Select a result option on the left to edit its cover, title, and per-result content.</p>
                      )}

                      {/* Content editor — always visible */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Content</label>
                        <p className="text-[11px] text-neutral-400 mb-3">
                          <span className="font-semibold text-neutral-500">Fixed</span> blocks (lock icon) are shared across all results.{' '}
                          <span className="font-semibold text-neutral-500">Variable</span> blocks change per result.
                        </p>
                        <div className="border border-neutral-200 rounded-xl p-4 bg-white">
                          <QuizResultContentEditor
                            key={`${selectedResultUuid || 'none'}:${JSON.stringify(selectedResult?.scores || {})}:${vectors.map(v => v.key).join(',')}`}
                            resultUuid={selectedResultUuid}
                            template={resultsTemplate}
                            varOverrides={selectedResult?.var_overrides ?? null}
                            activity={activity}
                            vectors={vectors}
                            scores={selectedResult?.scores ?? {}}
                            onUpdate={handleContentUpdate}
                          />
                        </div>
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
