'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { plansSummaryKey } from '@services/goals/adminHome'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'

/** New plan: name it, and it opens ready to edit as draft v1.0.0. */
export default function NewPlanModal({ orgslug, trigger }: { orgslug: string; trigger?: React.ReactNode }) {
  const router = useRouter()
  const { orgId, token } = useStaff()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const plan = await templatesApi.create(orgId, { title: title.trim() }, token)
      await Promise.all([mutate(isTemplatesKey), mutate(plansSummaryKey(orgId))])
      setOpen(false)
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.template(plan.template_uuid)))
    } catch (error: any) { toast.error(error?.message || 'Could not create the plan.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="New plan" dialogDescription="Give it a name. You’ll add steps next."
    dialogTrigger={trigger || <button type="button" className={primaryActionClass}><Plus size={16} aria-hidden="true" />New plan</button>}
    dialogContent={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !busy) void create() }}>
      <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Launch Ready" aria-label="Plan name" maxLength={200} />
      <Button type="submit" disabled={busy || !title.trim()} className="ml-auto flex">{busy ? <Loader2 className="animate-spin" /> : null}Create plan</Button>
    </form>} />
}
