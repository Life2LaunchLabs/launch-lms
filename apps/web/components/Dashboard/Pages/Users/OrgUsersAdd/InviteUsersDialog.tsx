'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowLeft, CheckCircle2, MailPlus, Plus, Shield, User, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getAPIUrl } from '@services/config/config'
import { inviteBatchUsers } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'
import { usePlan } from '@components/Hooks/usePlan'
import { planMeetsRequirement } from '@services/plans/plans'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const splitRecipients = (value: string) => value.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean)

export default function InviteUsersDialog({ open: isOpen, onOpenChange, onInvited }: {
  open: boolean
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>
  onInvited?: () => void
}) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const currentPlan = usePlan()
  const groupsEnabled = planMeetsRequirement(currentPlan, 'full')
    && (org?.config?.config?.resolved_features?.usergroups?.enabled ?? true)
  const [recipients, setRecipients] = React.useState<string[]>([])
  const [recipientInput, setRecipientInput] = React.useState('')
  const [selectedRoleId, setSelectedRoleId] = React.useState('')
  const [groupChoice, setGroupChoice] = React.useState('none')
  const [newGroupName, setNewGroupName] = React.useState('')
  const [reviewing, setReviewing] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)
  const recipientInputRef = React.useRef<HTMLInputElement>(null)

  const { data: roles } = useSWR(org && accessToken ? `${getAPIUrl()}roles/org/${org.id}` : null, (url) => swrFetcher(url, accessToken), { revalidateOnFocus: false })
  const { data: usergroups } = useSWR(org && accessToken && groupsEnabled ? `${getAPIUrl()}usergroups/org/${org.id}?org_id=${org.id}` : null, (url) => swrFetcher(url, accessToken), { revalidateOnFocus: false })

  const selectedRole = roles?.find((role: any) => String(role.id) === selectedRoleId)
  const isLearnerRole = selectedRole?.role_uuid === 'role_global_user' || ['user', 'learner', 'member'].includes(String(selectedRole?.name || '').toLowerCase())
  const validRecipients = recipients.filter((email) => emailPattern.test(email))
  const invalidRecipients = recipients.filter((email) => !emailPattern.test(email))

  React.useEffect(() => {
    if (!selectedRoleId && roles?.length) {
      const learnerRole = roles.find((role: any) => role.role_uuid === 'role_global_user')
      setSelectedRoleId(String(learnerRole?.id || roles[0].id))
    }
  }, [roles, selectedRoleId])

  React.useEffect(() => {
    if (!isLearnerRole) {
      setGroupChoice('none')
      setNewGroupName('')
    }
  }, [isLearnerRole])

  const addRecipients = (values: string[]) => {
    setRecipients((current) => {
      const known = new Set(current.map((email) => email.toLowerCase()))
      const next = [...current]
      values.forEach((email) => {
        if (!known.has(email.toLowerCase())) {
          known.add(email.toLowerCase())
          next.push(email)
        }
      })
      return next
    })
  }

  const commitInput = () => {
    const values = splitRecipients(recipientInput)
    if (values.length) addRecipients(values)
    setRecipientInput('')
    return values
  }

  const editRecipient = (email: string) => {
    setRecipients((current) => current.filter((value) => value !== email))
    setRecipientInput(email)
    requestAnimationFrame(() => {
      const input = recipientInputRef.current
      input?.focus()
      input?.setSelectionRange(email.length, email.length)
    })
  }

  const reset = () => {
    setRecipients([])
    setRecipientInput('')
    setGroupChoice('none')
    setNewGroupName('')
    setReviewing(false)
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const beginReview = () => {
    const added = commitInput()
    if (!recipients.length && !added.length) return toast.error('Enter at least one email address')
    if (!selectedRoleId) return toast.error('Choose a role')
    if (groupChoice === 'new' && !newGroupName.trim()) return toast.error('Enter a name for the new group')
    setReviewing(true)
  }

  const sendInvites = async () => {
    if (!validRecipients.length) return
    setIsSending(true)
    const toastId = toast.loading(`Inviting ${validRecipients.length} ${validRecipients.length === 1 ? 'person' : 'people'}…`)
    try {
      const response = await inviteBatchUsers(org.id, {
        emails: validRecipients,
        role_id: Number(selectedRoleId),
        ...(groupChoice.startsWith('group:') ? { usergroup_id: Number(groupChoice.slice(6)) } : {}),
        ...(groupChoice === 'new' ? { new_usergroup_name: newGroupName.trim() } : {}),
      }, accessToken)
      if (response.status !== 200) {
        const detail = response.data?.detail
        throw new Error(typeof detail === 'string' ? detail : 'Could not create invitations')
      }

      await Promise.all([
        mutate(`${getAPIUrl()}orgs/${org.id}/invites/users`),
        mutate((key) => typeof key === 'string' && key.startsWith(`${getAPIUrl()}orgs/${org.id}/users?`)),
        mutate(`${getAPIUrl()}usergroups/org/${org.id}?org_id=${org.id}`),
        mutate(`${getAPIUrl()}usergroups/org/${org.id}/overview`),
      ])
      const created = response.data?.created || 0
      const skipped = (response.data?.results || []).length - created
      toast.success(`${created} invitation${created === 1 ? '' : 's'} created${skipped ? ` · ${skipped} skipped` : ''}`, { id: toastId })
      close()
      onInvited?.()
    } catch (error: any) {
      toast.error(error?.message || 'Could not create invitations', { id: toastId })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => nextOpen ? onOpenChange(true) : close()}>
      <DialogContent className="p-6 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{reviewing ? 'Review invitations' : 'Invite people'}</DialogTitle>
          <DialogDescription>{reviewing ? 'Confirm the access these people will receive. Pending invitations reserve seats.' : 'Choose a role, optionally place learners in a group, then add email addresses.'}</DialogDescription>
        </DialogHeader>

        {!reviewing ? <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-800"><span>Role</span><Select value={selectedRoleId} onValueChange={setSelectedRoleId}><SelectTrigger className="h-11"><SelectValue placeholder="Choose a role" /></SelectTrigger><SelectContent>{roles?.map((role: any) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}</SelectContent></Select></label>
            {isLearnerRole && groupsEnabled && <label className="space-y-2 text-sm font-medium text-gray-800"><span>Group <span className="font-normal text-gray-400">optional</span></span><Select value={groupChoice} onValueChange={setGroupChoice}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No group</SelectItem>{usergroups?.map((group: any) => <SelectItem key={group.id} value={`group:${group.id}`}>{group.name}</SelectItem>)}<SelectItem value="new"><span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" />Create a new group</span></SelectItem></SelectContent></Select></label>}
          </div>

          {groupChoice === 'new' && isLearnerRole && <label className="block space-y-2 text-sm font-medium text-gray-800"><span>New group name</span><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} maxLength={120} autoFocus placeholder="e.g. Summer camp · Blue group" className="h-11 w-full rounded-lg border border-gray-200 px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>}

          <div className="space-y-2">
            <label htmlFor="invite-user-emails" className="text-sm font-medium text-gray-800">Email addresses</label>
            <div className="min-h-32 rounded-xl border border-gray-200 bg-white p-3 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"><div className="flex flex-wrap gap-2">
              {recipients.map((email) => {
                const valid = emailPattern.test(email)
                return <span key={email.toLowerCase()} className={`inline-flex items-center rounded-full text-xs font-medium ${valid ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}><button type="button" onClick={() => editRecipient(email)} className="inline-flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-1" aria-label={`Edit ${email}`}>{valid ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}{email}</button><button type="button" onClick={() => setRecipients((current) => current.filter((value) => value !== email))} className="rounded-r-full py-1 pl-1 pr-2" aria-label={`Remove ${email}`}><X className="h-3 w-3" /></button></span>
              })}
              <input ref={recipientInputRef} id="invite-user-emails" value={recipientInput} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) { addRecipients(splitRecipients(value)); setRecipientInput('') } else setRecipientInput(value) }} onBlur={commitInput} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (splitRecipients(pasted).length > 1) { event.preventDefault(); addRecipients(splitRecipients(pasted)) } }} onKeyDown={(event) => { if (['Enter', ',', ';', ' '].includes(event.key)) { event.preventDefault(); commitInput() } else if (event.key === 'Backspace' && !recipientInput && recipients.length) { event.preventDefault(); editRecipient(recipients[recipients.length - 1]) } }} placeholder={recipients.length ? 'Add another email' : 'alex@example.com, sam@example.com'} className="h-8 min-w-56 flex-1 border-0 bg-transparent text-sm outline-none" />
            </div></div>
            <p className="text-xs text-gray-500">Type or paste addresses separated by commas, spaces, or new lines.</p>
          </div>

        </div> : <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2"><SummaryCard icon={isLearnerRole ? User : Shield} label="Role" value={selectedRole?.name || 'Unknown role'} /><SummaryCard icon={Users} label="Group" value={groupChoice === 'new' ? newGroupName : usergroups?.find((group: any) => `group:${group.id}` === groupChoice)?.name || 'No group'} /></div>
          <div className="overflow-hidden rounded-xl border border-gray-200"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3"><span className="text-sm font-semibold text-gray-800">Recipients</span><span className="text-xs text-gray-500">{validRecipients.length} seat{validRecipients.length === 1 ? '' : 's'} reserved</span></div><div className="max-h-60 divide-y divide-gray-100 overflow-y-auto">{validRecipients.map((email) => <div key={email.toLowerCase()} className="flex items-center gap-3 px-4 py-3"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="min-w-0 flex-1 truncate text-sm text-gray-800">{email}</span><span className="text-xs text-gray-400">Ready</span></div>)}{invalidRecipients.map((email) => <div key={email.toLowerCase()} className="flex items-center gap-3 bg-rose-50/50 px-4 py-3"><AlertCircle className="h-4 w-4 text-rose-600" /><span className="min-w-0 flex-1 truncate text-sm text-rose-800">{email}</span><span className="text-xs text-rose-600">Invalid · skipped</span></div>)}</div></div>
          {!isLearnerRole && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">These invitations grant dashboard access and reserve elevated seats. Access is rechecked when each invitation is accepted.</div>}
        </div>}

        <DialogFooter className="gap-2 sm:gap-0">
          {reviewing ? <button type="button" onClick={() => setReviewing(false)} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><ArrowLeft className="h-4 w-4" />Edit</button> : <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>}
          <button type="button" onClick={reviewing ? sendInvites : beginReview} disabled={isSending || (reviewing && !validRecipients.length)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"><MailPlus className="h-4 w-4" />{isSending ? 'Sending…' : reviewing ? `Send ${validRecipients.length} invitation${validRecipients.length === 1 ? '' : 's'}` : 'Review invitations'}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><Icon className="h-4 w-4" /></div><div><p className="text-xs text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800">{value}</p></div></div>
}
