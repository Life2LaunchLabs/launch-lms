'use client'

import React from 'react'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { Chalkboard } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { learnerNameApi, learnerNameKey, type LearnerName } from '@services/goals/adminHome'

/** Staff only: the name learners in this organization see on their messages and reviews. */
export default function AccountLearnerName() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const { data, mutate } = useSWR<LearnerName>(orgId && token ? learnerNameKey(orgId) : null, () => learnerNameApi.get(orgId, token))
  const [value, setValue] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { setValue(data?.learner_name || '') }, [data?.learner_name])
  if (!data?.staff) return null

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await mutate(await learnerNameApi.save(orgId, value, token), { revalidate: false })
      toast.success('Saved')
    } catch (caught: any) {
      toast.error(caught?.message || 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }
  const name = [session?.data?.user?.first_name, session?.data?.user?.last_name].filter(Boolean).join(' ')
  return <section className={`${settingsCard} p-5`}>
    <SettingsHeader icon={Chalkboard} title="What learners call you" description={`Learners at ${org?.name || 'this organization'} see this on your messages and reviews. Staff still see your name.`} />
    <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={60} placeholder={name || 'Your name'} aria-label="What learners call you" className="sm:max-w-sm" />
      <Button type="submit" disabled={busy || value === (data.learner_name || '')}>Save</Button>
    </form>
  </section>
}
