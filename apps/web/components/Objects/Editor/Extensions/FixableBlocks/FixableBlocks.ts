import { Extension } from '@tiptap/core'

/**
 * Adds `isFixed` and `fixedId` attributes to common block node types.
 * Used in the quiz results content editor to mark blocks as shared across
 * all result options (fixed) vs. per-result (variable, the default).
 */
export const FixableBlocks = Extension.create({
  name: 'fixableBlocks',

  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'blockquote',
          'codeBlock',
          'blockImage',
          'horizontalRule',
        ],
        attributes: {
          isFixed: {
            default: false,
            parseHTML: element => element.getAttribute('data-fixed') === 'true',
            renderHTML: attributes => {
              if (!attributes.isFixed) return {}
              return { 'data-fixed': 'true' }
            },
          },
          fixedId: {
            default: null,
            parseHTML: element => element.getAttribute('data-fixed-id') || null,
            renderHTML: attributes => {
              if (!attributes.fixedId) return {}
              return { 'data-fixed-id': attributes.fixedId }
            },
          },
          varId: {
            default: null,
            parseHTML: element => element.getAttribute('data-var-id') || null,
            renderHTML: () => ({}), // not needed in HTML output
          },
        },
      },
    ]
  },
})

export default FixableBlocks
