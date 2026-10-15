'use client'

import React from 'react'
import { ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import type { TemplateDocument, TemplateRole } from '@services/goals/types'
import { cn } from '@/lib/utils'
import type { TemplateEditing } from './useTemplate'

// The goal capabilities a role can hold (apps/api/src/db/planning.py ALL_CAPABILITIES), grouped for the checklist.
const CAPABILITY_GROUPS: Array<{ label: string; items: Array<[string, string]> }> = [
  { label: 'Working on the goal', items: [['view_plan', 'See the goal'], ['comment', 'Comment'], ['contribute_fields', 'Fill in steps'], ['update_progress', 'Mark steps done'], ['request_collaborators', 'Ask others to join']] },
  { label: 'Staff', items: [['contribute_restricted_fields', 'Fill in staff steps'], ['complete_restricted_objectives', 'Sign off staff steps'], ['review_badge_submissions', 'Review badge submissions']] },
  { label: 'Managing', items: [['edit_plan_details', 'Edit details'], ['edit_structure', 'Edit stages and steps'], ['edit_schedule', 'Edit dates'], ['complete_plan', 'Finish the goal'], ['archive_plan', 'Archive the goal'], ['manage_collaborators', 'Manage people'], ['manage_roles', 'Manage roles']] },
]
const FIXED = ['subject', 'reviewer', 'plan_admin', 'viewer']
const DEFAULT_ROLES: NonNullable<TemplateDocument['roles']> = { definitions: [], subject_role_key: 'subject', staff_role_key: 'reviewer' }
const roleName = (role: TemplateRole) => role.key === 'subject' ? 'Learner' : role.name || role.key

/** The template's goal roles: permission bundles copied onto every goal handed out from it. */
export default function TemplateRoles({ editing }: { editing: TemplateEditing }) {
  const initial = editing.template?.document.roles || DEFAULT_ROLES
  const [roles, setRoles] = React.useState(initial)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  React.useEffect(() => setRoles(editing.template?.document.roles || DEFAULT_ROLES), [editing.template?.document.roles])
  const patchRole = (key: string, patch: Partial<TemplateRole>) => setRoles((current) => ({ ...current, definitions: current.definitions.map((role) => role.key === key ? { ...role, ...patch } : role) }))
  const addRole = () => {
    let index = roles.definitions.length + 1
    while (roles.definitions.some((role) => role.key === `custom_role_${index}`)) index += 1
    const key = `custom_role_${index}`
    setRoles((current) => ({ ...current, definitions: [...current.definitions, { key, name: 'Custom role', capabilities: ['view_plan'], grantable_role_keys: [] }] }))
    setSelectedKey(key)
  }
  const removeRole = (key: string) => {
    setRoles((current) => ({
      definitions: current.definitions.filter((role) => role.key !== key).map((role) => ({ ...role, grantable_role_keys: role.grantable_role_keys.filter((item) => item !== key) })),
      subject_role_key: current.subject_role_key === key ? 'subject' : current.subject_role_key,
      staff_role_key: current.staff_role_key === key ? 'reviewer' : current.staff_role_key,
    }))
    setSelectedKey(null)
  }
  const selected = roles.definitions.find((role) => role.key === selectedKey)
  const toggle = (role: TemplateRole, capability: string, on: boolean) => patchRole(role.key, { capabilities: on ? [...role.capabilities, capability] : role.capabilities.filter((item) => item !== capability) })
  return <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Goal roles</h2><p className="mt-1 text-sm text-muted-foreground">Copied onto goals handed out from now on. Goals already handed out keep theirs.</p></div><button type="button" onClick={addRole} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} />Role</button></div>
    <div className="mt-5 space-y-2">{roles.definitions.map((role) => <button key={role.key} type="button" onClick={() => setSelectedKey(role.key)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30">
      <span className="min-w-0"><span className="block truncate text-sm font-black">{roleName(role)}</span><span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{role.capabilities.length} permission{role.capabilities.length === 1 ? '' : 's'}</span></span>
      <span className="flex items-center gap-3"><span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{role.key}</span><ChevronRight size={15} className="text-muted-foreground" /></span>
    </button>)}</div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-bold"><span className="mb-2 block">Learner role</span><select value={roles.subject_role_key} onChange={(event) => setRoles({ ...roles, subject_role_key: event.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{roles.definitions.map((role) => <option key={role.key} value={role.key}>{roleName(role)}</option>)}</select></label>
      <label className="block text-xs font-bold"><span className="mb-2 block">Default staff role</span><select value={roles.staff_role_key} onChange={(event) => setRoles({ ...roles, staff_role_key: event.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{roles.definitions.filter((role) => role.key !== 'subject').map((role) => <option key={role.key} value={role.key}>{roleName(role)}</option>)}</select></label>
    </div>
    <button type="button" onClick={() => void editing.save((document) => ({ ...document, roles }), 'Goal roles saved.')} disabled={editing.saving || editing.stale} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{editing.saving ? <Loader2 size={14} className="animate-spin" /> : null}Save roles</button>
    {selected ? <Modal isDialogOpen onOpenChange={(next) => { if (!next) setSelectedKey(null) }} minHeight="no-min" minWidth="md" dialogTitle={roleName(selected)}
      dialogDescription={selected.key === 'plan_admin' ? 'The goal admin has every permission and cannot be changed.' : 'Changes stay here until you save roles.'}
      dialogContent={<div className="space-y-5">
        <label className="block text-xs font-bold"><span className="mb-2 block">Role name</span><input value={roleName(selected)} disabled={['subject', 'plan_admin'].includes(selected.key)} onChange={(event) => patchRole(selected.key, { name: event.target.value })} className="h-10 w-full rounded-lg border border-border px-3 text-sm font-bold disabled:bg-muted" /></label>
        <div className="space-y-5">{CAPABILITY_GROUPS.map((group) => <fieldset key={group.label}><legend className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</legend><div className="grid gap-2 sm:grid-cols-2">
          {group.items.map(([capability, label]) => { const locked = selected.key === 'plan_admin'; return <label key={capability} className={cn('flex items-start gap-2 rounded-lg border border-border p-3 text-xs font-bold', locked ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'cursor-pointer hover:border-blue-300')}>
            <input type="checkbox" className="mt-0.5" disabled={locked} checked={selected.capabilities.includes(capability)} onChange={(event) => toggle(selected, capability, event.target.checked)} />{label}
          </label> })}
        </div></fieldset>)}</div>
        <div className="flex items-center justify-between gap-3">
          {!FIXED.includes(selected.key) ? <button type="button" onClick={() => removeRole(selected.key)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700"><Trash2 size={14} />Remove role</button> : <span />}
          <button type="button" onClick={() => setSelectedKey(null)} className="rounded-lg bg-black px-5 py-2 text-xs font-bold text-white">Done</button>
        </div>
      </div>} /> : null}
  </section>
}
