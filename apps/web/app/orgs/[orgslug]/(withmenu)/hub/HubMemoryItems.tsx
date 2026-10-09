'use client'

import { useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { deleteHubMemory, HubMemory, updateHubMemory } from '@services/hub/advisor'

type Props = {
  memories: HubMemory[]
  orgId: number
  accessToken: string
  // eslint-disable-next-line no-unused-vars
  onChange: (memories: HubMemory[]) => void
}

export default function HubMemoryItems({ memories, orgId, accessToken, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const beginEdit = (memory: HubMemory) => {
    setEditing(memory.memory_uuid)
    setDraft(memory.content)
  }

  const save = async (memory: HubMemory) => {
    const content = draft.trim()
    if (!content) return
    setBusy(memory.memory_uuid)
    setError('')
    try {
      const updated = await updateHubMemory(orgId, memory.memory_uuid, content, accessToken)
      onChange(memories.map((item) => item.memory_uuid === memory.memory_uuid
        ? { ...item, ...updated }
        : item))
      setEditing(null)
    } catch (requestError: any) {
      setError(requestError?.message || 'This memory could not be updated.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (memory: HubMemory) => {
    setBusy(memory.memory_uuid)
    setError('')
    try {
      await deleteHubMemory(orgId, memory.memory_uuid, accessToken)
      onChange(memories.filter((item) => item.memory_uuid !== memory.memory_uuid))
    } catch (requestError: any) {
      setError(requestError?.message || 'This memory could not be deleted.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="px-1 text-sm text-destructive" role="alert">{error}</p>}
      {memories.map((memory) => (
        <div key={`${memory.memory_uuid}:${memory.version}:${memory.relationship || ''}`} className="rounded-lg border border-border/70 bg-background px-3 py-2.5">
          {editing === memory.memory_uuid ? (
            <div className="space-y-2">
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} autoFocus />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="button" size="sm" disabled={busy === memory.memory_uuid || !draft.trim()} onClick={() => void save(memory)}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold capitalize text-muted-foreground">{memory.category}</p>
                <p className="mt-0.5 text-sm leading-5 text-foreground">{memory.content}</p>
              </div>
              {memory.editable !== false && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground" aria-label="Memory actions">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onSelect={() => beginEdit(memory)}><Pencil />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={busy === memory.memory_uuid} onSelect={() => void remove(memory)}><Trash2 />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
