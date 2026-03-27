import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizSelectBlockComponent from './QuizSelectBlockComponent'

export default Node.create({
  name: 'quizSelectBlock',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      question_uuid: { default: '' },
      question_text: { default: '' },
      option_count: { default: 2 },
      options: { default: [] },
      show_responses: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-select-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-select-block', mergeAttributes(HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizSelectBlockComponent)
  },
})
