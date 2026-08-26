'use client'

import React from 'react'
import QRCode from 'qrcode'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowLeft, CheckCircle2, Copy, Download, Link2, MailPlus, Plus, QrCode, Shield, Upload, User, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { createJoinLink, inviteBatchUsers, previewBatchUsers, revokeJoinLink } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'
import { usePlan } from '@components/Hooks/usePlan'
import { PlanLevel, planMeetsRequirement } from '@services/plans/plans'

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
  const [method, setMethod] = React.useState<'manual' | 'csv' | 'link'>('manual')
  const [previewResults, setPreviewResults] = React.useState<any[]>([])
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
  const readyRecipients = previewResults.filter((result) => result.status === 'ready')

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
    setRecipients((current) => [...current, ...values])
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
    setPreviewResults([])
    setMethod('manual')
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const beginReview = async () => {
    const added = commitInput()
    const allRecipients = [...recipients, ...added]
    if (!allRecipients.length) return toast.error('Enter at least one email address')
    if (!selectedRoleId) return toast.error('Choose a role')
    if (groupChoice === 'new' && !newGroupName.trim()) return toast.error('Enter a name for the new group')
    setIsSending(true)
    try {
      const response = await previewBatchUsers(org.id, {
        emails: allRecipients,
        role_id: Number(selectedRoleId),
        source: method === 'csv' ? 'csv' : 'manual',
        ...(groupChoice.startsWith('group:') ? { usergroup_id: Number(groupChoice.slice(6)) } : {}),
        ...(groupChoice === 'new' ? { new_usergroup_name: newGroupName.trim() } : {}),
      }, accessToken)
      if (response.status !== 200) throw new Error(response.data?.detail || 'Could not validate invitations')
      setPreviewResults(response.data.results || [])
      setReviewing(true)
    } catch (error: any) {
      toast.error(error?.message || 'Could not validate invitations')
    } finally {
      setIsSending(false)
    }
  }

  const sendInvites = async () => {
    if (!readyRecipients.length) return
    setIsSending(true)
    const toastId = toast.loading(`Inviting ${readyRecipients.length} ${readyRecipients.length === 1 ? 'person' : 'people'}…`)
    try {
      const response = await inviteBatchUsers(org.id, {
        emails: recipients,
        role_id: Number(selectedRoleId),
        source: method === 'csv' ? 'csv' : 'manual',
        ...(method === 'csv' ? { batch_uuid: `csv_${crypto.randomUUID()}` } : {}),
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

  const downloadCsvReport = () => {
    const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`
    const report = ['email,status,detail', ...previewResults.map((item) => [item.email, item.status, item.detail || ''].map((value) => escapeCell(String(value))).join(','))].join('\n')
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([report], { type: 'text/csv;charset=utf-8' }))
    anchor.download = 'invitation-validation-report.csv'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => nextOpen ? onOpenChange(true) : close()}>
      <DialogContent className="p-6 sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{reviewing ? 'Review invitations' : 'Invite people'}</DialogTitle>
          <DialogDescription>{reviewing ? 'Confirm the access these people will receive. Pending invitations reserve seats.' : 'Invite by email, upload a CSV, or create a controlled learner link and QR code.'}</DialogDescription>
        </DialogHeader>

        {!reviewing ? <div className="space-y-5 py-2">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-1">
            <MethodButton active={method === 'manual'} onClick={() => setMethod('manual')} icon={MailPlus} label="Emails" />
            <MethodButton active={method === 'csv'} onClick={() => setMethod('csv')} icon={Upload} label="CSV" disabled={!planMeetsRequirement(currentPlan, 'full')} />
            <MethodButton active={method === 'link'} onClick={() => setMethod('link')} icon={QrCode} label="Link / QR" />
          </div>
          {method === 'link' ? <JoinLinkPanel org={org} accessToken={accessToken} usergroups={usergroups || []} groupsEnabled={groupsEnabled} currentPlan={currentPlan} onCreated={onInvited} /> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-800"><span>Role</span><Select value={selectedRoleId} onValueChange={setSelectedRoleId}><SelectTrigger className="h-11"><SelectValue placeholder="Choose a role" /></SelectTrigger><SelectContent>{roles?.map((role: any) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}</SelectContent></Select></label>
            {isLearnerRole && groupsEnabled && <label className="space-y-2 text-sm font-medium text-gray-800"><span>Group <span className="font-normal text-gray-400">optional</span></span><Select value={groupChoice} onValueChange={setGroupChoice}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No group</SelectItem>{usergroups?.map((group: any) => <SelectItem key={group.id} value={`group:${group.id}`}>{group.name}</SelectItem>)}<SelectItem value="new"><span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" />Create a new group</span></SelectItem></SelectContent></Select></label>}
          </div>

          {groupChoice === 'new' && isLearnerRole && <label className="block space-y-2 text-sm font-medium text-gray-800"><span>New group name</span><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} maxLength={120} autoFocus placeholder="e.g. Summer camp · Blue group" className="h-11 w-full rounded-lg border border-gray-200 px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>}

          {method === 'csv' && <CsvUploader onRecipients={(emails) => { setRecipients(emails); setRecipientInput('') }} />}

          <div className="space-y-2">
            <label htmlFor="invite-user-emails" className="text-sm font-medium text-gray-800">Email addresses</label>
            <div className="min-h-32 rounded-xl border border-gray-200 bg-white p-3 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"><div className="flex flex-wrap gap-2">
              {recipients.map((email, index) => {
                const valid = emailPattern.test(email)
                const duplicate = recipients.findIndex((value) => value.toLowerCase() === email.toLowerCase()) !== index
                return <span key={`${email.toLowerCase()}-${index}`} className={`inline-flex items-center rounded-full text-xs font-medium ${valid && !duplicate ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}><button type="button" onClick={() => editRecipient(email)} className="inline-flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-1" aria-label={`Edit ${email}`}>{valid && !duplicate ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}{email}{duplicate ? ' · duplicate' : ''}</button><button type="button" onClick={() => setRecipients((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-r-full py-1 pl-1 pr-2" aria-label={`Remove ${email}`}><X className="h-3 w-3" /></button></span>
              })}
              <input ref={recipientInputRef} id="invite-user-emails" value={recipientInput} onChange={(event) => { const value = event.target.value; if (/[,;\s]/.test(value)) { addRecipients(splitRecipients(value)); setRecipientInput('') } else setRecipientInput(value) }} onBlur={commitInput} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (splitRecipients(pasted).length > 1) { event.preventDefault(); addRecipients(splitRecipients(pasted)) } }} onKeyDown={(event) => { if (['Enter', ',', ';', ' '].includes(event.key)) { event.preventDefault(); commitInput() } else if (event.key === 'Backspace' && !recipientInput && recipients.length) { event.preventDefault(); editRecipient(recipients[recipients.length - 1]) } }} placeholder={recipients.length ? 'Add another email' : 'alex@example.com, sam@example.com'} className="h-8 min-w-56 flex-1 border-0 bg-transparent text-sm outline-none" />
            </div></div>
            <p className="text-xs text-gray-500">Type or paste addresses separated by commas, spaces, or new lines.</p>
          </div>
          </>}
        </div> : <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2"><SummaryCard icon={isLearnerRole ? User : Shield} label="Role" value={selectedRole?.name || 'Unknown role'} /><SummaryCard icon={Users} label="Group" value={groupChoice === 'new' ? newGroupName : usergroups?.find((group: any) => `group:${group.id}` === groupChoice)?.name || 'No group'} /></div>
          <div className="overflow-hidden rounded-xl border border-gray-200"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3"><span className="text-sm font-semibold text-gray-800">Recipients</span><span className="text-xs text-gray-500">{readyRecipients.length} seat{readyRecipients.length === 1 ? '' : 's'} reserved</span></div><div className="max-h-60 divide-y divide-gray-100 overflow-y-auto">{previewResults.map((result, index) => { const ready = result.status === 'ready'; return <div key={`${result.email}-${index}`} className={`flex items-center gap-3 px-4 py-3 ${ready ? '' : 'bg-amber-50/40'}`}>{ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}<span className="min-w-0 flex-1 truncate text-sm text-gray-800">{result.email}</span><span className="text-xs text-gray-500">{recipientStatusLabel(result.status)}</span></div>})}</div></div>
          {method === 'csv' && <button type="button" onClick={downloadCsvReport} className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-800"><Download className="h-3.5 w-3.5" />Download validation report</button>}
          {!isLearnerRole && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">These invitations grant dashboard access and reserve elevated seats. Access is rechecked when each invitation is accepted.</div>}
        </div>}

        <DialogFooter className="gap-2 sm:gap-0">
          {reviewing ? <button type="button" onClick={() => setReviewing(false)} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"><ArrowLeft className="h-4 w-4" />Edit</button> : <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>}
          {method !== 'link' && <button type="button" onClick={reviewing ? sendInvites : beginReview} disabled={isSending || (reviewing && !readyRecipients.length)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"><MailPlus className="h-4 w-4" />{isSending ? 'Working…' : reviewing ? `Send ${readyRecipients.length} invitation${readyRecipients.length === 1 ? '' : 's'}` : 'Review invitations'}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><Icon className="h-4 w-4" /></div><div><p className="text-xs text-gray-400">{label}</p><p className="text-sm font-semibold text-gray-800">{value}</p></div></div>
}

function MethodButton({ active, onClick, icon: Icon, label, disabled = false }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} title={disabled ? 'CSV invitations require a paid plan' : undefined} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'} disabled:cursor-not-allowed disabled:opacity-40`}><Icon className="h-4 w-4" />{label}</button>
}

function recipientStatusLabel(status: string) {
  return ({ ready: 'Ready', invalid: 'Invalid', duplicate: 'Duplicate', already_member: 'Already a member', already_invited: 'Invitation pending' } as Record<string, string>)[status] || 'Requires attention'
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += character
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return { headers: rows[0] || [], rows: rows.slice(1) }
}

// eslint-disable-next-line no-unused-vars
function CsvUploader({ onRecipients }: { onRecipients: (emails: string[]) => void }) {
  const [fileName, setFileName] = React.useState('')
  const [headers, setHeaders] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<string[][]>([])
  const [emailColumn, setEmailColumn] = React.useState('0')
  const load = async (file?: File) => {
    if (!file) return
    if (file.size > 2_000_000) return toast.error('CSV files must be smaller than 2 MB')
    const parsed = parseCsv(await file.text())
    if (!parsed.headers.length) return toast.error('The CSV is empty')
    const likelyEmail = parsed.headers.findIndex((header) => header.trim().toLowerCase().includes('email'))
    const column = likelyEmail >= 0 ? likelyEmail : 0
    setFileName(file.name); setHeaders(parsed.headers); setRows(parsed.rows); setEmailColumn(String(column))
    onRecipients(parsed.rows.map((item) => item[column] || '').filter(Boolean))
  }
  const chooseColumn = (value: string) => {
    setEmailColumn(value)
    const column = Number(value)
    onRecipients(rows.map((item) => item[column] || '').filter(Boolean))
  }
  return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4"><div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"><Upload className="h-4 w-4" />Choose CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void load(event.target.files?.[0])} /></label><span className="min-w-0 flex-1 truncate text-xs text-gray-500">{fileName || 'Use a header row and one recipient per row.'}</span>{headers.length > 0 && <Select value={emailColumn} onValueChange={chooseColumn}><SelectTrigger className="h-9 w-44 bg-white"><SelectValue /></SelectTrigger><SelectContent>{headers.map((header, index) => <SelectItem key={`${header}-${index}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}</SelectContent></Select>}</div></div>
}

function JoinLinkPanel({ org, accessToken, usergroups, groupsEnabled, currentPlan, onCreated }: { org: any; accessToken: string; usergroups: any[]; groupsEnabled: boolean; currentPlan: PlanLevel; onCreated?: () => void }) {
  const [name, setName] = React.useState('')
  const [groupId, setGroupId] = React.useState('none')
  const [minutes, setMinutes] = React.useState('60')
  const [maximum, setMaximum] = React.useState(planMeetsRequirement(currentPlan, 'full') ? '25' : '5')
  const [domain, setDomain] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [link, setLink] = React.useState<any>(null)
  const [qr, setQr] = React.useState('')
  const linksKey = org && accessToken ? `${getAPIUrl()}orgs/${org.id}/join-links` : null
  const { data: managedLinks, mutate: mutateLinks } = useSWR(linksKey, (nextUrl) => swrFetcher(nextUrl, accessToken), { revalidateOnFocus: false })
  const url = link?.invite_code && typeof window !== 'undefined' ? getUriWithOrg(org.slug, `/signup?inviteCode=${encodeURIComponent(link.invite_code)}`) : ''

  React.useEffect(() => { if (url) void QRCode.toDataURL(url, { width: 520, margin: 2 }).then(setQr) }, [url])
  const create = async () => {
    if (!name.trim()) return toast.error('Enter a link name')
    setCreating(true)
    try {
      const response = await createJoinLink(org.id, { display_name: name.trim(), expires_in_minutes: Number(minutes), max_redemptions: Number(maximum), ...(groupId !== 'none' ? { usergroup_id: Number(groupId) } : {}), ...(domain.trim() ? { approved_email_domain: domain.trim() } : {}) }, accessToken)
      if (response.status !== 200) throw new Error(response.data?.detail || 'Could not create join link')
      setLink(response.data); await mutateLinks(); onCreated?.(); toast.success('Learner join link created')
    } catch (error: any) { toast.error(error?.message || 'Could not create join link') } finally { setCreating(false) }
  }
  const copy = async () => { await navigator.clipboard.writeText(url); toast.success('Join link copied') }
  const download = () => { const anchor = document.createElement('a'); anchor.href = qr; anchor.download = `${name || 'join-link'}-qr.png`; anchor.click() }
  const revoke = async (linkUuid: string) => {
    const response = await revokeJoinLink(org.id, linkUuid, accessToken)
    if (response.status !== 200) { toast.error(response.data?.detail || 'Could not revoke link'); return }
    if (link?.invite_code_uuid === linkUuid) setLink(null)
    await mutateLinks(); toast.success('Join link revoked and seats released')
  }

  const management = <ManagedJoinLinks links={managedLinks || []} onRevoke={revoke} />

  if (link) return <div className="space-y-5"><div className="grid gap-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 sm:grid-cols-[1fr_180px]"><div className="space-y-3"><div><p className="text-sm font-semibold text-gray-900">{link.display_name}</p><p className="mt-1 text-xs text-gray-500">Learner access · {link.max_redemptions} maximum joins · expires {new Date(link.expires_at).toLocaleString()}</p></div><p className="break-all rounded-lg bg-white p-2 text-xs text-gray-600">{url}</p><div className="flex gap-2"><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white"><Copy className="h-3.5 w-3.5" />Copy link</button><button type="button" disabled={!qr} onClick={download} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-gray-700"><Download className="h-3.5 w-3.5" />Download QR</button></div><p className="text-xs text-amber-700">The secret link is shown once. Store it somewhere safe before closing.</p></div><div className="flex aspect-square items-center justify-center rounded-xl bg-white p-3">{qr ? <img src={qr} alt="Join link QR code" className="h-full w-full" /> : <QrCode className="h-10 w-10 text-gray-300" />}</div></div>{management}</div>

  return <div className="space-y-5"><div className="space-y-4"><div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Links and QR codes always grant learner access. They never grant staff or administrator permissions.</div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium text-gray-800"><span>Link name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Photography Group" className="h-11 w-full rounded-lg border px-3" /></label>{groupsEnabled && <label className="space-y-2 text-sm font-medium text-gray-800"><span>Group <span className="font-normal text-gray-400">optional</span></span><Select value={groupId} onValueChange={setGroupId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No group</SelectItem>{usergroups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select></label>}<label className="space-y-2 text-sm font-medium text-gray-800"><span>Expires after</span><Select value={minutes} onValueChange={setMinutes}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="60">1 hour</SelectItem><SelectItem value="1440">1 day</SelectItem><SelectItem value="10080">7 days</SelectItem></SelectContent></Select></label><label className="space-y-2 text-sm font-medium text-gray-800"><span>Maximum joins</span><input type="number" min={1} max={1000} value={maximum} onChange={(event) => setMaximum(event.target.value)} className="h-11 w-full rounded-lg border px-3" /></label><label className="space-y-2 text-sm font-medium text-gray-800 sm:col-span-2"><span>Approved email domain <span className="font-normal text-gray-400">optional</span></span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="school.edu" className="h-11 w-full rounded-lg border px-3" /></label></div><button type="button" disabled={creating} onClick={() => void create()} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Link2 className="h-4 w-4" />{creating ? 'Creating…' : 'Create learner link'}</button></div>{management}</div>
}

// eslint-disable-next-line no-unused-vars
function ManagedJoinLinks({ links, onRevoke }: { links: any[]; onRevoke: (linkUuid: string) => Promise<void> }) {
  if (!links.length) return null
  return <div className="overflow-hidden rounded-xl border"><div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Managed links</div><div className="max-h-44 divide-y overflow-y-auto">{links.map((item) => <div key={item.invite_code_uuid} className="flex items-center gap-3 px-4 py-3"><Link2 className="h-4 w-4 text-gray-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{item.display_name}</p><p className="text-xs text-gray-400">{item.redemption_count}/{item.max_redemptions} joined · {item.status} · expires {new Date(item.expires_at).toLocaleString()}</p></div>{item.status === 'active' && <button type="button" onClick={() => void onRevoke(item.invite_code_uuid)} className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Revoke</button>}</div>)}</div></div>
}
