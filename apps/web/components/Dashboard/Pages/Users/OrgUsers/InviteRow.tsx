import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import { Crown, Mail, RefreshCw, Shield, User, Users, X } from 'lucide-react'

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

/** A pending or past invitation, shown as a row above the organization's users. */
export default function InviteRow({ invite, hasUserGroups, messages, onResend, onRevoke }: {
  invite: any; hasUserGroups: boolean; messages: boolean
  onResend: (invitationUuid: string) => Promise<void> // eslint-disable-line no-unused-vars
  onRevoke: (invitationUuid: string) => Promise<void> // eslint-disable-line no-unused-vars
}) {
  return (
    <tr className={invite.pending ? 'bg-amber-50/30' : 'bg-gray-50/40'}>
      <td className="w-10 px-6 py-4">
        <input type="checkbox" disabled className="h-4 w-4 cursor-not-allowed rounded border-gray-200 opacity-40" aria-label={`Invitation for ${invite.email}`} />
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-800">{invite.email}</div>
            <div className="text-xs text-gray-400">{invite.source === 'csv' ? 'CSV invitation' : 'Invitation'} · {String(invite.delivery_status || 'queued').replace('_', ' ')}</div>
          </div>
        </div>
      </td>
      {hasUserGroups && <td className="px-6 py-4">{invite.usergroup ? <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600"><Users className="h-3 w-3" />{invite.usergroup.name}</span> : <span className="text-xs text-gray-400">—</span>}</td>}
      {messages && <td className="px-6 py-4 text-xs text-gray-400">—</td>}
      <td className="px-6 py-4 text-xs text-gray-500">Invited {formatShortDate(invite.created_at)}</td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${invite.pending ? 'bg-amber-100 text-amber-700' : invite.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          <Mail className="h-3 w-3" />
          {String(invite.status).replace('_', ' ')}
        </span>
      </td>
      <td className="px-6 py-4"><span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">{String(invite.role?.name || 'User').toLowerCase().includes('admin') ? <Crown className="h-3.5 w-3.5 text-indigo-600" /> : String(invite.role?.name || '').toLowerCase().match(/maintainer|instructor|staff/) ? <Shield className="h-3.5 w-3.5 text-emerald-600" /> : <User className="h-3.5 w-3.5 text-gray-500" />}{invite.role?.name || 'User'}</span></td>
      <td className="px-6 py-4 text-right">{invite.pending ? <div className="inline-flex gap-2"><button onClick={() => void onResend(invite.invitation_uuid)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-600 nice-shadow transition hover:bg-gray-50" title={`${invite.delivery_attempts || 0} delivery attempts`}><RefreshCw className="h-3.5 w-3.5" />Resend</button><ConfirmationModal confirmationButtonText="Revoke invitation" confirmationMessage={`Revoke the invitation for ${invite.email}? The reserved seat will be released.`} dialogTitle="Revoke invitation" dialogTrigger={<button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-600 nice-shadow transition hover:bg-rose-50 hover:text-rose-600"><X className="h-3.5 w-3.5" />Revoke</button>} functionToExecute={() => onRevoke(invite.invitation_uuid)} status="warning" /></div> : <span className="text-xs text-gray-400">No actions</span>}</td>
    </tr>
  )
}
