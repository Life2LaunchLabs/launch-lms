'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { WelcomeMessageTemplate, welcomeMessageTemplateApi } from '@services/messages/messages'
import { swrFetcher } from '@services/utils/ts/requests'

export default function PlatformSettings() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? `${getAPIUrl()}superadmin/settings/welcome-message` : null
  const { data, error, isLoading, mutate } = useSWR<WelcomeMessageTemplate>(key, (url: string) => swrFetcher(url, token))
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState<'save' | 'reset' | null>(null)

  React.useEffect(() => {
    if (!data) return
    setSubject(data.subject)
    setBody(data.body)
  }, [data])

  async function save() {
    if (!token || !subject.trim() || !body.trim()) return
    setBusy('save')
    try {
      const updated = await welcomeMessageTemplateApi.update(subject, body, token)
      await mutate(updated, { revalidate: false })
      toast.success('Welcome message updated.')
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Could not update the welcome message.')
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    if (!token) return
    setBusy('reset')
    try {
      const updated = await welcomeMessageTemplateApi.reset(token)
      await mutate(updated, { revalidate: false })
      toast.success('Default welcome message restored.')
    } catch (resetError: any) {
      toast.error(resetError?.message || 'Could not restore the default message.')
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The platform settings could not be loaded.</div>

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Account messaging</p>
          <h1 className="mt-1 text-2xl font-black text-gray-950">New-account welcome message</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">Sent from the owner organization to every newly created account. Changes apply only to future messages.</p>
        </div>

        <div className="mt-7 space-y-5">
          <label className="block">
            <span className="text-sm font-bold text-gray-900">Subject</span>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="mt-2 h-11 w-full rounded-xl border border-black/15 px-3 text-sm outline-none focus:border-black" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-900">Message</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={7} className="mt-2 w-full resize-y rounded-xl border border-black/15 p-3 text-sm leading-6 outline-none focus:border-black" />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
          <p className="text-xs text-gray-500">{data?.customized ? 'Using customized copy.' : 'Using the Launch LMS default copy.'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void reset()} disabled={busy !== null || !data?.customized} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/15 px-4 text-sm font-bold text-gray-700 disabled:opacity-40"><RotateCcw size={15} />Reset</button>
            <button type="button" onClick={() => void save()} disabled={busy !== null || !subject.trim() || !body.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
