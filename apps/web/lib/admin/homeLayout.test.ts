import assert from 'node:assert/strict'
import test from 'node:test'
import { arrangeWidgets, layoutOf, moveWidget, toggleWidget } from './homeLayout.ts'

test('widgets follow the saved order, and ones never placed come last', () => {
  const arranged = arrangeWidgets(['waiting', 'today', 'messages', 'attention'], { order: ['attention', 'creator', 'waiting'], hidden: ['today'] })
  assert.deepEqual(arranged, [
    { id: 'attention', hidden: false },
    { id: 'waiting', hidden: false },
    { id: 'today', hidden: true },
    { id: 'messages', hidden: false },
  ])
  assert.deepEqual(arrangeWidgets(['messages'], null), [{ id: 'messages', hidden: false }])
})

test('moving stops at either end, and toggling hides or shows one widget', () => {
  const arranged = arrangeWidgets(['waiting', 'today', 'messages'])
  assert.deepEqual(moveWidget(arranged, 'today', -1).map((item) => item.id), ['today', 'waiting', 'messages'])
  assert.equal(moveWidget(arranged, 'waiting', -1), arranged)
  assert.equal(moveWidget(arranged, 'messages', 1), arranged)
  assert.deepEqual(toggleWidget(arranged, 'messages').find((item) => item.id === 'messages'), { id: 'messages', hidden: true })
})

test('saving keeps the place of widgets this viewer does not get right now', () => {
  const previous = { order: ['creator', 'waiting', 'messages'] as const, hidden: ['creator'] as const }
  const arranged = toggleWidget(arrangeWidgets(['waiting', 'messages'], { order: [...previous.order], hidden: [...previous.hidden] }), 'waiting')
  assert.deepEqual(layoutOf(arranged, { order: [...previous.order], hidden: [...previous.hidden] }), { order: ['waiting', 'messages', 'creator'], hidden: ['waiting', 'creator'] })
})
