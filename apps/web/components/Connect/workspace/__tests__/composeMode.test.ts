import { describe, expect, test } from 'bun:test'
import { keepComposeMode, keptComposeMode, startingComposeMode } from '../feed'

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

describe('where the box starts', () => {
  test('a kept pick wins', () => {
    keepComposeMode('chat_d', 'message')
    expect(startingComposeMode('chat_d', [{ mine: true, staff_only: true }])).toBe('message')
  })
  test('with nothing kept, your own last staff-only note starts it on Staff only', () => {
    expect(startingComposeMode('chat_e', [{ mine: true, staff_only: true }, { mine: false }])).toBe('staff')
  })
  test('with nothing kept, your own last message to everyone leaves it alone', () => {
    expect(startingComposeMode('chat_f', [{ mine: true, staff_only: true }, { mine: true }])).toBe(undefined)
    expect(startingComposeMode('chat_g')).toBe(undefined)
  })
})
