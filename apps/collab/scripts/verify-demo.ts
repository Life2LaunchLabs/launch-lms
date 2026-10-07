import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { rebaseDemoBoard, assertDemoRoom } from '../src/demo'

assert.throws(() => assertDemoRoom('board_live', 'visitor'))
assert.throws(() => assertDemoRoom('board_demo_other_private', 'visitor'))
assert.throws(() => assertDemoRoom('board_demo_visitor_private'))
assertDemoRoom('board_demo_visitor_private', 'visitor')
assertDemoRoom('board_live')

const source = new Y.Doc()
const card = new Y.XmlElement('boardCard')
card.setAttribute('image', 'https://live.example/content/orgs/org_source/boards/board_source/image.png')
card.setAttribute('title', 'A useful resource')
source.getXmlFragment('default').insert(0, [card])
const state = Y.encodeStateAsUpdate(source)
const aliases = { org_source: 'org_demo_abc_private', board_source: 'board_demo_abc_private' }
const rebased = rebaseDemoBoard(state, aliases)
const visitor = new Y.Doc()
Y.applyUpdate(visitor, rebased)
const copied = visitor.getXmlFragment('default').get(0) as Y.XmlElement
assert.equal(copied.getAttribute('image'), '/content/orgs/org_demo_abc_private/boards/board_demo_abc_private/image.png')
assert.equal(copied.getAttribute('title'), 'A useful resource')
assert.equal(card.getAttribute('image'), 'https://live.example/content/orgs/org_source/boards/board_source/image.png')
assert.deepEqual(rebaseDemoBoard(rebased, aliases), rebased)
source.destroy()
visitor.destroy()
console.log('Demo board media rebasing: passed; source unchanged; repeated loads stable')
