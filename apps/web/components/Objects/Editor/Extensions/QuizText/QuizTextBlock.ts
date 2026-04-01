import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizTextBlockComponent from './QuizTextBlockComponent'

export default Node.create({
  name: 'quizTextBlock',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      question_uuid: { default: '' },
      question_text: { default: '' },
      description: { default: '' },
      placeholder: { default: '' },
      input_size: { default: 'single_line' },
      background_gradient_seed: { default: '' },
      background_image_file_id: { default: null },
      background_image_block_object: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-text-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-text-block', mergeAttributes(HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizTextBlockComponent)
  },
})
