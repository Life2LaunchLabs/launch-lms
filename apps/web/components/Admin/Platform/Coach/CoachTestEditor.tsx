'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { coachAdminApi, type CoachTest, type CoachTestWrite } from '@services/coach/admin'
import { errorMessage } from './CoachShell'

export const blankTest: CoachTestWrite = {
  title: '', moment: 'learner_message', message: '', enabled: true,
  learner: { headline: '', bio: '', location: '', strengths: [], values: [], now: [], goals: [] },
  goal: { title: '', why: '', target_date: '', steps: [] },
  rubric: [{ id: '', kind: 'must', text: 'Does not create a goal for the learner' }, { id: '', kind: 'should', text: '' }],
}

const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
const commas = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)

function copy(test: CoachTestWrite | CoachTest): CoachTestWrite {
  const { title, moment, learner, message, goal, rubric, enabled } = test
  return JSON.parse(JSON.stringify({ title, moment, learner, message, goal, rubric, enabled }))
}

export default function CoachTestEditor({ uuid, initial, token, onSaved, onDone }: { uuid?: string; initial: CoachTestWrite | CoachTest; token?: string; onSaved: () => Promise<unknown>; onDone: () => void }) {
  const [draft, setDraft] = React.useState<CoachTestWrite>(() => copy(initial))
  const [busy, setBusy] = React.useState<'save' | 'delete' | null>(null)
  const set = (patch: Partial<CoachTestWrite>) => setDraft((current) => ({ ...current, ...patch }))
  const setLearner = (patch: Partial<CoachTestWrite['learner']>) => set({ learner: { ...draft.learner, ...patch } })
  const setGoal = (patch: Partial<CoachTestWrite['goal']>) => set({ goal: { ...draft.goal, ...patch } })
  const id = uuid || 'new-test'
  const ready = draft.title.trim() && draft.rubric.some((line) => line.text.trim()) && (draft.moment === 'learner_message' ? draft.message.trim() : draft.goal.title.trim())

  async function act(kind: 'save' | 'delete', action: () => Promise<unknown>, done: string, failed: string) {
    setBusy(kind)
    try {
      await action()
      await onSaved()
      toast.success(done)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error, failed))
      setBusy(null)
    }
  }

  function save() {
    const payload = { ...draft, rubric: draft.rubric.filter((line) => line.text.trim()) }
    void act('save', () => (uuid ? coachAdminApi.updateTest(uuid, payload, token) : coachAdminApi.createTest(payload, token)), `${draft.title.trim()} saved.`, 'Could not save the test.')
  }

  function remove() {
    if (!uuid || !window.confirm(`Delete the test “${initial.title}”?`)) return
    void act('delete', () => coachAdminApi.deleteTest(uuid, token), 'Test deleted.', 'Could not delete the test.')
  }

  const goals = draft.learner.goals
  return (
    <div className={uuid ? 'space-y-5' : 'space-y-5 rounded-xl border border-violet-200 bg-violet-50/40 p-4'}>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block"><span className="text-sm font-bold text-gray-900">Title</span>
          <Input value={draft.title} maxLength={200} onChange={(event) => set({ title: event.target.value })} placeholder="Wants to quit after a bad shift" className="mt-2" />
          <span className="mt-1 block text-xs text-gray-500">Only admins see it. Coach never does.</span></label>
        <label className="flex items-center gap-3 self-start pt-8 text-sm"><Switch checked={draft.enabled} onCheckedChange={(enabled) => set({ enabled })} /><span className="font-bold text-gray-900">On</span></label>
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-gray-900">The learner</legend>
        <p className="mt-1 text-xs text-gray-500">Write them the way real learners fill in their portfolio. Coach sees this exactly as it sees a real learner, as far as its abilities allow.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input aria-label="Headline" value={draft.learner.headline} maxLength={200} onChange={(event) => setLearner({ headline: event.target.value })} placeholder="Headline: Line cook, saving for culinary school" />
          <Input aria-label="Location" value={draft.learner.location} maxLength={80} onChange={(event) => setLearner({ location: event.target.value })} placeholder="Location" />
          <Textarea aria-label="Bio" className="sm:col-span-2" rows={2} maxLength={800} value={draft.learner.bio} onChange={(event) => setLearner({ bio: event.target.value })} placeholder="Bio, in their own words" />
          <Input aria-label="Strengths" defaultValue={draft.learner.strengths.join(', ')} onBlur={(event) => setLearner({ strengths: commas(event.target.value).slice(0, 8) })} placeholder="Strengths, separated by commas" />
          <Input aria-label="Values" defaultValue={draft.learner.values.join(', ')} onBlur={(event) => setLearner({ values: commas(event.target.value).slice(0, 8) })} placeholder="Values, separated by commas" />
          <Textarea aria-label="What they do now" className="sm:col-span-2" rows={2} defaultValue={draft.learner.now.join('\n')} onBlur={(event) => setLearner({ now: lines(event.target.value).slice(0, 4) })} placeholder="What they do now, one per line (a job, a class, a team)" />
        </div>
        <div className="mt-3 space-y-2">
          {goals.map((goal, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-black/10 bg-white p-3 sm:grid-cols-2">
              <Input aria-label={`Goal ${index + 1} title`} value={goal.title} maxLength={200} onChange={(event) => setLearner({ goals: goals.map((item, at) => (at === index ? { ...item, title: event.target.value } : item)) })} placeholder="One of their goals" />
              <div className="flex gap-2">
                <Input aria-label={`Goal ${index + 1} why`} value={goal.why} maxLength={500} onChange={(event) => setLearner({ goals: goals.map((item, at) => (at === index ? { ...item, why: event.target.value } : item)) })} placeholder="Why it matters to them" />
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove goal ${index + 1}`} onClick={() => setLearner({ goals: goals.filter((_, at) => at !== index) })}><X size={15} /></Button>
              </div>
              <Textarea aria-label={`Goal ${index + 1} next steps`} className="sm:col-span-2" rows={2} defaultValue={goal.next_steps.join('\n')} onBlur={(event) => setLearner({ goals: goals.map((item, at) => (at === index ? { ...item, next_steps: lines(event.target.value).slice(0, 5) } : item)) })} placeholder="Next steps on it, one per line" />
            </div>
          ))}
          {goals.length < 8 ? <Button type="button" variant="outline" size="sm" onClick={() => setLearner({ goals: [...goals, { title: '', why: '', next_steps: [] }] })}><Plus size={14} />Add a goal they already have</Button> : null}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-gray-900">The moment</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {([['learner_message', 'They send Coach a message'], ['goal_created', 'They create a goal']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2"><input type="radio" name={`${id}-moment`} checked={draft.moment === key} onChange={() => set({ moment: key })} />{label}</label>
          ))}
        </div>
        {draft.moment === 'learner_message' ? (
          <Textarea aria-label="What the learner says" className="mt-3" rows={3} maxLength={2000} value={draft.message} onChange={(event) => set({ message: event.target.value })} placeholder="honestly idk if school is even worth it, tonight was rough" />
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input aria-label="New goal title" value={draft.goal.title} maxLength={200} onChange={(event) => setGoal({ title: event.target.value })} placeholder="The goal they just made" />
            <Input aria-label="Target date" type="date" value={draft.goal.target_date} onChange={(event) => setGoal({ target_date: event.target.value })} />
            <Input aria-label="New goal why" className="sm:col-span-2" value={draft.goal.why} maxLength={1000} onChange={(event) => setGoal({ why: event.target.value })} placeholder="Why, if they wrote one" />
            <Textarea aria-label="Steps they added" className="sm:col-span-2" rows={2} defaultValue={draft.goal.steps.join('\n')} onBlur={(event) => setGoal({ steps: lines(event.target.value).slice(0, 20) })} placeholder="Steps they added, one per line (often none)" />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-gray-900">What a good response does</legend>
        <p className="mt-1 text-xs text-gray-500">A separate model grades each line on one response at a time, so make every line something you can see in a single reply. Musts are rules; shoulds are coaching judgment.</p>
        <ol className="mt-3 space-y-2">
          {draft.rubric.map((line, index) => (
            <li key={index} className="flex gap-2">
              <select aria-label={`Line ${index + 1} kind`} value={line.kind} onChange={(event) => set({ rubric: draft.rubric.map((item, at) => (at === index ? { ...item, kind: event.target.value as 'must' | 'should' } : item)) })} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
                <option value="must">Must</option>
                <option value="should">Should</option>
              </select>
              <Input aria-label={`Line ${index + 1}`} value={line.text} maxLength={500} onChange={(event) => set({ rubric: draft.rubric.map((item, at) => (at === index ? { ...item, text: event.target.value } : item)) })} placeholder="Asks at most one question" />
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${index + 1}`} onClick={() => set({ rubric: draft.rubric.filter((_, at) => at !== index) })} disabled={draft.rubric.length === 1}><X size={15} /></Button>
            </li>
          ))}
        </ol>
        {draft.rubric.length < 12 ? <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => set({ rubric: [...draft.rubric, { id: '', kind: 'should', text: '' }] })}><Plus size={14} />Add a line</Button> : null}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {uuid ? <Button type="button" variant="outline" onClick={remove} disabled={busy !== null}>{busy === 'delete' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}Delete</Button> : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy !== null}>Cancel</Button>
          <Button type="button" onClick={save} disabled={busy !== null || !ready}>{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save test</Button>
        </div>
      </div>
    </div>
  )
}
