'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Copy } from '@phosphor-icons/react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { disconnectApp, getConnectorInfo, listAppConnections, type AppConnection } from '@services/oauth/oauth'

function lastUsed(connection: AppConnection) {
  if (!connection.last_used_at) return 'Not used yet'
  return `Last used ${new Date(connection.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/** Organization › Connect Claude: the server address to paste into Claude, what Claude can do here, and this person's connections. */
export default function OrgConnectClaude() {
  const { orgId, token, isAdmin } = usePeopleContext()
  const { data: info, error } = useSWR(token ? ['oauth-connector', token] : null, () => getConnectorInfo(token), { revalidateOnFocus: false })
  const { data: connections, mutate } = useSWR(token && isAdmin ? ['oauth-connections', token] : null, () => listAppConnections(token))
  const [copied, setCopied] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const here = (connections || []).filter((connection) => connection.org_id === orgId)

  const copy = async () => {
    if (!info) return
    try {
      await navigator.clipboard.writeText(info.server_url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Couldn’t copy. Select the address and copy it yourself.')
    }
  }

  const disconnect = async (connection: AppConnection) => {
    setRemoving(connection.connection_id)
    try {
      await disconnectApp(connection.connection_id, token)
      await mutate()
      toast.success(`${connection.client_name} is disconnected`)
    } catch (reason: any) {
      toast.error(reason?.message || 'That didn’t disconnect')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="mx-0 rounded-xl bg-white nice-shadow sm:mx-10">
      <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-gray-50 px-5 py-3">
        <h1 className="text-xl font-bold text-gray-800">Connect Claude</h1>
        <h2 className="text-base text-gray-500">Claude, Anthropic’s AI assistant, can build in your organization for you when you ask it to in a chat.</h2>
      </div>

      {error ? (
        <p role="alert" className="px-5 pb-5 text-sm text-gray-600">Couldn’t load this page. Try again in a moment.</p>
      ) : !info ? (
        <div className="mx-5 mb-5 h-40 animate-pulse rounded-lg bg-gray-100" aria-label="Loading" />
      ) : !info.enabled ? (
        <p className="px-5 pb-5 text-sm text-gray-600">Connecting Claude is turned off on this site.</p>
      ) : (
        <div className="space-y-6 px-5 pb-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-900">What Claude can do here</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              {info.abilities.map((line) => (
                <li key={line} className="flex gap-2"><Check size={16} weight="bold" className="mt-0.5 shrink-0 text-emerald-600" />{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-gray-500">It works only in the organization you pick when you connect, with your access. Changes start as drafts, and Claude publishes only when you ask.</p>
          </section>

          {isAdmin ? (
            <section>
              <h3 className="text-sm font-semibold text-gray-900">Set it up</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                <li>In Claude, open Settings › Connectors and choose Add custom connector.</li>
                <li>Paste this address and save:</li>
              </ol>
              <div className="mt-2 flex max-w-xl gap-2">
                <Input readOnly value={info.server_url} aria-label="Server address" onFocus={(event) => event.currentTarget.select()} className="font-mono text-sm" />
                <Button type="button" variant="surface" onClick={() => void copy()}>
                  {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <ol start={3} className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                <li>Choose Connect. Claude opens this site: sign in, pick this organization and allow access.</li>
              </ol>
            </section>
          ) : (
            <p className="text-sm text-gray-600">Only admins can connect Claude. Ask an admin of your organization.</p>
          )}

          {isAdmin ? (
            <section>
              <h3 className="text-sm font-semibold text-gray-900">Your connections to this organization</h3>
              {!connections ? (
                <div className="mt-2 h-12 animate-pulse rounded-lg bg-gray-100" aria-label="Loading" />
              ) : here.length ? (
                <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {here.map((connection) => (
                    <li key={connection.connection_id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{connection.client_name}</span>
                        <span className="block text-xs text-gray-500">{lastUsed(connection)}</span>
                      </span>
                      <Button type="button" variant="surface" size="sm" disabled={removing === connection.connection_id} onClick={() => void disconnect(connection)}>
                        Disconnect
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">None yet. Once you connect, it shows here, and you can disconnect it at any time.</p>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
