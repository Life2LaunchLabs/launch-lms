import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizInfoBlockComponent from './QuizInfoBlockComponent'

export default Node.create({
  name: 'quizInfoBlock',
  group: 'block',
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      slide_uuid: { default: '' },
      image_file_id: { default: null },
      image_block_object: { default: null },
      gradient_seed: { default: '' },
      title: { default: '' },
      body: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-info-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-info-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizInfoBlockComponent)
  },
})
