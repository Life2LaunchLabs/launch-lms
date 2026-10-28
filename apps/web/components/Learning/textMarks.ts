import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Size and colour on selected words of a text block, stored as a `textStyle` mark with
 * `fontSize` (px) and `color`. The editor and the player both load it, so styled words
 * look the same to the author and the learner.
 */
export const LearningTextStyle = Mark.create({
  name: 'textStyle',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (element) => Number.parseInt(element.style.fontSize, 10) || null,
        renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${Number(attributes.fontSize)}px` } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[style]', getAttrs: (element) => ((element as HTMLElement).style.color || (element as HTMLElement).style.fontSize ? {} : false) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

export const TEXT_COLORS = [
  { value: '', label: 'Default' },
  { value: 'var(--org-primary-color)', label: 'Accent' },
  { value: '#64748b', label: 'Soft' },
  { value: '#16a34a', label: 'Green' },
  { value: '#dc2626', label: 'Red' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#ffffff', label: 'White' },
  { value: '#0f172a', label: 'Ink' },
]

const STEPS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96]

/** The next size up or down from `current`. */
export function stepSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((size) => size > current) ?? STEPS[STEPS.length - 1]
  return [...STEPS].reverse().find((size) => size < current) ?? STEPS[0]
}
