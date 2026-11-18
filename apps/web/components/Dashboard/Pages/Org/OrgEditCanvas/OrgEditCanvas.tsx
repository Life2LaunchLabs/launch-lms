'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Copy } from '@phosphor-icons/react'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { getCanvasSettings, saveCanvasSettings, type CanvasSettings } from '@services/canvas/canvas'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Couldn’t copy. Select the address and copy it yourself.')
    }
  }
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 flex max-w-2xl gap-2">
        <Input readOnly value={value} aria-label={label} onFocus={(event) => event.currentTarget.select()} className="min-w-0 font-mono text-sm" />
        <Button type="button" variant="surface" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
    </div>
  )
}

function confirmedOn(stamp: string | null) {
  if (!stamp) return ''
  const date = new Date(stamp.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formFrom({ connection }: CanvasSettings) {
  return {
    canvas_host: connection?.canvas_host || '',
    client_id: connection?.client_id || '',
    deployment_ids: (connection?.deployment_ids || []).join('\n'),
    issuer: connection?.issuer || '',
    enabled: Boolean(connection?.enabled),
    ages_confirmed: Boolean(connection?.ages_confirmed),
  }
}

/** Organization › Canvas: what the school's Canvas admin needs, what they paste back, and the switch (OP-1). */
export default function OrgEditCanvas() {
  const { orgId, token, isOwnerAdmin } = usePeopleContext()
  const { data, error, mutate } = useSWR<CanvasSettings>(
    token && orgId && isOwnerAdmin ? ['canvas-settings', orgId, token] : null,
    () => getCanvasSettings(orgId, token),
    { revalidateOnFocus: false },
  )
  const [form, setForm] = React.useState({ canvas_host: '', client_id: '', deployment_ids: '', issuer: '', enabled: false, ages_confirmed: false })
  const [saving, setSaving] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (!data || loaded.current) return
    loaded.current = true
    setForm(formFrom(data))
  }, [data])

  const confirmedBefore = Boolean(data?.connection?.ages_confirmed)
  const set = (patch: Partial<typeof form>) => { setProblem(null); setForm((current) => ({ ...current, ...patch })) }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setProblem(null)
    try {
      const saved = await saveCanvasSettings(orgId, { ...form, issuer: form.issuer || null }, token)
      await mutate(saved, { revalidate: false })
      setForm(formFrom(saved))
      toast.success(saved.connection?.enabled ? 'Canvas is connected' : 'Saved. Canvas stays switched off.')
    } catch (reason: any) {
      setProblem(reason?.message || 'That didn’t save. Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  const status = data?.connection?.enabled ? 'On' : data?.connection ? 'Off' : 'Not set up'

  return (
    <div className="mx-0 rounded-xl bg-white nice-shadow sm:mx-10">
      <div className="mx-3 my-3 flex flex-col gap-1 rounded-md bg-gray-50 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col -space-y-1">
          <h1 className="text-xl font-bold text-gray-800">Canvas</h1>
          <h2 className="text-base text-gray-500">Students and teachers open Life2Launch from a Canvas course and are signed in right there.</h2>
        </div>
        {data ? (
          <span className={`mt-1 inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.connection?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {status}
          </span>
        ) : null}
      </div>

      {!isOwnerAdmin ? (
        <p className="px-5 pb-5 text-sm text-gray-600">Only admins can connect Canvas. Ask an admin of your organization.</p>
      ) : error ? (
        <p role="alert" className="px-5 pb-5 text-sm text-gray-600">Couldn’t load this page. Try again in a moment.</p>
      ) : !data ? (
        <div className="mx-5 mb-5 h-64 animate-pulse rounded-lg bg-gray-100" aria-label="Loading" />
      ) : (
        <form className="space-y-8 px-5 pb-6" onSubmit={(event) => void save(event)}>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">1. Give your Canvas admin this address</h3>
            <p className="text-sm text-gray-600">
              In Canvas, they open Admin › Developer Keys, add an LTI key, choose <strong>Enter URL</strong> and paste it. Then they switch the key on and add the app to your account by its client id.
            </p>
            <CopyRow label="Configuration address" value={data.tool.config_url} />
            <details className="group max-w-2xl rounded-lg border border-gray-100 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">If they ask for each address</summary>
              <div className="mt-3 space-y-3">
                <CopyRow label="Login address (OpenID Connect initiation)" value={data.tool.login_url} />
                <CopyRow label="Launch address (target link and redirect)" value={data.tool.launch_url} />
                <CopyRow label="Public key address (JWK set)" value={data.tool.jwks_url} />
              </div>
            </details>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">2. Paste what Canvas gives back</h3>
            <div className="grid max-w-2xl gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="canvas-host">Your Canvas address</Label>
                <Input id="canvas-host" value={form.canvas_host} placeholder="school.instructure.com" autoComplete="off"
                  onChange={(event) => set({ canvas_host: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="canvas-client-id">Client id</Label>
                <Input id="canvas-client-id" value={form.client_id} placeholder="10000000000042" inputMode="numeric" autoComplete="off"
                  onChange={(event) => set({ client_id: event.target.value })} />
                <p className="text-xs text-gray-500">The number Canvas shows under Details for the developer key.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="canvas-deployments">Deployment id</Label>
                <textarea id="canvas-deployments" value={form.deployment_ids} rows={2} placeholder="7:2a1b9c…"
                  onChange={(event) => set({ deployment_ids: event.target.value })}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <p className="text-xs text-gray-500">From the app’s settings menu in Canvas, Deployment Id. Put each on its own line if there are several.</p>
              </div>
              <details className="rounded-lg border border-gray-100 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Advanced</summary>
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="canvas-issuer">Issuer</Label>
                  <Input id="canvas-issuer" value={form.issuer} placeholder="https://canvas.instructure.com" autoComplete="off"
                    onChange={(event) => set({ issuer: event.target.value })} />
                  <p className="text-xs text-gray-500">Leave it as it is unless your school runs its own Canvas with a different issuer.</p>
                </div>
              </details>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">3. Switch it on</h3>
            {confirmedBefore ? (
              <p className="flex max-w-2xl gap-2 text-sm text-gray-700">
                <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-emerald-600" />
                You confirmed the courses using Life2Launch are for students 13 and over{confirmedOn(data.connection?.ages_confirmed_at || null) ? ` (${confirmedOn(data.connection?.ages_confirmed_at || null)})` : ''}.
              </p>
            ) : (
              <div className="flex max-w-2xl items-start gap-3">
                <Checkbox id="canvas-ages" checked={form.ages_confirmed} className="mt-0.5"
                  onCheckedChange={(checked) => set({ ages_confirmed: checked === true })} />
                <Label htmlFor="canvas-ages" className="text-sm font-normal leading-snug text-gray-700">
                  The Canvas courses using Life2Launch are for students 13 and over.
                </Label>
              </div>
            )}
            <div className="flex max-w-2xl items-center justify-between gap-4 rounded-lg border border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <Label htmlFor="canvas-enabled" className="text-sm font-semibold text-gray-900">Open from Canvas</Label>
                <p className="text-xs text-gray-500">
                  {form.enabled ? 'Students and teachers can open Life2Launch from your Canvas courses.' : 'While it’s off, opening Life2Launch from Canvas says your school isn’t connected.'}
                </p>
              </div>
              <Switch id="canvas-enabled" checked={form.enabled} onCheckedChange={(checked) => set({ enabled: checked })} />
            </div>
            {problem ? <p role="alert" className="max-w-2xl text-sm text-destructive">{problem}</p> : null}
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </section>
        </form>
      )}
    </div>
  )
}
