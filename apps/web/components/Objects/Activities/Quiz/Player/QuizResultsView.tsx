'use client'
import React from 'react'
import { Trophy, CheckCircle2, XCircle, BarChart3, RotateCcw, Star, Heart, Flame, Leaf, Zap, Sun, Flag, Triangle, Square, ThumbsUp, ThumbsDown, EyeOff, Edit3, Check } from 'lucide-react'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import QuizResultContentRenderer from '../Results/QuizResultContentRenderer'

const SLIDER_BLUE = '#2563eb'
const SLIDER_RED = '#dc2626'

function getGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < (seed || '').length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 50 + (Math.abs(hash >> 8) % 60)) % 360
  return `linear-gradient(135deg, hsl(${h1},60%,55%), hsl(${h2},65%,45%))`
}

interface Props {
  result: any
  activity: any
  org: any
  course: any
  onRetake: () => void
  showRetakeButton?: boolean
  sectionedContent?: boolean
  hiddenQuestionUuids?: string[]
  onToggleQuestionHidden?: (questionUuid: string) => void
  editableUngradedTabLabels?: boolean
  onSaveUngradedTabLabel?: (questionUuid: string, label: string) => void | Promise<void>
  isSavingUngradedTabLabel?: boolean
  publicMode?: boolean
}

function findQuestionNode(nodes: any[] = [], questionUuid: string): any | null {
  for (const node of nodes) {
    if (node?.attrs?.question_uuid === questionUuid) return node
    if (Array.isArray(node?.content)) {
      const match = findQuestionNode(node.content, questionUuid)
      if (match) return match
    }
  }
  return null
}

function getCategoryDisplayLabel(category: any): string {
  if (!category) return 'Unsorted'
  const label = category.label || category.title || category.name
  if (typeof label === 'string' && label.trim()) return label
  if (typeof category.icon === 'string' && category.icon.trim()) {
    return category.icon
      .split('_')
      .filter(Boolean)
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  if (typeof category.position === 'string' && category.position.trim()) {
    return `${category.position.charAt(0).toUpperCase()}${category.position.slice(1)} tray`
  }
  return 'Sorted'
}

function renderSortIcon(icon: string | undefined, color: string, size = 16) {
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

function TextResponseQuote({ response, sectionedContent }: { response: string; sectionedContent: boolean }) {
  return (
    <figure className={`${sectionedContent ? 'my-1' : ''} relative ml-2 min-h-[190px] border-l-4 border-sky-500 bg-sky-50/80 px-5 py-4 sm:ml-4 sm:px-6`}>
      <div className="pointer-events-none absolute left-3 top-0 text-7xl font-serif leading-none text-sky-200/90" aria-hidden="true">
        &ldquo;
      </div>
      <blockquote className="relative pl-7 text-xl font-medium italic leading-relaxed text-neutral-900 sm:text-2xl">
        <p className="whitespace-pre-line">{response}</p>
      </blockquote>
    </figure>
  )
}

function UngradedResponseCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="w-full min-h-[210px] rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm sm:p-5">
      {children}
    </section>
  )
}

function SliderIndicator({ value, directionMode }: { value: number; directionMode: 'unidirectional' | 'bidirectional' | 'stars' }) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0))

  if (directionMode === 'stars') {
    const selectedStars = Math.round(normalized * 5)
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, index) => {
          const filled = index + 1 <= selectedStars
          return (
            <Star
              key={index}
              size={18}
              strokeWidth={2.1}
              className={filled ? 'text-amber-400' : 'text-neutral-300'}
              style={{ fill: filled ? 'currentColor' : 'transparent' }}
            />
          )
        })}
      </div>
    )
  }

  if (directionMode === 'bidirectional') {
    const pct = normalized * 100
    const isLeft = pct < 50
    const fillWidth = `${Math.abs(pct - 50)}%`
    return (
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="absolute left-1/2 top-0 z-10 h-full w-px bg-neutral-500/70" />
        <div
          className="absolute top-0 h-full"
          style={{
            left: isLeft ? `calc(50% - ${fillWidth})` : '50%',
            width: fillWidth,
            background: isLeft ? SLIDER_RED : SLIDER_BLUE,
            borderRadius: isLeft ? '999px 0 0 999px' : '0 999px 999px 0',
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200">
      <div
        className="h-full rounded-r-full"
        style={{ width: `${normalized * 100}%`, background: SLIDER_BLUE }}
      />
    </div>
  )
}

function RatingResponseCard({ question, answer, node }: { question: string; answer: any; node: any }) {
  const [expanded, setExpanded] = React.useState(false)
  const attrs = node?.attrs || {}
  const values = answer?.answer_json?.values || {}
  const directionMode = attrs.direction_mode === 'bidirectional' || attrs.direction_mode === 'stars'
    ? attrs.direction_mode
    : 'unidirectional'
  const rows = (attrs.sliders || [])
    .map((slider: any, index: number) => ({
      uuid: slider.slider_uuid,
      label: slider.label || (attrs.slider_count === 1 ? question : `Option ${index + 1}`),
      value: typeof values?.[slider.slider_uuid] === 'number' ? values[slider.slider_uuid] : 0,
    }))
    .filter((row: any) => row.uuid)
    .sort((a: any, b: any) => b.value - a.value)
  const visibleRows = expanded ? rows : rows.slice(0, 3)
  const hiddenCount = Math.max(0, rows.length - visibleRows.length)

  return (
    <UngradedResponseCard>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,1fr)] gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,1fr)]">
        {visibleRows.map((row: any) => (
          <React.Fragment key={row.uuid}>
            <div className="min-w-0 self-center text-left text-sm font-medium leading-snug text-neutral-700">
              {row.label}
            </div>
            <div className="flex min-w-0 items-center justify-start">
              <SliderIndicator value={row.value} directionMode={directionMode} />
            </div>
          </React.Fragment>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
        >
          See {hiddenCount} more
        </button>
      )}
      {expanded && rows.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-4 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
        >
          Show top 3
        </button>
      )}
    </UngradedResponseCard>
  )
}

function SortResponseCard({ question, answer, node }: { question: string; answer: any; node: any }) {
  const [expanded, setExpanded] = React.useState(false)
  const attrs = node?.attrs || {}
  const assignments = answer?.answer_json?.assignments || {}
  const cards = Array.isArray(attrs.cards) ? attrs.cards : []
  const categories = Array.isArray(attrs.categories) ? attrs.categories : []
  const cardByUuid = new Map(cards.map((card: any, index: number) => [
    card.card_uuid,
    { ...card, title: card.title || `Card ${index + 1}` },
  ]))
  const categoryGroups = categories.map((category: any) => {
    const sortedCards = Object.entries(assignments)
      .filter(([, categoryUuid]) => categoryUuid === category.category_uuid)
      .map(([cardUuid]) => cardByUuid.get(cardUuid))
      .filter(Boolean)
    return { category, cards: sortedCards }
  }).filter((group: any) => group.cards.length > 0)
  const totalHidden = categoryGroups.reduce((total: number, group: any) => total + Math.max(0, group.cards.length - 3), 0)

  return (
    <UngradedResponseCard>
      {categoryGroups.length === 0 ? (
        <p className="text-sm text-neutral-500">No response</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {categoryGroups.map(({ category, cards: sortedCards }: any) => {
              const color = category.color || '#64748b'
              const visibleCards = expanded ? sortedCards : sortedCards.slice(0, 3)
              const hiddenCount = Math.max(0, sortedCards.length - visibleCards.length)
              return (
                <section
                  key={category.category_uuid}
                  className="rounded-xl border bg-white p-3"
                  style={{ borderColor: color, backgroundColor: `${color}0F` }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                      {renderSortIcon(category.icon, color, 15)}
                    </div>
                    <h4 className="min-w-0 text-sm font-semibold text-neutral-900">
                      {getCategoryDisplayLabel(category)}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {visibleCards.map((card: any) => (
                      <div key={card.card_uuid} className="rounded-lg border border-white/80 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm">
                        {card.title}
                      </div>
                    ))}
                  </div>
                  {!expanded && hiddenCount > 0 && (
                    <div className="mt-3 text-xs font-semibold text-neutral-500">
                      See {hiddenCount} more
                    </div>
                  )}
                </section>
              )
            })}
          </div>
          {totalHidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-4 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              See {totalHidden} more
            </button>
          )}
          {expanded && totalHidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-4 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              Show top 3
            </button>
          )}
        </>
      )}
    </UngradedResponseCard>
  )
}

function MultiSelectResponseCard({ question, answer, node }: { question: string; answer: any; node: any }) {
  const attrs = node?.attrs || {}
  const selected = new Set(Array.isArray(answer?.answer_json?.option_uuids) ? answer.answer_json.option_uuids : [])
  const categories = Array.isArray(attrs.categories) ? attrs.categories : []
  const groups = categories.map((category: any, index: number) => ({
    title: category.title || `Section ${index + 1}`,
    options: (category.options || []).filter((option: any) => selected.has(option.option_uuid)),
  })).filter((group: any) => group.options.length > 0)

  return (
    <UngradedResponseCard>
      {groups.length === 0 ? (
        <p className="text-sm text-neutral-500">No response</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group: any) => (
            <section key={group.title} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-neutral-500">
                {group.title}
              </h4>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option: any) => (
                  <span
                    key={option.option_uuid}
                    className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-900"
                  >
                    {option.label || 'Option'}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </UngradedResponseCard>
  )
}

function UngradedAnswerResponse({
  answer,
  node,
  question,
  index,
  sectionedContent,
  getResponseText,
}: {
  answer: any
  node: any
  question: string
  index: number
  sectionedContent: boolean
  getResponseText: (answer: any, node: any) => string
}) {
  const answerType = answer?.answer_json?.type
  const response = getResponseText(answer, node)

  if (answerType === 'text') {
    return (
      <TextResponseQuote
        response={response}
        sectionedContent={sectionedContent}
      />
    )
  }
  if (answerType === 'slider') {
    return <RatingResponseCard question={question} answer={answer} node={node} />
  }
  if (answerType === 'sort') {
    return <SortResponseCard question={question} answer={answer} node={node} />
  }
  if (answerType === 'multiselect') {
    return <MultiSelectResponseCard question={question} answer={answer} node={node} />
  }
  return (
    <div
      key={`${answer.question_uuid}-${index}`}
      className={sectionedContent ? 'py-4 first:pt-0 last:pb-0' : 'rounded-2xl border border-neutral-100 bg-neutral-50 p-4'}
    >
      <p className="whitespace-pre-line text-sm text-neutral-600">{response}</p>
    </div>
  )
}

function UngradedResultsTabs({
  answers,
  getQuestionNode,
  getResponseText,
  getQuestionDisplayLabel,
  sectionedContent,
  hiddenQuestionUuids = [],
  onToggleQuestionHidden,
  editableTabLabels = false,
  onSaveTabLabel,
  isSavingTabLabel = false,
}: {
  answers: any[]
  getQuestionNode: (questionUuid: string) => any | null
  getResponseText: (answer: any, node: any) => string
  getQuestionDisplayLabel: (answer: any, node: any | null, index: number) => string
  sectionedContent: boolean
  hiddenQuestionUuids?: string[]
  onToggleQuestionHidden?: (questionUuid: string) => void
  editableTabLabels?: boolean
  onSaveTabLabel?: (questionUuid: string, label: string) => void | Promise<void>
  isSavingTabLabel?: boolean
}) {
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [editingQuestionUuid, setEditingQuestionUuid] = React.useState<string | null>(null)
  const [editingLabel, setEditingLabel] = React.useState('')
  const activeAnswer = answers[Math.min(activeIndex, Math.max(0, answers.length - 1))]
  const activeNode = activeAnswer ? getQuestionNode(activeAnswer.question_uuid) : null
  const activeQuestion = activeAnswer ? getQuestionDisplayLabel(activeAnswer, activeNode, activeIndex) : `Question ${activeIndex + 1}`
  const hiddenSet = React.useMemo(() => new Set(hiddenQuestionUuids), [hiddenQuestionUuids])
  const activeHidden = activeAnswer ? hiddenSet.has(activeAnswer.question_uuid) : false

  React.useEffect(() => {
    if (activeIndex <= Math.max(0, answers.length - 1)) return
    setActiveIndex(Math.max(0, answers.length - 1))
  }, [activeIndex, answers.length])

  if (!activeAnswer) return null

  const startEditingLabel = (questionUuid: string, label: string) => {
    setEditingQuestionUuid(questionUuid)
    setEditingLabel(label)
  }

  const saveEditingLabel = async (questionUuid: string) => {
    if (!onSaveTabLabel) return
    await onSaveTabLabel(questionUuid, editingLabel)
    setEditingQuestionUuid(null)
    setEditingLabel('')
  }

  return (
    <div className="space-y-3">
      {answers.length > 1 && (
        <div className="quiz-result-tab-scroll flex overflow-x-auto border-b border-neutral-200 bg-white px-1 pb-1">
          <style jsx global>{`
            .quiz-result-tab-scroll {
              scrollbar-width: thin;
              scrollbar-color: #c7c7cc #f2f2f7;
            }
            .quiz-result-tab-scroll::-webkit-scrollbar {
              height: 8px;
            }
            .quiz-result-tab-scroll::-webkit-scrollbar-track {
              background: #f2f2f7;
              border-radius: 999px;
            }
            .quiz-result-tab-scroll::-webkit-scrollbar-thumb {
              background: #c7c7cc;
              border-radius: 999px;
              border: 2px solid #f2f2f7;
            }
          `}</style>
          {answers.map((answer: any, index: number) => {
            const node = getQuestionNode(answer.question_uuid)
            const question = getQuestionDisplayLabel(answer, node, index)
            const active = index === activeIndex
            const hidden = hiddenSet.has(answer.question_uuid)
            const isEditing = editableTabLabels && editingQuestionUuid === answer.question_uuid
            return (
              <div
                key={`${answer.question_uuid}-${index}`}
                className={`group flex min-w-fit flex-1 items-center justify-center gap-2 border-b-2 px-4 text-center text-xs font-bold transition-colors ${
                  active ? 'border-emerald-600 text-neutral-950' : 'border-transparent text-neutral-500 hover:text-neutral-900'
                } ${hidden ? 'bg-neutral-100 text-neutral-500' : ''}`}
              >
                {isEditing ? (
                  <input
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void saveEditingLabel(answer.question_uuid)
                      if (e.key === 'Escape') {
                        setEditingQuestionUuid(null)
                        setEditingLabel('')
                      }
                    }}
                    className="my-2 min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-neutral-900 outline-none focus:border-emerald-500"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className="min-w-0 flex-1 py-3"
                  >
                    <span className="block whitespace-normal leading-snug">{question}</span>
                  </button>
                )}
                {editableTabLabels && onSaveTabLabel ? (
                  isEditing ? (
                    <button
                      type="button"
                      aria-label="Save display name"
                      title="Save display name"
                      disabled={isSavingTabLabel}
                      onClick={() => void saveEditingLabel(answer.question_uuid)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Edit display name"
                      title="Edit display name"
                      onClick={() => startEditingLabel(answer.question_uuid, question)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 ${
                        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  )
                ) : null}
                {onToggleQuestionHidden ? (
                  <button
                    type="button"
                    aria-label={hidden ? 'Show response publicly' : 'Hide response publicly'}
                    title={hidden ? 'Show response publicly' : 'Hide response publicly'}
                    onClick={() => {
                      onToggleQuestionHidden(answer.question_uuid)
                    }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
                      active || hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    } ${hidden ? 'bg-neutral-200 text-neutral-700' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'}`}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <div className={`min-h-[220px] ${activeHidden ? 'rounded-2xl bg-neutral-100 p-3' : ''}`}>
        <UngradedAnswerResponse
          answer={activeAnswer}
          node={activeNode}
          question={activeQuestion}
          index={activeIndex}
          sectionedContent={sectionedContent}
          getResponseText={getResponseText}
        />
      </div>
    </div>
  )
}

export default function QuizResultsView({
  result,
  activity,
  org,
  course,
  onRetake,
  showRetakeButton = false,
  sectionedContent = false,
  hiddenQuestionUuids = [],
  onToggleQuestionHidden,
  editableUngradedTabLabels = false,
  onSaveUngradedTabLabel,
  isSavingUngradedTabLabel = false,
  publicMode = false,
}: Props) {
  const resultJson = result?.result_json
  const scores: Record<string, number> = resultJson?.scores || {}
  const vectors: any[] = resultJson?.vectors || []
  const matchedFromAttempt: any = resultJson?.matched_result || null
  const latestMatchedOption = matchedFromAttempt?.uuid
    ? (activity?.details?.result_options || []).find((option: any) => option.uuid === matchedFromAttempt.uuid) || null
    : null
  const matched: any = latestMatchedOption ? { ...matchedFromAttempt, ...latestMatchedOption } : matchedFromAttempt
  const quizMode = resultJson?.quiz_mode || activity?.details?.quiz_mode || 'categories'
  const graded = resultJson?.graded_result || null
  const contentNodes: any[] = activity?.content?.content || []

  const getCoverUrl = (blockObj: any) => {
    if (!blockObj) return null
    const fileId = `${blockObj.content.file_id}.${blockObj.content.file_format}`
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid,
      fileId,
      'imageBlock'
    )
  }

  const getQuestionNode = (questionUuid: string) => findQuestionNode(contentNodes, questionUuid)
  const tabLabelOverrides = activity?.details?.ungraded_result_tab_labels || {}
  const getQuestionDisplayLabel = (answer: any, node: any | null, index: number): string => {
    const override = tabLabelOverrides?.[answer?.question_uuid]
    if (typeof override === 'string' && override.trim()) return override.trim()
    return node?.attrs?.question_text || `Question ${index + 1}`
  }

  const getResponseText = (answer: any, node: any): string => {
    const answerJson = answer?.answer_json || {}
    const attrs = node?.attrs || {}
    if (answerJson.type === 'select') {
      const option = (attrs.options || []).find((opt: any) => opt.option_uuid === answerJson.option_uuid)
      return option?.label || 'Selected option'
    }
    if (answerJson.type === 'multiselect') {
      const selected = new Set(Array.isArray(answerJson.option_uuids) ? answerJson.option_uuids : [])
      const labels = (attrs.categories || []).flatMap((category: any) =>
        (category.options || [])
          .filter((option: any) => selected.has(option.option_uuid))
          .map((option: any) => `${category.title || 'Category'}: ${option.label || 'Option'}`)
      )
      return labels.join('\n') || 'No response'
    }
    if (answerJson.type === 'text') {
      return answerJson.text || 'No response'
    }
    if (answerJson.type === 'slider') {
      const values = answerJson.values || {}
      const sliders = attrs.sliders || []
      const isStars = attrs.direction_mode === 'stars'
      return Object.entries(values).map(([sliderUuid, value]) => {
        const slider = sliders.find((item: any) => item.slider_uuid === sliderUuid)
        const label = slider?.label || attrs.question_text || 'Rating'
        const numeric = Number(value)
        const displayValue = isStars ? `${(numeric * 5).toFixed(1)} / 5` : `${Math.round(numeric * 100)}%`
        return `${label}: ${displayValue}`
      }).join('\n') || 'No response'
    }
    if (answerJson.type === 'sort') {
      const assignments = answerJson.assignments || {}
      const cards = attrs.cards || []
      const categories = attrs.categories || []
      return Object.entries(assignments).map(([cardUuid, categoryUuid]) => {
        const card = cards.find((item: any) => item.card_uuid === cardUuid)
        const category = categories.find((item: any) => item.category_uuid === categoryUuid)
        return `${card?.title || 'Card'}: ${getCategoryDisplayLabel(category)}`
      }).join('\n') || 'No response'
    }
    return 'No response'
  }

  if (quizMode === 'ungraded') {
    const hiddenSet = new Set(hiddenQuestionUuids)
    const answers = (resultJson?.answers || [])
      .filter((answer: any) => answer?.answer_json?.type !== 'info')
      .filter((answer: any) => !publicMode || !hiddenSet.has(answer?.question_uuid))

    return (
      <div className={sectionedContent ? 'w-full' : 'w-full max-w-3xl mx-auto p-4 sm:p-5'}>
        <div className="bg-white">
          {answers.length === 0 ? (
            <p className="text-sm text-neutral-500">{publicMode ? 'No public responses are visible.' : 'No responses were recorded.'}</p>
          ) : (
            <UngradedResultsTabs
              answers={answers}
              getQuestionNode={getQuestionNode}
              getResponseText={getResponseText}
              getQuestionDisplayLabel={getQuestionDisplayLabel}
              sectionedContent={sectionedContent}
              hiddenQuestionUuids={hiddenQuestionUuids}
              onToggleQuestionHidden={onToggleQuestionHidden}
              editableTabLabels={editableUngradedTabLabels}
              onSaveTabLabel={onSaveUngradedTabLabel}
              isSavingTabLabel={isSavingUngradedTabLabel}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Graded mode ────────────────────────────────────────────────────────────
  if (quizMode === 'graded' && graded) {
    const attemptsRemaining = graded.attempts_remaining
    const canRetake = attemptsRemaining === null || attemptsRemaining > 0
    const passed = !!graded.passed

    return (
      <div className="w-full max-w-3xl mx-auto pb-8">
        <div className="space-y-5">
          <div className={`rounded-3xl p-5 md:p-6 text-white ${passed ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            <div className="flex items-start justify-between gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                {passed ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">
                {passed ? 'Passed' : 'Not Passed'}
              </span>
            </div>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-white/75">Final score</p>
                <p className="text-5xl font-black leading-none">{graded.score_percent.toFixed(1)}%</p>
                <p className="text-sm text-white/80">Pass mark: {graded.pass_percent.toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 md:min-w-[140px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Correct</p>
                <p className="mt-2 text-2xl font-bold">{graded.correct_answers}/{graded.question_count}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-neutral-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={18} className="text-neutral-700" />
                <h2 className="text-xl font-bold text-neutral-900">Quiz Results</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs uppercase tracking-wider font-bold">
                    <BarChart3 size={13} />
                    Best Score
                  </div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">{graded.best_score_percent.toFixed(1)}%</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="text-neutral-500 text-xs uppercase tracking-wider font-bold">Attempt</div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">#{graded.attempt_number}</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="text-neutral-500 text-xs uppercase tracking-wider font-bold">Remaining</div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">{attemptsRemaining === null ? '∞' : attemptsRemaining}</p>
                </div>
              </div>
            </div>

            {showRetakeButton && (
              <div className="flex flex-wrap gap-3">
                {canRetake && (
                  <button
                    onClick={onRetake}
                    className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-semibold transition-colors outline-none"
                  >
                    <RotateCcw size={15} />
                    Retake quiz
                  </button>
                )}
                {!canRetake && (
                  <div className="py-3 px-5 rounded-2xl bg-neutral-100 text-neutral-500 text-sm font-semibold">
                    No retakes remaining
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Categories mode ────────────────────────────────────────────────────────
  const coverUrl = matched ? getCoverUrl(matched.cover_image_block_object) : null
  const seed = matched?.label || matched?.uuid || 'result'
  const gradient = getGradient(seed)

  return (
    <div className="w-full">
      {/* Cover image — full width, with title/subtitle overlay */}
      <div
        className="relative w-full"
        style={{ minHeight: 220, background: coverUrl ? undefined : gradient }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full object-cover"
            style={{ maxHeight: 340, minHeight: 220 }}
          />
        ) : (
          <div className="w-full" style={{ minHeight: 220, background: gradient }} />
        )}

        {/* Gradient scrim so text is always readable */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0) 100%)' }}
        />

        {/* Title + subtitle overlay, bottom-left */}
        {matched && (matched.title || matched.subtitle) && (
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 sm:px-8 sm:pb-6">
            {matched.subtitle && (
              <p className="text-white/75 text-xs font-semibold uppercase tracking-widest mb-1 drop-shadow">
                {matched.subtitle}
              </p>
            )}
            {matched.title && (
              <h1 className="text-white text-2xl sm:text-3xl font-bold leading-tight drop-shadow">
                {matched.title}
              </h1>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-6">
        {/* Rich content blocks */}
        {matched && (
          <QuizResultContentRenderer
            key={`${matched?.uuid || 'none'}:${JSON.stringify(scores)}:${vectors.map((vec: any) => vec.key).join(',')}`}
            template={activity?.details?.results_template ?? null}
            varOverrides={matched.var_overrides ?? null}
            activity={activity}
            org={org}
            course={course}
            scores={scores}
            vectors={vectors}
            fallbackBody={matched.body}
            sectioned={sectionedContent}
          />
        )}

        {!matched && (
          <p className="text-neutral-500 text-sm text-center py-4">Quiz completed!</p>
        )}
      </div>
    </div>
  )
}
