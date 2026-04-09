import React from 'react'
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { BarChart3 } from 'lucide-react'

function getScorePercent(vector: any, rawValue: number): number {
  if (vector?.type === 'bidirectional') {
    return Math.round(((rawValue + 1) / 2) * 100)
  }
  return Math.round(rawValue * 100)
}

function QuizScoresBlockComponent(props: any) {
  const vectors = props.extension.options?.vectors || []
  const scores = props.extension.options?.scores || {}

  return (
    <NodeViewWrapper
      as="div"
      className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 my-3"
      data-drag-handle
    >
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 size={16} className="text-neutral-500" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Your scores</h3>
      </div>
      {vectors.length === 0 ? (
        <p className="m-0 text-xs text-neutral-400">Add scoring dimensions to show a score summary here.</p>
      ) : (
        <div className="space-y-3">
          {vectors.map((vector: any) => {
            const rawValue = Number(scores?.[vector.key] ?? 0)
            const pct = getScorePercent(vector, rawValue)
            return (
              <div key={vector.key} className="space-y-1">
                <div className="flex justify-between text-xs text-neutral-600">
                  <span className="font-medium">{vector.label || vector.key}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>{vector.low_label || 'Low'}</span>
                  <span>{vector.type === 'binary' ? (rawValue >= 0.5 ? 'True' : 'False') : `${pct}%`}</span>
                  <span>{vector.high_label || 'High'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </NodeViewWrapper>
  )
}

const QuizScoresBlock = Node.create({
  name: 'quizScoresBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      isFixed: {
        default: true,
        parseHTML: element => element.getAttribute('data-fixed') === 'true',
        renderHTML: attributes => (attributes.isFixed ? { 'data-fixed': 'true' } : {}),
      },
      fixedId: {
        default: null,
        parseHTML: element => element.getAttribute('data-fixed-id') || null,
        renderHTML: attributes => (attributes.fixedId ? { 'data-fixed-id': attributes.fixedId } : {}),
      },
      varId: {
        default: null,
        parseHTML: element => element.getAttribute('data-var-id') || null,
        renderHTML: attributes => (attributes.varId ? { 'data-var-id': attributes.varId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-scores-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-scores-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizScoresBlockComponent)
  },
})

export default QuizScoresBlock
