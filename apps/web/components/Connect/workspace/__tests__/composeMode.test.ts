import { describe, expect, test } from 'bun:test'
import { keepComposeMode, keptComposeMode } from '../feed'

describe('compose mode', () => {
  test('a chat keeps Staff only after it is picked', () => {
    expect(keptComposeMode('chat_a')).toBe(undefined)
    keepComposeMode('chat_a', 'staff')
    expect(keptComposeMode('chat_a')).toBe('staff')
  })
  test('each chat keeps its own pick', () => {
    keepComposeMode('chat_b', 'staff')
    keepComposeMode('chat_c', 'message')
    expect(keptComposeMode('chat_b')).toBe('staff')
    expect(keptComposeMode('chat_c')).toBe('message')
  })
})
