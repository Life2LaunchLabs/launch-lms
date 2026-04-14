import React from 'react'
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import QuizScoresDisplay, { QuizScoresSortOrder } from './QuizScoresDisplay'

function QuizScoresBlockComponent(props: any) {
  const vectors = props.extension.options?.vectors || []
  const scores = props.extension.options?.scores || {}
  const sortOrder: QuizScoresSortOrder = props.node?.attrs?.sortOrder || 'none'
  const normalize = props.node?.attrs?.normalize !== false
  const isEditable = !!props.editor?.isEditable

  return (
    <NodeViewWrapper
      as="div"
      className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 my-3"
      data-drag-handle
    >
      {isEditable && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-400">Sort</label>
            <select
              value={sortOrder}
              onChange={(e) => props.updateAttributes({ sortOrder: e.target.value as QuizScoresSortOrder })}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs outline-none"
            >
              <option value="none">None</option>
              <option value="asc">Low to high</option>
              <option value="desc">High to low</option>
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600">
            <input
              type="checkbox"
              checked={normalize}
              onChange={(e) => props.updateAttributes({ normalize: e.target.checked })}
              className="h-4 w-4 accent-violet-600"
            />
            Normalize bars
          </label>
        </div>
      )}
      <QuizScoresDisplay
        vectors={vectors}
        scores={scores}
        sortOrder={sortOrder}
        normalize={normalize}
        emptyMessage="Add scoring dimensions to show a score summary here."
      />
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
      sortOrder: {
        default: 'none',
        parseHTML: element => element.getAttribute('data-sort-order') || 'none',
        renderHTML: attributes => ({ 'data-sort-order': attributes.sortOrder || 'none' }),
      },
      normalize: {
        default: true,
        parseHTML: element => element.getAttribute('data-normalize') !== 'false',
        renderHTML: attributes => ({ 'data-normalize': attributes.normalize === false ? 'false' : 'true' }),
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
