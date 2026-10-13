'use client'

import React, { useEffect, useState } from 'react'
import { CheckCircle, PlugsConnected, WarningCircle } from '@phosphor-icons/react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Alert, AlertDescription } from '@components/ui/alert'
import {
  FeedbackJiraConnection as Connection, FeedbackJiraConnectionUpdate,
  getFeedbackJiraConnection, saveFeedbackJiraConnection, testFeedbackJiraConnection,
} from '@services/candidate/candidate'

const SOURCE_LABELS: Record<Connection['source'], string> = {
  platform: 'Saved in platform settings',
  environment: 'From environment variables',
  none: 'Not connected',
}

export default function FeedbackJiraConnection({ token, onSaved }: { token?: string; onSaved: () => void }) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [form, setForm] = useState<FeedbackJiraConnectionUpdate>({ enabled: true, base_url: '', email: '', project_key: '', issue_type: 'Task', board_id: '' })
  const [apiToken, setApiToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const apply = (value: Connection) => {
    setConnection(value)
    setForm({ enabled: value.enabled, base_url: value.base_url, email: value.email, project_key: value.project_key, issue_type: value.issue_type || 'Task', board_id: value.board_id })
    setApiToken('')
  }

  useEffect(() => {
    if (!token) return
    getFeedbackJiraConnection(token).then(apply).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the Jira connection'))
  }, [token])

  const payload = (): FeedbackJiraConnectionUpdate => ({ ...form, ...(apiToken.trim() ? { api_token: apiToken.trim() } : {}) })
  const set = (key: keyof FeedbackJiraConnectionUpdate) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const test = async () => {
    if (!token) return
    setBusy(true); setError(''); setNotice('')
    try {
      const outcome = await testFeedbackJiraConnection(payload(), token)
      setNotice(`Connected to ${outcome.project_name}${outcome.columns.length ? ` · columns: ${outcome.columns.join(', ')}` : ''}`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not reach Jira') }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!token) return
    setBusy(true); setError(''); setNotice('')
    try { apply(await saveFeedbackJiraConnection(payload(), token)); setNotice('Saved. Feedback now uses this board.'); onSaved() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the Jira connection') }
    finally { setBusy(false) }
  }

  const connected = connection && connection.source !== 'none' && connection.enabled
  return <details className="rounded-2xl border border-black/10 bg-white shadow-sm" open={connection ? !connected : undefined}>
    <summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-bold text-gray-950">
      <PlugsConnected className="text-sky-600" />Jira board
      {connection ? <Badge variant="outline">{connection.enabled ? `${connection.project_key || '—'} · ${SOURCE_LABELS[connection.source]}` : 'Disabled'}</Badge> : null}
    </summary>
    <div className="space-y-4 border-t border-black/10 p-5">
      {connection?.source === 'environment' ? <p className="text-sm text-gray-500">This build reads its Jira connection from environment variables. Save here to manage it live; saved settings take precedence.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-bold text-gray-600">Jira site URL<Input className="mt-2" value={form.base_url} onChange={set('base_url')} placeholder="https://your-team.atlassian.net" /></label>
        <label className="text-xs font-bold text-gray-600">Project key<Input className="mt-2" value={form.project_key} onChange={set('project_key')} placeholder="FEED" /></label>
        <label className="text-xs font-bold text-gray-600">Account email<Input className="mt-2" type="email" value={form.email} onChange={set('email')} autoComplete="off" /></label>
        <label className="text-xs font-bold text-gray-600">API token<Input className="mt-2" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="new-password" placeholder={connection?.has_api_token ? 'Configured — enter a new token to replace it' : 'Atlassian API token'} /></label>
        <label className="text-xs font-bold text-gray-600">Issue type<Input className="mt-2" value={form.issue_type} onChange={set('issue_type')} placeholder="Task" /></label>
        <label className="text-xs font-bold text-gray-600">Board ID <span className="font-normal text-gray-400">(optional — defaults to the project's kanban board)</span><Input className="mt-2" value={form.board_id} onChange={set('board_id')} /></label>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium text-gray-700"><Switch checked={form.enabled} onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))} aria-label="Accept tester feedback" />Accept tester feedback</label>
      {error ? <Alert variant="destructive"><WarningCircle /><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <p className="flex items-center gap-2 text-sm font-medium text-green-700"><CheckCircle />{notice}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void test()}>Test connection</Button>
        <Button disabled={busy} onClick={() => void save()}>Save connection</Button>
      </div>
    </div>
  </details>
}
