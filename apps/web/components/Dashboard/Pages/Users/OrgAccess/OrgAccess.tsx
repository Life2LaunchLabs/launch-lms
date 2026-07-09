import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { CalendarDays, ChevronRight, Copy, Globe, Ticket, Trash2 } from 'lucide-react'
import React from 'react'
import useSWR, { mutate } from 'swr'
import dayjs from 'dayjs'
import {
  changeSignupMechanism,
  deleteInviteCode,
} from '@services/organizations/invites'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import OrgInviteCodeGenerate from '@components/Objects/Modals/Dash/OrgAccess/OrgInviteCodeGenerate'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useTranslation } from 'react-i18next'
import SignupQrDialog from './SignupQrDialog'
import { Switch } from '@components/ui/switch'

function OrgAccess() {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token;
  const { data: invites } = useSWR(
    org ? `${getAPIUrl()}orgs/${org?.id}/invites` : null,
    (url) => swrFetcher(url, access_token)
  )
  const [invitesModal, setInvitesModal] = React.useState(false)
  const [joinMethodOverride, setJoinMethodOverride] = React.useState<'open' | 'inviteOnly' | null>(null)
  const [isChangingJoinMethod, setIsChangingJoinMethod] = React.useState(false)
  const [selectedInvite, setSelectedInvite] = React.useState<any>(null)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const router = useRouter()

  const config = org?.config?.config
  const isV2 = config?.config_version?.startsWith('2')
  const signupMode = isV2
    ? config?.admin_toggles?.members?.signup_mode
    : config?.features?.members?.signup_mode
  const configuredJoinMethod = (signupMode || 'open') === 'open' ? 'open' : 'inviteOnly'
  const joinMethod = joinMethodOverride || configuredJoinMethod

  async function deleteInvite(invite: any) {
    const toastId = toast.loading(t('dashboard.users.signups.invite_codes.toasts.deleting'))
    let res = await deleteInviteCode(org.id, invite.invite_code_uuid, access_token)
    if (res.status == 200) {
      mutate(`${getAPIUrl()}orgs/${org.id}/invites`)
      if (selectedInvite?.invite_code_uuid === invite.invite_code_uuid) {
        setDetailsOpen(false)
        setSelectedInvite(null)
      }
      toast.success(t('dashboard.users.signups.invite_codes.toasts.delete_success'), {id:toastId})
    } else {
      toast.error(t('dashboard.users.signups.invite_codes.toasts.delete_error'), {id:toastId})
    }
  }

  async function changeJoinMethod(method: 'open' | 'inviteOnly') {
    const previousMethod = joinMethod
    setJoinMethodOverride(method)
    setIsChangingJoinMethod(true)
    const toastId = toast.loading(t('dashboard.users.signups.invite_codes.toasts.changing_method'))
    let res = await changeSignupMechanism(org.id, method, access_token)
    setIsChangingJoinMethod(false)
    if (res.status == 200) {
      router.refresh()
      await mutate(`${getAPIUrl()}orgs/slug/${org?.slug}`)
      toast.success(t('dashboard.users.signups.invite_codes.toasts.change_success', { method }), {id:toastId})
    } else {
      setJoinMethodOverride(previousMethod)
      toast.error(t('dashboard.users.signups.invite_codes.toasts.change_error'), {id:toastId})
    }
  }

  const inviteCount = invites?.length ?? 0
  const selectedInviteUrl = selectedInvite
    ? getUriWithOrg(org.slug, `/signup?inviteCode=${selectedInvite.invite_code}`)
    : ''

  const openInviteDetails = (invite: any) => {
    setSelectedInvite(invite)
    setDetailsOpen(true)
  }

  const copyInviteLink = async (invite: any) => {
    const signupUrl = getUriWithOrg(org.slug, `/signup?inviteCode=${invite.invite_code}`)
    await navigator.clipboard.writeText(signupUrl)
    toast.success('Signup link copied')
  }

  return (
    <>
      {org ? (
        <>
          <div className="h-6"></div>
          <div className="ml-10 mr-10 mx-auto bg-white rounded-xl shadow-xs px-4 py-4 anit ">
            <div className="flex flex-col bg-gray-50 -space-y-1  px-5 py-3 rounded-md mb-3 ">
              <h1 className="font-bold text-xl text-gray-800">{t('dashboard.users.signups.title')}</h1>
              <h2 className="text-gray-500  text-md">
                {' '}
                {t('dashboard.users.signups.subtitle')}{' '}
              </h2>
            </div>
            <div className="flex items-start justify-between gap-6 rounded-lg border border-gray-100 px-4 py-4">
              <div className="flex min-w-0 gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                  {joinMethod === 'open' ? <Globe className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Public signups</h3>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {joinMethod === 'open'
                      ? t('dashboard.users.signups.open.description')
                      : t('dashboard.users.signups.closed.description')}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-semibold text-gray-500">
                  {joinMethod === 'open' ? 'Public' : 'Invite only'}
                </span>
                <Switch
                  checked={joinMethod === 'open'}
                  disabled={isChangingJoinMethod}
                  onCheckedChange={(checked) => void changeJoinMethod(checked ? 'open' : 'inviteOnly')}
                  aria-label="Allow public signups"
                />
              </div>
            </div>
            <div
              className={
                joinMethod == 'open'
                  ? 'opacity-20 pointer-events-none'
                  : 'pointer-events-auto'
              }
            >
              <div className="flex flex-col bg-gray-50 -space-y-1  px-5 py-3 rounded-md mt-3 mb-3 ">
                <h1 className="font-bold text-xl text-gray-800">
                  {t('dashboard.users.signups.invite_codes.title')}
                </h1>
                <h2 className="text-gray-500  text-md">
                  {t('dashboard.users.signups.invite_codes.subtitle')}{' '}
                </h2>
              </div>
              <div className="space-y-2">
                {invites?.map((invite: any) => {
                  const expiry = dayjs(invite.expires_at || invite.created_at)
                    .add(invite.expires_at ? 0 : 1, 'year')
                    .format('MMM D, YYYY')
                  return (
                    <div
                      key={invite.invite_code_uuid}
                      role="button"
                      tabIndex={0}
                      onClick={() => openInviteDetails(invite)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') openInviteDetails(invite)
                      }}
                      className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 transition hover:border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                        <Ticket className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-gray-800">{invite.display_name || invite.invite_code}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-[11px] text-gray-500 sm:text-xs">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Expires </span>{expiry}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void copyInviteLink(invite)
                        }}
                        className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-white hover:text-gray-700"
                        title="Copy signup link"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <div onClick={(event) => event.stopPropagation()}>
                        <ConfirmationModal
                          confirmationButtonText={t('dashboard.users.signups.invite_codes.actions.delete_code')}
                          confirmationMessage={t('dashboard.users.signups.invite_codes.actions.delete_confirmation_message')}
                          dialogTitle={t('dashboard.users.signups.invite_codes.actions.delete_confirmation_title')}
                          dialogTrigger={
                            <button type="button" className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600" title="Delete invite code">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          }
                          functionToExecute={() => deleteInvite(invite)}
                          status="warning"
                        />
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                    </div>
                  )
                })}
              </div>
              <div className='flex items-center justify-between mt-3 mr-2'>
                <span className='text-xs text-gray-400 ml-2'>
                  {inviteCount} / 6 invite codes used
                </span>
                <Modal
                  isDialogOpen={
                    invitesModal
                  }
                  onOpenChange={() =>
                    setInvitesModal(!invitesModal)
                  }
                  minHeight="no-min"
                  minWidth='lg'
                  dialogContent={
                    <OrgInviteCodeGenerate
                      setInvitesModal={setInvitesModal}
                    />
                  }
                  dialogTitle={t('dashboard.users.signups.invite_codes.actions.generate_title')}
                  dialogDescription={t('dashboard.users.signups.invite_codes.actions.generate_description')}
                  dialogTrigger={
                    <button
                      className=" flex space-x-2 hover:cursor-pointer p-1 px-3 bg-green-700 rounded-md font-bold items-center text-sm text-green-100"
                    >
                      <Ticket className="w-4 h-4" />
                      <span> {t('dashboard.users.signups.invite_codes.actions.generate')}</span>
                    </button>
                  }
                />

              </div>

            </div>
          </div>
          <SignupQrDialog
            invite={selectedInvite}
            url={selectedInviteUrl}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
        </>
      ) : (
        <PageLoading />
      )}
    </>
  )
}

export default OrgAccess
