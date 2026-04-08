import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import QuizSliderBlockComponent from './QuizSliderBlockComponent'

export default Node.create({
  name: 'quizSliderBlock',
  group: 'block',
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      question_uuid: { default: '' },
      question_text: { default: '' },
      slider_count: { default: 2 },
      direction_mode: { default: 'stars' },
      label_mode: { default: 'none' },
      number_max: { default: 5 },
      left_axis_label: { default: '' },
      right_axis_label: { default: '' },
      sliders: { default: [] },
      background_gradient_seed: { default: '' },
      background_image_file_id: { default: null },
      background_image_block_object: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'quiz-slider-block' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['quiz-slider-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(QuizSliderBlockComponent)
  },
})
