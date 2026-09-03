'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Bot, ChevronDown, ExternalLink, HelpCircle, KeyRound, Loader2, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { WelcomeMessageTemplate, welcomeMessageTemplateApi } from '@services/messages/messages'
import { swrFetcher } from '@services/utils/ts/requests'
import {
  HubAdvisorAdvancedConfiguration,
  HubAdvisorConfiguration,
  HubAdvisorProvider,
  hubAdvisorConfigurationApi,
} from '@services/hub/configuration'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip'

const providerNames: Record<HubAdvisorProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }
const providerKeyLinks: Record<HubAdvisorProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded text-gray-400 hover:text-gray-700" aria-label="More information"><HelpCircle size={15} /></button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 leading-5">{children}</TooltipContent>
    </Tooltip>
  )
}

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
  const [advisorProvider, setAdvisorProvider] = React.useState<HubAdvisorProvider>('openai')
  const [advisorModel, setAdvisorModel] = React.useState('')
  const [advisorInstructions, setAdvisorInstructions] = React.useState('')
  const [advisorAdvanced, setAdvisorAdvanced] = React.useState<HubAdvisorAdvancedConfiguration>({
    max_output_tokens: 700,
    reasoning_effort: 'default',
    verbosity: 'default',
    thinking_effort: 'default',
  })
  const [advisorApiKey, setAdvisorApiKey] = React.useState('')
  const [advisorBusy, setAdvisorBusy] = React.useState(false)
  const catalogKey = token ? [`hub-advisor-models`, advisorProvider, token] : null
  const catalog = useSWR(catalogKey, () => hubAdvisorConfigurationApi.models(advisorProvider, token))
  const activeProviderConfiguration = advisor.data?.provider_configurations[advisorProvider]

  React.useEffect(() => {
    if (!data) return
    setSubject(data.subject)
    setBody(data.body)
  }, [data])

  React.useEffect(() => {
    if (!advisor.data) return
    setAdvisorEnabled(advisor.data.enabled)
    setAdvisorProvider(advisor.data.provider)
    setAdvisorInstructions(advisor.data.instructions)
  }, [advisor.data])

  React.useEffect(() => {
    const providerConfiguration = advisor.data?.provider_configurations[advisorProvider]
    if (!providerConfiguration) return
    setAdvisorModel(providerConfiguration.model)
    setAdvisorAdvanced(providerConfiguration.advanced)
    setAdvisorApiKey('')
  }, [advisor.data, advisorProvider])

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
    if (clearApiKey && !window.confirm(`Remove the stored ${providerNames[advisorProvider]} key and disable Hub Ask?`)) return
    setAdvisorBusy(true)
    try {
      const updated = await hubAdvisorConfigurationApi.update({
        provider: advisorProvider,
        enabled: clearApiKey ? false : advisorEnabled,
        model: advisorModel.trim(),
        instructions: advisorInstructions.trim(),
        advanced: advisorAdvanced,
        ...(advisorApiKey.trim() ? { api_key: advisorApiKey.trim() } : {}),
        ...(clearApiKey ? { clear_api_key: true } : {}),
      }, token)
      await advisor.mutate(updated, { revalidate: false })
      setAdvisorApiKey('')
      await catalog.mutate()
      toast.success(clearApiKey ? `${providerNames[advisorProvider]} credential removed.` : 'Hub advisor configuration updated.')
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Could not update the Hub advisor.')
    } finally {
      setAdvisorBusy(false)
    }
  }

  const selectedModel = catalog.data?.models.find((model) => model.id === advisorModel)
  const canSaveAdvisor = !!advisorModel.trim() && !!advisorInstructions.trim()
    && (!advisorApiKey.trim() || advisorApiKey.trim().length >= 20)
    && (!advisorEnabled || !!activeProviderConfiguration?.api_key_configured || !!advisorApiKey.trim())
    && advisorAdvanced.max_output_tokens >= 128 && advisorAdvanced.max_output_tokens <= 4000

  if (isLoading || advisor.isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
  if (error || advisor.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The platform settings could not be loaded.</div>

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="hub-advisor-title">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-violet-100 p-2 text-violet-700" aria-hidden="true"><Bot size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Hub agent</p>
              <h1 id="hub-advisor-title" className="mt-1 text-2xl font-black text-gray-950">Learner advisor</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">Platform-wide settings used by Hub Ask. Provider keys stay encrypted on the server and are never shown again after saving.</p>
            </div>
          </div>

          <div className="mt-7 space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-4">
              <div>
                <label htmlFor="hub-advisor-enabled" className="text-sm font-bold text-gray-900">Enable Hub Ask</label>
                <p className="mt-1 text-xs leading-5 text-gray-500">Learners can use the advisor only when the selected provider has a key.</p>
              </div>
              <Switch id="hub-advisor-enabled" checked={advisorEnabled} onCheckedChange={setAdvisorEnabled} aria-label="Enable Hub Ask" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">Provider <Help>Choose the company that will process Hub Ask messages. Each provider keeps its own API key and model settings.</Help></span>
                <Select value={advisorProvider} onValueChange={(value) => setAdvisorProvider(value as HubAdvisorProvider)}>
                  <SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent>
                </Select>
              </label>
              <label className="block">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">Model <Help>Models vary in quality, speed, and price. Recommended options are chosen for short learner guidance.</Help></span>
                <div className="mt-2 flex gap-2">
                  <Select value={advisorModel} onValueChange={setAdvisorModel}>
                    <SelectTrigger className="h-11 min-w-0 flex-1 rounded-xl"><SelectValue placeholder="Choose a model" /></SelectTrigger>
                    <SelectContent>
                      {catalog.data?.models.map((model) => <SelectItem key={model.id} value={model.id} disabled={model.available === false}>{model.name}{model.available === false ? ' — unavailable' : ''}</SelectItem>)}
                      {advisorModel && !catalog.data?.models.some((model) => model.id === advisorModel) ? <SelectItem value={advisorModel}>{advisorModel}</SelectItem> : null}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={() => void catalog.mutate()} disabled={catalog.isLoading} aria-label="Refresh available models"><RefreshCw size={15} className={catalog.isLoading ? 'animate-spin' : ''} /></Button>
                </div>
                <span className="mt-2 block text-xs leading-5 text-gray-500">{selectedModel?.description || (catalog.data?.source === 'live' ? 'Available to this API key.' : 'Save an API key to check account availability.')}{activeProviderConfiguration?.api_key_configured && catalog.data?.source === 'curated' ? ' Live availability could not be verified.' : ''}</span>
              </label>
            </div>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><KeyRound size={15} aria-hidden="true" />{providerNames[advisorProvider]} API key <Help>Use a server-side API key—not a ChatGPT or Claude password. API usage is billed separately by the provider.</Help></span>
              <Input type="password" value={advisorApiKey} onChange={(event) => setAdvisorApiKey(event.target.value)} minLength={20} maxLength={512} autoComplete="new-password" placeholder={activeProviderConfiguration?.api_key_configured ? 'Configured — enter a new key to replace it' : 'Enter an API key'} className="mt-2 h-11 rounded-xl" />
              <span className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                {activeProviderConfiguration?.api_key_configured ? 'A credential is configured. Leaving this blank keeps it unchanged.' : 'No credential is configured.'}
                <a href={providerKeyLinks[advisorProvider]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline">Create a key <ExternalLink size={11} /></a>
              </span>
            </label>

            <details className="group rounded-xl border border-black/10 bg-gray-50/70">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-gray-900">Advanced configuration <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
              <div className="grid gap-5 border-t border-black/10 p-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-gray-900">Maximum response tokens</span>
                  <Input type="number" min={128} max={4000} value={advisorAdvanced.max_output_tokens} onChange={(event) => setAdvisorAdvanced((current) => ({ ...current, max_output_tokens: Number(event.target.value) }))} className="mt-2 h-11 rounded-xl" />
                  <span className="mt-2 block text-xs leading-5 text-gray-500">Caps response length and cost. Default: 700.</span>
                </label>
                {advisorProvider === 'openai' ? <>
                  <AdvancedSelect label="Reasoning effort" value={advisorAdvanced.reasoning_effort} values={['default', 'none', 'low', 'medium', 'high', 'xhigh']} onChange={(value) => setAdvisorAdvanced((current) => ({ ...current, reasoning_effort: value as HubAdvisorAdvancedConfiguration['reasoning_effort'] }))} help="Higher effort can improve difficult answers but increases latency and token use. Support depends on the model." />
                  <AdvancedSelect label="Response verbosity" value={advisorAdvanced.verbosity} values={['default', 'low', 'medium', 'high']} onChange={(value) => setAdvisorAdvanced((current) => ({ ...current, verbosity: value as HubAdvisorAdvancedConfiguration['verbosity'] }))} help="Controls answer detail separately from reasoning effort. Support depends on the model." />
                </> : <AdvancedSelect label="Thinking effort" value={advisorAdvanced.thinking_effort} values={['default', 'low', 'medium', 'high', 'xhigh', 'max']} onChange={(value) => setAdvisorAdvanced((current) => ({ ...current, thinking_effort: value as HubAdvisorAdvancedConfiguration['thinking_effort'] }))} help="Lets supported Claude models trade latency and cost for deeper reasoning." />}
              </div>
            </details>

            <div className="border-t border-black/10 pt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Agent behavior</p>
              <label className="mt-3 block">
                <span className="text-sm font-bold text-gray-900">Instructions</span>
                <Textarea value={advisorInstructions} onChange={(event) => setAdvisorInstructions(event.target.value)} maxLength={20000} rows={9} className="mt-2 resize-y rounded-xl leading-6" />
                <span className="mt-2 block text-xs text-gray-500">These instructions apply whichever provider is selected.</span>
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
            <div className="text-xs text-gray-500" aria-live="polite">{advisor.data?.enabled ? `Hub Ask is enabled with ${providerNames[advisor.data.provider]}.` : 'Hub Ask is disabled.'}</div>
            <div className="flex flex-wrap gap-2">
              {activeProviderConfiguration?.api_key_configured ? <Button type="button" variant="outline" onClick={() => void saveAdvisor(true)} disabled={advisorBusy}><Trash2 size={15} />Remove {providerNames[advisorProvider]} key</Button> : null}
              <Button type="button" onClick={() => void saveAdvisor()} disabled={advisorBusy || !canSaveAdvisor}>{advisorBusy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save advisor</Button>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <div><p className="text-xs font-bold uppercase tracking-wider text-gray-500">Account messaging</p><h2 className="mt-1 text-2xl font-black text-gray-950">New-account welcome message</h2><p className="mt-2 text-sm leading-6 text-gray-600">Sent from the owner organization to every newly created account. Changes apply only to future messages.</p></div>
          <div className="mt-7 space-y-5">
            <label className="block"><span className="text-sm font-bold text-gray-900">Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="mt-2 h-11 w-full rounded-xl border border-black/15 px-3 text-sm outline-none focus:border-black" /></label>
            <label className="block"><span className="text-sm font-bold text-gray-900">Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={7} className="mt-2 w-full resize-y rounded-xl border border-black/15 p-3 text-sm leading-6 outline-none focus:border-black" /></label>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
            <p className="text-xs text-gray-500">{data?.customized ? 'Using customized copy.' : 'Using the Launch LMS default copy.'}</p>
            <div className="flex gap-2"><button type="button" onClick={() => void reset()} disabled={busy !== null || !data?.customized} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/15 px-4 text-sm font-bold text-gray-700 disabled:opacity-40"><RotateCcw size={15} />Reset</button><button type="button" onClick={() => void save()} disabled={busy !== null || !subject.trim() || !body.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-40">{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save</button></div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

function AdvancedSelect({ label, value, values, onChange, help }: { label: string; value: string; values: string[]; onChange: (value: string) => void; help: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-900">{label}</span>
      <Select value={value} onValueChange={onChange}><SelectTrigger className="mt-2 h-11 rounded-xl capitalize"><SelectValue /></SelectTrigger><SelectContent>{values.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent></Select>
      <span className="mt-2 block text-xs leading-5 text-gray-500">{help}</span>
    </label>
  )
}
