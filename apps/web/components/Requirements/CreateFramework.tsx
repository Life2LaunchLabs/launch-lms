'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { requirementsApi } from '@services/goals/requirements'

/**
 * Create a blank framework. Copies of published frameworks come from Plans › Discover instead.
 * `trigger` replaces the default button.
 */
export function CreateFramework({ orgId, token, refresh, onCreated, trigger }: { orgId: number; token?: string; refresh: () => unknown; onCreated: (frameworkUuid: string) => void; trigger?: React.ReactNode }) { // eslint-disable-line no-unused-vars
  const [open, setOpen] = React.useState(false), [name, setName] = React.useState(''), [description, setDescription] = React.useState(''), [saving, setSaving] = React.useState(false)
  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const created = await requirementsApi.create(orgId, { name, description, source_metadata: { numbering: 'custom', fields: [] }, nodes: [] }, token)
      await refresh()
      setOpen(false); setName(''); setDescription('')
      toast.success('Requirement framework created.')
      onCreated(created.framework_uuid)
    } catch (error: any) {
      toast.error(error?.message || 'Could not create the framework.')
    } finally { setSaving(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New requirement framework"
    dialogDescription="Start a blank framework. You’ll add its categories and requirements next, then link plan steps to them."
    dialogTrigger={trigger || <Button variant="brand"><Plus size={15} />New framework</Button>}
    dialogContent={<div className="space-y-4 p-2">
      <div className="space-y-2"><Label htmlFor="requirement-name">Name</Label><Input id="requirement-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Graduation readiness" /></div>
      <div className="space-y-2"><Label htmlFor="requirement-description">Description</Label><Textarea id="requirement-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24" /></div>
      <p className="text-xs text-muted-foreground">To start from a published framework, use Add from Discover on the Requirements tab.</p>
      <Button onClick={() => void create()} disabled={!name.trim() || saving} className="ml-auto">{saving && <Loader2 className="animate-spin" size={14} />}Create blank framework</Button>
    </div>} />
}
