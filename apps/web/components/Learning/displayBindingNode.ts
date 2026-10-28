import { Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

/** Fired when an author types `{` in activity text: the editor opens the "Their info" picker. */
export const THEIR_INFO_EVENT = 'learning:their-info'

/**
 * "Their info" in activity text: an inline chip (`displayBinding`) holding a binding to an earlier
 * answer or something known about the learner. The editor shows the chip with its label; the player
 * swaps it for the learner's own value (`resolveDisplayNodes`), so it never needs this extension.
 */
export const DisplayBindingNode = Node.create({
  name: 'displayBinding',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      binding: { default: { source: 'variable', path: '' }, rendered: false },
      label: { default: '', rendered: false },
    }
  },
  parseHTML() {
    return [{
      tag: 'span[data-display-binding]',
      getAttrs: (element) => {
        try {
          return JSON.parse((element as HTMLElement).getAttribute('data-display-binding') || '')
        } catch {
          return false
        }
      },
    }]
  },
  renderHTML({ node }) {
    const label = node.attrs.label || node.attrs.binding?.fallback || node.attrs.binding?.path || 'Their info'
    return ['span', {
      'data-display-binding': JSON.stringify({ binding: node.attrs.binding, label: node.attrs.label }),
      // Inherits the text colour so it reads on light and dark pages alike.
      style: 'margin: 0 2px; padding: 0 6px; border-radius: 6px; background: rgb(139 92 246 / 0.28); font-weight: 700; font-size: 0.92em; white-space: nowrap;',
      contenteditable: 'false',
    }, label]
  },
  renderText({ node }) {
    return node.attrs.label || ''
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleTextInput: (_view, _from, _to, text) => {
          if (text !== '{') return false
          window.dispatchEvent(new CustomEvent(THEIR_INFO_EVENT))
          return true
        },
      },
    })]
  },
})
