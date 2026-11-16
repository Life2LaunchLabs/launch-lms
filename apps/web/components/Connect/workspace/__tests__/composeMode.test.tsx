import { describe, expect, test } from 'bun:test'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { forgetModes, rememberMode, rememberedMode, useComposeMode } from '@components/Connect/workspace/composeMode'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

function fakeStore() {
  const items = new Map<string, string>()
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value) } }
}

function Composer({ chat, audience }: { chat?: string; audience?: string }) {
  const [mode] = useComposeMode(chat, audience)
  return <span>{mode}</span>
}

describe('the composer stays on Staff only after a staff note is sent (DEV-57, FEED-210)', () => {
  test('a chat starts on Message until staff pick Staff only', () => {
    forgetModes()
    expect(rememberedMode('chat_a', null)).toBe(null)
    expect(renderToStaticMarkup(<Composer chat="chat_a" />)).toBe('<span>message</span>')
  })

  test('Staff only holds when the chat mounts again, as after sending and the thread reloading', () => {
    forgetModes()
    rememberMode('chat_a', 'staff', null)
    // Two notes in a row: each mount of the composer for this chat comes back on Staff only.
    expect(renderToStaticMarkup(<Composer chat="chat_a" />)).toBe('<span>staff</span>')
    expect(renderToStaticMarkup(<Composer chat="chat_a" />)).toBe('<span>staff</span>')
    // Another learner's chat isn't affected.
    expect(renderToStaticMarkup(<Composer chat="chat_b" />)).toBe('<span>message</span>')
  })

  test('the choice survives a page refresh in the same tab', () => {
    forgetModes()
    const store = fakeStore()
    rememberMode('chat_a', 'staff', store)
    forgetModes() // a refresh clears memory, not the tab's storage
    expect(rememberedMode('chat_a', store)).toBe('staff')
  })

  test('switching back to Message is remembered too', () => {
    forgetModes()
    rememberMode('chat_a', 'staff', null)
    rememberMode('chat_a', 'message', null)
    expect(rememberedMode('chat_a', null)).toBe('message')
  })

  test('sending a message never touches the mode', () => {
    forgetModes()
    const workspace = source('../ChatWorkspace.tsx')
    expect(workspace).toContain('useComposeMode(chat?.conversation_uuid, audience)')
    const send = workspace.slice(workspace.indexOf('const send = async'), workspace.indexOf('const cheer = async'))
    expect(send).not.toContain('setMode')
  })
})
