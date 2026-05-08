'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createKnowledgeEntry,
  getIdentityNodeDetail,
} from '@services/identity/identity'

function stateLabel(state?: string) {
  if (!state) return 'Empty'
  return state.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export default function IdentityNodeClient({ orgslug, nodeKey }: { orgslug: string; nodeKey: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const { data, mutate, isLoading } = useSWR(
    orgId && accessToken ? ['identity-node', orgId, nodeKey, accessToken] : null,
    () => getIdentityNodeDetail(orgId, nodeKey, accessToken),
    { revalidateOnFocus: false }
  )

  const handleAddNote = async () => {
    if (!orgId || !accessToken || !title.trim()) return
    try {
      await createKnowledgeEntry(orgId, {
        title: title.trim(),
        body: body.trim() || null,
        source_type: 'manual_note',
        framework_node_keys: [nodeKey],
      }, accessToken)
      setTitle('')
      setBody('')
      setAdding(false)
      mutate()
      toast.success('Note added')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add note')
    }
  }

  if (isLoading || !data) {
    return <main className="min-h-screen bg-gray-50 p-8 text-sm text-gray-500">Loading identity section…</main>
  }

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-8 md:px-8">
      <div className="mx-auto w-full max-w-(--breakpoint-lg)">
        <Link
          href={getUriWithOrg(orgslug, routePaths.org.journeyIdentity())}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Identity
        </Link>

        <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                {stateLabel(data.node.development_state)}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{data.node.title}</h1>
              {data.node.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">{data.node.description}</p>
              ) : null}
            </div>
            <Button onClick={() => setAdding(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add note
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{data.node.evidence_count} evidence items</div>
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{data.node.insight_count} insights</div>
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
              {data.profile?.user_confidence ? `${data.profile.user_confidence}/5 confidence` : 'No confidence rating'}
            </div>
          </div>
        </header>

        {adding ? (
          <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Add note</h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="identity-note-title">Title</Label>
                <Input id="identity-note-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="identity-note-body">Details</Label>
                <Textarea id="identity-note-body" value={body} onChange={(event) => setBody(event.target.value)} className="min-h-[120px]" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button onClick={handleAddNote} disabled={!title.trim()}>Save note</Button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Insights</h2>
            {data.insights.length ? (
              <div className="mt-4 space-y-3">
                {data.insights.map((insight) => (
                  <div key={insight.insight_uuid} className="rounded-xl border border-gray-100 p-3">
                    <div className="font-medium text-gray-950">{insight.label}</div>
                    {insight.summary ? <p className="mt-1 text-sm leading-6 text-gray-500">{insight.summary}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">No insights confirmed here yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Explore next</h2>
            {data.tagged_content.length ? (
              <div className="mt-4 space-y-3">
                {data.tagged_content.map((item) => (
                  <div key={`${item.content_type}:${item.content_uuid}`} className="rounded-xl bg-gray-50 p-3">
                    <div className="text-sm font-medium text-gray-950">{item.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">{item.intent}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Tagged courses, resources, and communities will appear here.</p>
            )}
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Evidence</h2>
          {data.evidence.length ? (
            <div className="mt-4 divide-y divide-gray-100">
              {data.evidence.map((entry) => (
                <div key={entry.entry_uuid} className="py-4 first:pt-0 last:pb-0">
                  <div className="text-sm font-medium text-gray-950">{entry.title}</div>
                  {entry.body ? <p className="mt-1 text-sm leading-6 text-gray-500">{entry.body}</p> : null}
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-400">{entry.source_type.replaceAll('_', ' ')}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">No evidence captured for this section yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}
