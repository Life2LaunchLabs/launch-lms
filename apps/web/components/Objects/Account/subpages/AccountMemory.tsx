'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Search, Trash2 } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { clearHubMemory, getHubMemory, HubMemory, setHubMemoryEnabled } from '@services/hub/advisor'
import HubMemoryItems from '@/app/orgs/[orgslug]/(withmenu)/hub/HubMemoryItems'

export default function AccountMemory() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token as string | undefined
  const [enabled, setEnabled] = useState(false)
  const [memories, setMemories] = useState<HubMemory[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!org?.id || !accessToken) return
    setLoading(true)
    getHubMemory(org.id, accessToken)
      .then((result) => {
        setEnabled(result.enabled)
        setMemories(result.memories.map((memory) => ({ ...memory, editable: true })))
      })
      .catch((requestError: any) => setError(requestError?.message || 'Memory settings could not be loaded.'))
      .finally(() => setLoading(false))
  }, [accessToken, org?.id])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return memories
    return memories.filter((memory) => `${memory.category} ${memory.content}`.toLowerCase().includes(normalized))
  }, [memories, query])

  const toggle = async (next: boolean) => {
    if (!org?.id || !accessToken) return
    setSaving(true)
    setError('')
    try {
      await setHubMemoryEnabled(org.id, next, accessToken)
      setEnabled(next)
    } catch (requestError: any) {
      setError(requestError?.message || 'Memory settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    if (!org?.id || !accessToken) return
    setSaving(true)
    setError('')
    try {
      await clearHubMemory(org.id, accessToken)
      setMemories([])
    } catch (requestError: any) {
      setError(requestError?.message || 'Hub memories could not be cleared.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex items-start justify-between gap-5">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Hub memory</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Let Hub carry useful goals, preferences, constraints, and background into future conversations in this organization.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={(checked) => void toggle(checked)} disabled={loading || saving} aria-label="Enable Hub memory" />
        </div>
        {!enabled && memories.length > 0 && (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Memory is off. Your saved memories are retained, but Hub will not use or update them.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">What Hub remembers</h2>
            <p className="mt-1 text-sm text-muted-foreground">You can edit or delete any memory at any time.</p>
          </div>
          {memories.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="self-start text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" />Clear all</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear all Hub memories?</DialogTitle>
                  <DialogDescription>This removes every saved memory for this organization. Conversation history is not deleted.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                  <DialogClose asChild><Button type="button" variant="destructive" disabled={saving} onClick={() => void clearAll()}>Clear all</Button></DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories" className="pl-9" />
        </div>
        <div className="mt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading memories…</p>
          ) : filtered.length > 0 && org?.id && accessToken ? (
            <HubMemoryItems memories={filtered} orgId={org.id} accessToken={accessToken} onChange={(nextFiltered) => {
              const visible = new Map(nextFiltered.map((memory) => [memory.memory_uuid, memory]))
              setMemories((current) => current
                .filter((memory) => !filtered.some((item) => item.memory_uuid === memory.memory_uuid) || visible.has(memory.memory_uuid))
                .map((memory) => visible.get(memory.memory_uuid) || memory))
            }} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{query ? 'No memories match your search.' : 'Hub has not saved any memories yet.'}</p>
          )}
        </div>
      </section>
    </div>
  )
}
