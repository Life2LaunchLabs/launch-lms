import { describe, expect, test } from 'bun:test'
import { MEDIA_FLOOR, floorFrom } from '../stack/fit'

const none = { head: 0, first: 0, tail: 0, chrome: 0, slides: [] }

describe('section floors (FEED-63)', () => {
  test('the featured banner stops where its picture and words still fit above the next section', () => {
    // A narrow banner stacks the picture over the title and meta line, then the carousel dots below.
    const floor = floorFrom('free', { ...none, chrome: 4 + 34, slides: [{ text: 132, mediaAbove: true }, { text: 96, mediaAbove: true }] })
    expect(floor).toBe(4 + 34 + MEDIA_FLOOR + 132)
    expect(floor > 140).toBe(true)
  })

  test('a wide banner puts the words beside the picture, so only the words count', () => {
    expect(floorFrom('free', { ...none, chrome: 4, slides: [{ text: 180.4, mediaAbove: false }] })).toBe(185)
  })

  test('a banner with nothing measured has no floor of its own', () => {
    expect(floorFrom('free', none)).toBe(0)
  })

  test('a card section stops at its shortest tidy layout', () => {
    expect(floorFrom('cards', { ...none, smallest: 212, head: 60, first: 300, tail: 20 })).toBe(212)
  })

  test('a text section keeps its heading and first item', () => {
    expect(floorFrom('content', { ...none, head: 64, first: 72, tail: 20 })).toBe(156)
    expect(floorFrom('cards', { ...none, head: 64, first: 72, tail: 20 })).toBe(156)
  })
})
