'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Bot, KeyRound, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { WelcomeMessageTemplate, welcomeMessageTemplateApi } from '@services/messages/messages'
import { swrFetcher } from '@services/utils/ts/requests'
import { HubAdvisorConfiguration, hubAdvisorConfigurationApi } from '@services/hub/configuration'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'

export default function PlatformSettings() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const welcomeKey = token ? `${getAPIUrl()}superadmin/settings/welcome-message` : null
  const advisorKey = token ? `${getAPIUrl()}superadmin/settings/hub-advisor` : null
  const { data, error, isLoading, mutate } = useSWR<WelcomeMessageTemplate>(welcomeKey, (url: string) => swrFetcher(url, token))
  const advisor = useSWR<HubAdvisorConfiguration>(advisorKey, (url: string) => swrFetcher(url, token))
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState<'save' | 'reset' | null>(null)
  const [advisorEnabled, setAdvisorEnabled] = React.useState(false)
  const [advisorModel, setAdvisorModel] = React.useState('')
  const [advisorInstructions, setAdvisorInstructions] = React.useState('')
  const [advisorApiKey, setAdvisorApiKey] = React.useState('')
  const [advisorBusy, setAdvisorBusy] = React.useState(false)

  React.useEffect(() => {
    if (!data) return
    setSubject(data.subject)
    setBody(data.body)
  }, [data])

  React.useEffect(() => {
    if (!advisor.data) return
    setAdvisorEnabled(advisor.data.enabled)
    setAdvisorModel(advisor.data.model)
    setAdvisorInstructions(advisor.data.instructions)
    setAdvisorApiKey('')
  }, [advisor.data])

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

  async function saveAdvisor(clearApiKey = false) {
    if (!token || !advisorModel.trim() || !advisorInstructions.trim()) return
    if (clearApiKey && !window.confirm('Remove the stored OpenAI key and disable Hub Ask?')) return
    setAdvisorBusy(true)
    try {
      const updated = await hubAdvisorConfigurationApi.update({
        enabled: clearApiKey ? false : advisorEnabled,
        model: advisorModel.trim(),
        instructions: advisorInstructions.trim(),
        ...(advisorApiKey.trim() ? { api_key: advisorApiKey.trim() } : {}),
        ...(clearApiKey ? { clear_api_key: true } : {}),
      }, token)
      await advisor.mutate(updated, { revalidate: false })
      setAdvisorApiKey('')
      toast.success(clearApiKey ? 'Hub advisor credential removed.' : 'Hub advisor configuration updated.')
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Could not update the Hub advisor.')
    } finally {
      setAdvisorBusy(false)
    }
  }

  if (isLoading || advisor.isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
  if (error || advisor.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The platform settings could not be loaded.</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="hub-advisor-title">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700" aria-hidden="true"><Bot size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Hub agent</p>
            <h1 id="hub-advisor-title" className="mt-1 text-2xl font-black text-gray-950">Learner advisor</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">Platform-wide settings used by Hub Ask. The API key stays on the server and is never shown again after saving.</p>
          </div>
        </div>

        <div className="mt-7 space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-4">
            <div>
              <label htmlFor="hub-advisor-enabled" className="text-sm font-bold text-gray-900">Enable Hub Ask</label>
              <p className="mt-1 text-xs leading-5 text-gray-500">Learners can use the advisor only when it is enabled and a key is configured.</p>
            </div>
            <Switch id="hub-advisor-enabled" checked={advisorEnabled} onCheckedChange={setAdvisorEnabled} aria-label="Enable Hub Ask" />
          </div>

          <label className="block">
            <span className="text-sm font-bold text-gray-900">Provider</span>
            <Input value="OpenAI" disabled className="mt-2 h-11 rounded-xl" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-900">Model</span>
            <Input value={advisorModel} onChange={(event) => setAdvisorModel(event.target.value)} maxLength={200} autoComplete="off" className="mt-2 h-11 rounded-xl" />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-900">Agent instructions</span>
            <Textarea value={advisorInstructions} onChange={(event) => setAdvisorInstructions(event.target.value)} maxLength={20000} rows={9} className="mt-2 resize-y rounded-xl leading-6" />
          </label>
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><KeyRound size={15} aria-hidden="true" />OpenAI API key</span>
            <Input type="password" value={advisorApiKey} onChange={(event) => setAdvisorApiKey(event.target.value)} minLength={20} maxLength={512} autoComplete="new-password" placeholder={advisor.data?.api_key_configured ? 'Configured — enter a new key to replace it' : 'Enter an API key'} className="mt-2 h-11 rounded-xl" />
            <span className="mt-2 block text-xs text-gray-500">{advisor.data?.api_key_configured ? 'A credential is configured. Leaving this blank keeps it unchanged.' : 'No credential is configured.'}</span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
          <div className="text-xs text-gray-500" aria-live="polite">{advisor.data?.enabled ? 'Hub Ask is enabled.' : 'Hub Ask is disabled.'}</div>
          <div className="flex flex-wrap gap-2">
            {advisor.data?.api_key_configured ? <Button type="button" variant="outline" onClick={() => void saveAdvisor(true)} disabled={advisorBusy}><Trash2 size={15} />Remove key</Button> : null}
            <Button type="button" onClick={() => void saveAdvisor()} disabled={advisorBusy || !advisorModel.trim() || !advisorInstructions.trim() || (!!advisorApiKey.trim() && advisorApiKey.trim().length < 20) || (advisorEnabled && !advisor.data?.api_key_configured && !advisorApiKey.trim())}>{advisorBusy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save advisor</Button>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Account messaging</p>
          <h2 className="mt-1 text-2xl font-black text-gray-950">New-account welcome message</h2>
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
