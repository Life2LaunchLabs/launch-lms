import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { createInviteCode } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'
import { Ticket, UserSquare } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import React from 'react'
import toast from 'react-hot-toast'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Switch } from '@components/ui/switch'
import { usePlan } from '@components/Hooks/usePlan'
import { planMeetsRequirement } from '@services/plans/plans'
import dayjs from 'dayjs'

type OrgInviteCodeGenerateProps = {
    setInvitesModal: any
}

function OrgInviteCodeGenerate(props: OrgInviteCodeGenerateProps) {
  const { t } = useTranslation()
    const org = useOrg() as any
    const session = useLHSession() as any
    const access_token = session?.data?.tokens?.access_token;
    const currentPlan = usePlan()
    const hasUserGroups = planMeetsRequirement(currentPlan, 'full')
      && (org?.config?.config?.resolved_features?.usergroups?.enabled ?? true)
    const [linkToUserGroup, setLinkToUserGroup] = React.useState(false);
    const [usergroup_id, setUsergroup_id] = React.useState(0);
    const [displayName, setDisplayName] = React.useState('');
    const [expiryDate, setExpiryDate] = React.useState(dayjs().add(1, 'year').format('YYYY-MM-DD'));

    const { data: usergroups } = useSWR(
        org && hasUserGroups ? `${getAPIUrl()}usergroups/org/${org.id}?org_id=${org.id}` : null,
        (url) => swrFetcher(url, access_token)
    )

    async function handleGenerate() {
        const selectedUserGroupId = usergroup_id || usergroups?.[0]?.id
        const ugId = hasUserGroups && linkToUserGroup && selectedUserGroupId ? selectedUserGroupId : undefined
        let res = await createInviteCode(org.id, session.data?.tokens?.access_token, {
            usergroupId: ugId,
            displayName,
            expiryDate,
        })
        if (res.status == 200) {
            mutate(`${getAPIUrl()}orgs/${org.id}/invites`)
            props.setInvitesModal(false)
        } else {
            toast.error(t('dashboard.users.signups.generate_modal.toasts.error', { status: res.status, detail: res.data.detail }))
        }
    }

    return (
        <div className='flex flex-col space-y-4 pt-2'>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label htmlFor="invite-display-name" className="text-sm font-medium text-gray-800">Display name</label>
                    <input
                        id="invite-display-name"
                        value={displayName}
                        maxLength={80}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Spring cohort"
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="invite-expiry-date" className="text-sm font-medium text-gray-800">Expiry date</label>
                    <input
                        id="invite-expiry-date"
                        type="date"
                        value={expiryDate}
                        min={dayjs().add(1, 'day').format('YYYY-MM-DD')}
                        onChange={(event) => setExpiryDate(event.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                </div>
            </div>

            {hasUserGroups && usergroups?.length > 0 && (
                <div className="flex items-start justify-between gap-6 rounded-lg border border-gray-100 px-4 py-3">
                    <div className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                            <UserSquare className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">Link to user group</h3>
                            <p className="mt-1 text-xs text-gray-500">Automatically add people who use this code to a group.</p>
                        </div>
                    </div>
                    <Switch checked={linkToUserGroup} onCheckedChange={setLinkToUserGroup} />
                </div>
            )}

            {hasUserGroups && linkToUserGroup && usergroups?.length > 0 && (
                <div className='bg-blue-50 rounded-lg p-3'>
                    <label className='text-xs font-medium text-blue-700 mb-1.5 block'>Select User Group</label>
                    <select
                        value={usergroup_id || usergroups[0].id}
                        onChange={(e) => setUsergroup_id(Number(e.target.value))}
                        className='w-full p-2 rounded-md text-sm bg-card border border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none'
                    >
                        {usergroups.map((usergroup: any) => (
                            <option key={usergroup.id} value={usergroup.id}>
                                {usergroup.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {hasUserGroups && (!usergroups || usergroups.length === 0) && (
                <div className='flex items-center justify-center space-x-3 text-xs py-1'>
                    <span className='text-yellow-700 font-medium'>
                        {t('dashboard.users.signups.generate_modal.no_usergroups')}
                    </span>
                    <Link
                        className='px-3 text-blue-700 font-bold rounded-full py-1 bg-blue-100'
                        target='_blank'
                        href={getUriWithOrg(org.slug, routePaths.org.dash.users.usergroups())}
                    >
                        {t('dashboard.users.signups.generate_modal.create_usergroup_link')}
                    </Link>
                </div>
            )}

            {/* Generate button */}
            <div className='flex justify-end pt-1'>
                <button
                    onClick={handleGenerate}
                    disabled={!expiryDate}
                    className="flex items-center space-x-2 rounded-lg bg-green-700 p-2 px-5 text-sm font-bold text-green-100 transition-colors hover:cursor-pointer hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Ticket className="w-4 h-4" />
                    <span>{t('dashboard.users.signups.generate_modal.generate_button')}</span>
                </button>
            </div>
        </div>
    )
}

export default OrgInviteCodeGenerate
