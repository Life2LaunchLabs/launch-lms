'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { MailPlus } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { getAPIUrl } from '@services/config/config'
import { inviteBatchUsers } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'

export default function InviteUsersDialog({
  open: isOpen,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>
  onInvited?: () => void
}) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [emails, setEmails] = React.useState('')
  const [selectedInviteCode, setSelectedInviteCode] = React.useState('')
  const [isSending, setIsSending] = React.useState(false)

  const { data: invites } = useSWR(
    org && accessToken ? `${getAPIUrl()}orgs/${org.id}/invites` : null,
    (url) => swrFetcher(url, accessToken)
  )

  React.useEffect(() => {
    if (!selectedInviteCode && invites?.length) {
      setSelectedInviteCode(invites[0].invite_code_uuid)
    }
  }, [invites, selectedInviteCode])

  const config = org?.config?.config
  const isV2 = config?.config_version?.startsWith('2')
  const signupMode = isV2
    ? config?.admin_toggles?.members?.signup_mode
    : config?.features?.members?.signup_mode
  const isInviteOnly = signupMode !== 'open'

  const sendInvites = async () => {
    if (!emails.trim()) {
      toast.error('Enter at least one email address')
      return
    }
    if (!selectedInviteCode) {
      toast.error('Create an invite code before inviting users')
      return
    }

    setIsSending(true)
    const toastId = toast.loading('Sending invitations…')
    const response = await inviteBatchUsers(org.id, emails, selectedInviteCode, accessToken)
    setIsSending(false)

    if (response.status === 200) {
      await mutate(`${getAPIUrl()}orgs/${org.id}/invites/users`)
      toast.success('Invitations sent', { id: toastId })
      setEmails('')
      onOpenChange(false)
      onInvited?.()
    } else {
      toast.error('Could not send invitations', { id: toastId })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle>Add users</DialogTitle>
          <DialogDescription>
            Send an email invitation to one or more people.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label htmlFor="invite-user-emails" className="text-sm font-medium text-gray-800">
              Email addresses
            </label>
            <textarea
              id="invite-user-emails"
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="alex@example.com, sam@example.com"
              className="min-h-36 w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-gray-500">Separate multiple email addresses with commas or new lines.</p>
          </div>

          {isInviteOnly && (
            <div className="space-y-2">
              <label htmlFor="invite-code" className="text-sm font-medium text-gray-800">
                Invite code
              </label>
              <select
                id="invite-code"
                value={selectedInviteCode}
                onChange={(event) => setSelectedInviteCode(event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {invites?.map((invite: any) => (
                  <option key={invite.invite_code_uuid} value={invite.invite_code_uuid}>
                    {invite.display_name || invite.invite_code}
                  </option>
                ))}
              </select>
              {!invites?.length && (
                <p className="text-xs text-amber-700">Create an invite code on the Signups tab first.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={sendInvites}
            disabled={isSending || !emails.trim() || !selectedInviteCode}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MailPlus className="h-4 w-4" />
            {isSending ? 'Sending…' : 'Send invitations'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
