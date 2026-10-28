'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { KeyRound, Loader2, Save, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { getAPIUrl } from '@services/config/config'
import { PlatformKey, savePlatformKey } from '@services/platform/platform'
import { swrFetcher } from '@services/utils/ts/requests'

const PURPOSE: Record<string, string> = {
  pexels: 'Free stock photos and videos in the media picker and the connector, for every organization.',
}

/** Platform-wide API keys (Pexels for now). Saved encrypted; only the last four characters come back. */
export default function PlatformKeys({ token }: { token?: string }) {
  const url = token ? `${getAPIUrl()}superadmin/settings/keys` : null
  const { data, mutate } = useSWR<PlatformKey[]>(url, (key: string) => swrFetcher(key, token))
  if (!data?.length) return null
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Integrations</p>
      <h2 className="mt-1 text-2xl font-black text-gray-950">API keys</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">Keys are stored encrypted and never shown again after saving.</p>
      <div className="mt-6 divide-y divide-black/10">
        {data.map((item) => <KeyRow key={item.key} item={item} token={token} onSaved={(rows) => void mutate(rows, { revalidate: false })} />)}
      </div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
type OnSaved = (rows: PlatformKey[]) => void

function KeyRow({ item, token, onSaved }: { item: PlatformKey; token?: string; onSaved: OnSaved }) {
  const [value, setValue] = React.useState('')
  const [busy, setBusy] = React.useState<'save' | 'remove' | null>(null)
  const status = item.source === 'platform' ? `Saved, ending in ${item.last4}` : item.source === 'environment' ? `Using ${item.env} from the server’s environment` : 'Not set'

  async function run(next: string, kind: 'save' | 'remove') {
    if (!token) return
    setBusy(kind)
    try {
      onSaved(await savePlatformKey(item.key, next, token))
      setValue('')
      toast.success(kind === 'save' ? `${item.label} key saved.` : `${item.label} key removed.`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the key.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><KeyRound size={15} aria-hidden="true" />{item.label}</span>
        <span className={item.source === 'none' ? 'text-xs font-semibold text-amber-700' : 'text-xs text-gray-500'}>{status}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{PURPOSE[item.key]} <a href={item.help_url} target="_blank" rel="noreferrer" className="font-semibold underline">Get a key</a></p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (value.trim()) void run(value, 'save') }}>
        <input type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder={item.source === 'platform' ? 'Paste a new key to replace it' : 'Paste the key'}
          aria-label={`${item.label} key`} className="h-10 min-w-0 flex-1 rounded-xl border border-black/15 px-3 text-sm outline-none focus:border-black" />
        <button type="submit" disabled={busy !== null || !value.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-40">
          {busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save
        </button>
        {item.source === 'platform' ? <button type="button" onClick={() => void run('', 'remove')} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/15 px-4 text-sm font-bold text-gray-700 disabled:opacity-40">
          {busy === 'remove' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}Remove
        </button> : null}
      </form>
    </div>
  )
}
