'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@components/ui/button'
import { coachAdminApi, type CoachPolicy } from '@services/coach/admin'
import MarkdownField from './MarkdownField'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

export default function CoachMethod({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const [method, setMethod] = React.useState(policy.method)
  const [busy, setBusy] = React.useState(false)
  const dirty = method.trim() !== policy.method.trim()

  async function save() {
    setBusy(true)
    try {
      await mutate(await coachAdminApi.update({ method }, token), { revalidate: false })
      toast.success('Method saved. Release the draft to give it to learners.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the method.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Method"
      description="How Coach coaches: the approach, voice and quality bar, in the coaching team's own words and structure. Coach reads this first in every conversation and routine."
      actions={<Button type="button" onClick={() => void save()} disabled={busy || !dirty}>{busy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save method</Button>}
    >
      <MarkdownField id="coach-method" label="Method document" value={method} onChange={setMethod} maxLength={60000} rows={24} />
      <p className="mt-3 text-xs leading-5 text-gray-500">
        {dirty ? 'Unsaved changes.' : policy.updated_at ? `Last saved ${new Date(policy.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Using the Launch LMS starting method.'}
        {' '}Safety and other specialist guidance live in Knowledge; what Coach may do lives in Abilities.
      </p>
    </Panel>
  )
}
