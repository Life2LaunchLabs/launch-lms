import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizMultiSelectBlockComponent from './QuizMultiSelectBlockComponent'

export default Node.create({
  name: 'quizMultiSelectBlock',
  group: 'block',
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      question_uuid: { default: '' },
      question_text: { default: '' },
      categories: { default: [] },
      background_gradient_seed: { default: '' },
      background_image_file_id: { default: null },
      background_image_block_object: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-multi-select-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-multi-select-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizMultiSelectBlockComponent)
  },
})
