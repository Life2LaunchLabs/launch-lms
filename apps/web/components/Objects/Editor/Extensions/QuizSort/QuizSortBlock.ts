import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizSortBlockComponent from './QuizSortBlockComponent'

export default Node.create({
  name: 'quizSortBlock',
  group: 'block',
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      question_uuid: { default: '' },
      question_text: { default: '' },
      cards: { default: [] },
      categories: { default: [] },
      background_gradient_seed: { default: '' },
      background_image_file_id: { default: null },
      background_image_block_object: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-sort-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-sort-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizSortBlockComponent)
  },
})
