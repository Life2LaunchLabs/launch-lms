import assert from 'node:assert/strict'
import test from 'node:test'

import { parseStageLines, stageLines } from '../stageLines.ts'

test('a stage line can say who it is for and who it waits on, in either order', () => {
  const [invite, join, feedback] = parseStageLines([
    'Invite your students | Invite Maya. | for @Dana',
    'Join your school | Join from the invite. | after dana/invite-your-students | for maya, sam',
    'Say what you think | Tell us how it went.',
  ].join('\n'))
  assert.deepEqual(invite, { title: 'Invite your students', goal: 'Invite Maya.', after: null, personas: ['dana'] })
  assert.deepEqual(join.personas, ['maya', 'sam'])
  assert.deepEqual(join.after, { persona: 'dana', stage: 'invite-your-students' })
  assert.deepEqual(feedback.personas, [])
})

test('stages written back as lines read the same again', () => {
  const stages = [{ title: 'Join your school', goal: 'Join.', after: { persona: 'dana', stage: 'invite' }, personas: ['maya'] }]
  assert.equal(stageLines(stages), 'Join your school | Join. | for maya | after dana/invite')
  assert.deepEqual(parseStageLines(stageLines(stages)), stages)
})
