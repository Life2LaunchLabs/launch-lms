'use client'

import React from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { ExternalLink, KeyRound, Loader2, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import {
  COACH_POLICY_PATH,
  COACH_TIERS,
  PROVIDER_NAMES,
  coachAdminApi,
  type CoachKey,
  type CoachModelSettings,
  type CoachPolicy,
  type CoachProvider,
  type CoachTier,
} from '@services/coach/admin'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'
import { TIER_LABELS } from './CoachRoutines'

const KEY_LINKS: Record<CoachProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
}
const TIER_DESCRIPTIONS: Record<CoachTier, string> = {
  fast: 'Quick, low-cost background work.',
  standard: 'Coach’s everyday model. Every other tier falls back to it.',
  deep: 'For moments that need more care. Assign it from Routines.',
}
const USE_STANDARD = '__standard__'

type TierDraft = { key_uuid: string; model: string; settings: CoachModelSettings }

export default function CoachModel({ policy }: { policy: CoachPolicy }) {
  return (
    <div className="space-y-4">
      <EnablePanel policy={policy} />
      <KeysPanel policy={policy} />
      <TiersPanel key={JSON.stringify(policy.tiers)} policy={policy} />
    </div>
  )
}

function EnablePanel({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const [busy, setBusy] = React.useState(false)
  const ready = Boolean(policy.tiers.standard.key_uuid && policy.tiers.standard.model)

  async function toggle(enabled: boolean) {
    setBusy(true)
    try {
      await mutate(await coachAdminApi.update({ enabled }, token), { revalidate: false })
      toast.success(enabled ? 'Coach is on for learners.' : 'Coach is off. Everything else still works.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change Coach.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Coach for learners"
      description={ready ? 'When off, Coach doesn’t reply in chat, check-in notes and finish stories use fixed wording, and everything else keeps working.' : 'Add a key and give the Standard tier a model to turn Coach on.'}
      actions={<Switch checked={policy.enabled} disabled={busy || (!ready && !policy.enabled)} onCheckedChange={(enabled) => void toggle(enabled)} aria-label="Coach for learners" />}
    />
  )
}

function KeysPanel({ policy }: { policy: CoachPolicy }) {
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const inUse = (key: CoachKey) => COACH_TIERS.filter((tier) => policy.tiers[tier].key_uuid === key.key_uuid).map((tier) => TIER_LABELS[tier])

  return (
    <Panel
      title="API keys"
      description="Keys are encrypted on the server and never shown again after saving. Add several to keep work or billing separate; each tier picks one."
      actions={<Button type="button" variant="outline" onClick={() => setAdding(true)} disabled={adding}><Plus size={15} />Add key</Button>}
    >
      <ul className="space-y-2">
        {adding ? <li><KeyForm onDone={() => setAdding(false)} /></li> : null}
        {policy.keys.map((key) => editing === key.key_uuid ? (
          <li key={key.key_uuid}><KeyForm existing={key} onDone={() => setEditing(null)} /></li>
        ) : (
          <li key={key.key_uuid} className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3">
            <KeyRound size={16} className="text-gray-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-950">{key.label}</p>
              <p className="text-xs text-gray-500">{PROVIDER_NAMES[key.provider]} · {key.last_four ? `ends ${key.last_four}` : 'saved'}{inUse(key).length ? ` · used by ${inUse(key).join(', ')}` : ' · not used yet'}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(key.key_uuid)} aria-label={`Edit ${key.label}`}><Pencil size={15} /></Button>
            <DeleteKey keyItem={key} />
          </li>
        ))}
      </ul>
      {!policy.keys.length && !adding ? <p className="text-sm text-gray-500">No keys yet. Add an OpenAI or Anthropic key to get started.</p> : null}
    </Panel>
  )
}

function DeleteKey({ keyItem }: { keyItem: CoachKey }) {
  const { mutate, token } = useCoachPolicy()
  const [busy, setBusy] = React.useState(false)
  async function remove() {
    if (!window.confirm(`Delete ${keyItem.label}?`)) return
    setBusy(true)
    try {
      await coachAdminApi.deleteKey(keyItem.key_uuid, token)
      await mutate()
      toast.success('Key deleted.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete the key.'))
      setBusy(false)
    }
  }
  return <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} disabled={busy} aria-label={`Delete ${keyItem.label}`}>{busy ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}</Button>
}

function KeyForm({ existing, onDone }: { existing?: CoachKey; onDone: () => void }) {
  const { mutate, token } = useCoachPolicy()
  const [provider, setProvider] = React.useState<CoachProvider>(existing?.provider || 'openai')
  const [label, setLabel] = React.useState(existing?.label || '')
  const [secret, setSecret] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const secretOk = existing ? !secret.trim() || secret.trim().length >= 20 : secret.trim().length >= 20

  async function save() {
    setBusy(true)
    try {
      if (existing) await coachAdminApi.updateKey(existing.key_uuid, { label: label.trim(), ...(secret.trim() ? { api_key: secret.trim() } : {}) }, token)
      else await coachAdminApi.createKey({ provider, label: label.trim(), api_key: secret.trim() }, token)
      await mutate()
      toast.success(existing ? 'Key updated.' : 'Key added.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the key.'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <label className="block"><span className="text-sm font-bold text-gray-900">Provider</span>
          <Select value={provider} onValueChange={(value) => setProvider(value as CoachProvider)} disabled={Boolean(existing)}>
            <SelectTrigger className="mt-2 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="anthropic">Anthropic</SelectItem></SelectContent>
          </Select></label>
        <label className="block"><span className="text-sm font-bold text-gray-900">Label</span>
          <Input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={`${PROVIDER_NAMES[provider]} production`} className="mt-2 bg-white" /></label>
      </div>
      <label className="block"><span className="text-sm font-bold text-gray-900">{existing ? 'Replace the key (optional)' : 'API key'}</span>
        <Input type="password" value={secret} minLength={20} maxLength={512} autoComplete="new-password" onChange={(event) => setSecret(event.target.value)} placeholder={existing ? 'Leave blank to keep the saved key' : 'Paste a server-side API key'} className="mt-2 bg-white" /></label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={KEY_LINKS[provider]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline">Create a {PROVIDER_NAMES[provider]} key <ExternalLink size={11} /></a>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !label.trim() || !secretOk}>{busy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}{existing ? 'Save key' : 'Add key'}</Button>
        </div>
      </div>
    </div>
  )
}

function TiersPanel({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const initial = React.useMemo(() => Object.fromEntries(COACH_TIERS.map((tier) => [tier, {
    key_uuid: policy.tiers[tier].key_uuid, model: policy.tiers[tier].model, settings: policy.tiers[tier].settings,
  }])) as Record<CoachTier, TierDraft>, [policy.tiers])
  const [drafts, setDrafts] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial)
  const problem = COACH_TIERS.map((tier) => {
    const draft = drafts[tier]
    if (draft.key_uuid && !draft.model.trim()) return `Choose a model for ${TIER_LABELS[tier]}.`
    if (draft.settings.max_output_tokens < 128 || draft.settings.max_output_tokens > 4000) return `${TIER_LABELS[tier]}: response length must be 128 to 4,000 tokens.`
    return null
  }).find(Boolean) || (policy.enabled && !drafts.standard.key_uuid ? 'Coach is on, so Standard needs a key.' : null)

  async function save() {
    setBusy(true)
    try {
      await mutate(await coachAdminApi.update({ tiers: drafts }, token), { revalidate: false })
      toast.success('Model tiers saved.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the tiers.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Model tiers"
      description="Each tier runs on its own key and model. Routines choose a tier; a tier without a key uses Standard."
      actions={<Button type="button" onClick={() => void save()} disabled={busy || !dirty || Boolean(problem)}>{busy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save tiers</Button>}
    >
      <div className="space-y-4">
        {COACH_TIERS.map((tier) => (
          <TierCard key={tier} tier={tier} policy={policy} draft={drafts[tier]} onChange={(draft) => setDrafts((current) => ({ ...current, [tier]: draft }))} />
        ))}
      </div>
      {problem && dirty ? <p className="mt-3 text-xs text-red-700" role="alert">{problem}</p> : null}
    </Panel>
  )
}

function TierCard({ tier, policy, draft, onChange }: { tier: CoachTier; policy: CoachPolicy; draft: TierDraft; onChange: React.Dispatch<TierDraft> }) {
  const { token } = useCoachPolicy()
  const key = policy.keys.find((item) => item.key_uuid === draft.key_uuid)
  const catalog = useSWR(token && key ? [COACH_POLICY_PATH, 'models', key.key_uuid, token] : null, () => coachAdminApi.models(key!.key_uuid, token))
  const selected = catalog.data?.models.find((model) => model.id === draft.model)
  const uses = policy.tier_uses[tier] || []
  const setSettings = (patch: Partial<CoachModelSettings>) => onChange({ ...draft, settings: { ...draft.settings, ...patch } })

  return (
    <div className="rounded-xl border border-black/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black text-gray-950">{TIER_LABELS[tier]}</h3>
        <p className="text-xs text-gray-500">{TIER_DESCRIPTIONS[tier]}</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-gray-600">{uses.length ? `Runs: ${uses.join(' · ')}` : 'Nothing runs on this tier yet.'}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-xs font-bold text-gray-900">Key</span>
          <Select value={draft.key_uuid || (tier === 'standard' ? '' : USE_STANDARD)} onValueChange={(value) => onChange({ ...draft, key_uuid: value === USE_STANDARD ? '' : value, model: value === draft.key_uuid ? draft.model : '' })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a key" /></SelectTrigger>
            <SelectContent>
              {tier !== 'standard' ? <SelectItem value={USE_STANDARD}>Use Standard</SelectItem> : null}
              {policy.keys.map((item) => <SelectItem key={item.key_uuid} value={item.key_uuid}>{item.label} ({PROVIDER_NAMES[item.provider]})</SelectItem>)}
            </SelectContent>
          </Select></label>
        <label className="block"><span className="text-xs font-bold text-gray-900">Model</span>
          <div className="mt-1.5 flex gap-2">
            <Select value={draft.model} onValueChange={(model) => onChange({ ...draft, model })} disabled={!key}>
              <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={key ? 'Choose a model' : 'Same as Standard'} /></SelectTrigger>
              <SelectContent>
                {catalog.data?.models.map((model) => <SelectItem key={model.id} value={model.id} disabled={model.available === false}>{model.name}{model.available === false ? ' (not on this key)' : ''}</SelectItem>)}
                {draft.model && !catalog.data?.models.some((model) => model.id === draft.model) ? <SelectItem value={draft.model}>{draft.model}</SelectItem> : null}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => void catalog.mutate()} disabled={!key || catalog.isLoading} aria-label={`Refresh ${TIER_LABELS[tier]} models`}><RefreshCw size={14} className={catalog.isLoading ? 'animate-spin' : ''} /></Button>
          </div>
          {key ? <span className="mt-1.5 block text-xs leading-5 text-gray-500">{selected?.description || (catalog.data?.source === 'curated' ? 'Couldn’t check this key’s models; showing the usual choices.' : '')}</span> : null}
        </label>
      </div>
      {key ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="text-xs font-bold text-gray-900">Longest response (tokens)</span>
            <Input type="number" min={128} max={4000} value={draft.settings.max_output_tokens} onChange={(event) => setSettings({ max_output_tokens: Number(event.target.value) })} className="mt-1.5" /></label>
          {key.provider === 'openai' ? <>
            <SettingSelect label="Reasoning effort" value={draft.settings.reasoning_effort} values={['default', 'none', 'low', 'medium', 'high', 'xhigh']} onChange={(value) => setSettings({ reasoning_effort: value as CoachModelSettings['reasoning_effort'] })} />
            <SettingSelect label="Verbosity" value={draft.settings.verbosity} values={['default', 'low', 'medium', 'high']} onChange={(value) => setSettings({ verbosity: value as CoachModelSettings['verbosity'] })} />
          </> : <SettingSelect label="Thinking effort" value={draft.settings.thinking_effort} values={['default', 'low', 'medium', 'high', 'xhigh', 'max']} onChange={(value) => setSettings({ thinking_effort: value as CoachModelSettings['thinking_effort'] })} />}
        </div>
      ) : null}
    </div>
  )
}

function SettingSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: React.Dispatch<string> }) {
  return (
    <label className="block"><span className="text-xs font-bold text-gray-900">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5 capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>{values.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}
