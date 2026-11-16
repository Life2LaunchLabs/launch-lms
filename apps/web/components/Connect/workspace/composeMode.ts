import React from 'react'

/** Who reads what staff write next in a chat: everyone in it, or staff alone. */
export type ComposeMode = 'message' | 'staff'

type Store = Pick<Storage, 'getItem' | 'setItem'> | null

const KEY = 'connect.compose_mode'
// Kept for the tab, so a chat that mounts again (a page refresh, the thread reloading, signing back
// in) stays on Staff only instead of quietly going back to Message, which the learner reads (FEED-210).
const chosen = new Map<string, ComposeMode>()

function tabStore(): Store {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The mode last picked in this chat in this tab, if any. */
export function rememberedMode(chat: string | undefined, store: Store = tabStore()): ComposeMode | null {
  if (!chat) return null
  const known = chosen.get(chat)
  if (known) return known
  try {
    const saved = store?.getItem(`${KEY}:${chat}`)
    return saved === 'staff' || saved === 'message' ? saved : null
  } catch {
    return null
  }
}

export function rememberMode(chat: string | undefined, mode: ComposeMode, store: Store = tabStore()) {
  if (!chat) return
  chosen.set(chat, mode)
  try {
    store?.setItem(`${KEY}:${chat}`, mode)
  } catch {
    // Private windows can refuse storage; the in-memory choice still holds for this page.
  }
}

/** For tests: forget every chat's mode. */
export function forgetModes() {
  chosen.clear()
}

/**
 * The composer's mode for one chat. It stays on what staff picked, sending included, until they
 * switch it themselves; reading the chat's staff-only messages turns it to Staff only.
 */
export function useComposeMode(chat: string | undefined, audience?: string) {
  const [choice, setChoice] = React.useState<{ chat: string | undefined; mode: ComposeMode } | null>(null)
  const mode: ComposeMode = choice && choice.chat === chat ? choice.mode : rememberedMode(chat) ?? 'message'
  const setMode = React.useCallback((next: ComposeMode) => {
    rememberMode(chat, next)
    setChoice({ chat, mode: next })
  }, [chat])
  // Reading staff-only messages, you're most likely writing one.
  React.useEffect(() => { if (audience === 'staff') setMode('staff') }, [audience, setMode])
  return [mode, setMode] as const
}
