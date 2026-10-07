import * as Y from 'yjs'

export function assertDemoRoom(boardUuid: string, sessionId?: unknown): void {
  if (sessionId && (typeof sessionId !== 'string' || !boardUuid.startsWith(`board_demo_${sessionId}_`))) {
    throw new Error('Demo visitors can only join their own private board rooms')
  }
  if (!sessionId && boardUuid.startsWith('board_demo_')) {
    throw new Error('Private demo rooms require their owning visitor credential')
  }
}

/** Rebase copied board attributes through Yjs, never by editing binary bytes. */
export function rebaseDemoBoard(state: Uint8Array, aliases: Record<string, string>): Uint8Array {
  if (!Object.keys(aliases).length) return state
  const document = new Y.Doc()
  Y.applyUpdate(document, state)
  let changed = false
  function replace(value: unknown): any {
    if (typeof value === 'string') {
      let result = value
      for (const [original, privateId] of Object.entries(aliases)) result = result.replaceAll(original, privateId)
      return result.replace(/https?:\/\/[^/\s"<>]+\/(?:api\/v1\/)?(content\/[^\s"<>]+)/g,
        (url, path: string) => path.includes('_demo_') ? `/${path}` : url)
    }
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [replace(key), replace(item)]))
    return value
  }
  function xml(node: Y.XmlFragment | Y.XmlElement) {
    if (node instanceof Y.XmlElement) {
      for (const [key, value] of Object.entries(node.getAttributes())) {
        const result = replace(value)
        if (result !== value) { node.setAttribute(key, result); changed = true }
      }
    }
    for (const child of node.toArray()) if (child instanceof Y.XmlElement) xml(child)
  }
  document.transact(() => {
    // Tiptap Collaboration's default root contains all board cards and media.
    xml(document.getXmlFragment('default'))
    for (const name of ['youtube-sync', 'board-timer']) {
      const map = document.getMap(name)
      for (const [key, value] of map.entries()) {
        const result = replace(value)
        if (JSON.stringify(result) !== JSON.stringify(value)) { map.set(key, result); changed = true }
      }
    }
  })
  const result = changed ? Y.encodeStateAsUpdate(document) : state
  document.destroy()
  return result
}
