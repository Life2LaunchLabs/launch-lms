import { useCourseFieldSync, useCourse } from '@components/Contexts/CourseContext'
import LinkToUserGroup from '@components/Objects/Modals/Dash/EditCourseAccess/LinkToUserGroup'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { getAPIUrl } from '@services/config/config'
import { unLinkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { swrFetcher } from '@services/utils/ts/requests'
import { Globe, SquareUserRound, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import useSWR, { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import { Switch } from '@components/ui/switch'

function EditCourseAccess(_props: { orgslug: string; course_uuid?: string }) {
    void _props
    const { t } = useTranslation()
    const session = useLHSession() as any;
    const access_token = session?.data?.tokens?.access_token;
    const org = useOrg() as any;

    // Use the new field sync hook
    const {
        syncChanges,
        cancelPendingSync,
        courseStructure,
        isLoading,
        isSaving,
    } = useCourseFieldSync('editCourseAccess');

    const { data: usergroups } = useSWR(
        courseStructure?.course_uuid && org?.id ? `${getAPIUrl()}usergroups/resource/${courseStructure.course_uuid}?org_id=${org.id}` : null,
        (url) => swrFetcher(url, access_token)
    );

    // Track local public state
    const [isClientPublic, setIsClientPublic] = useState<boolean | undefined>(undefined);
    const [isGuestAccessEnabled, setIsGuestAccessEnabled] = useState<boolean>(false);
    const [isSharedAcrossOrgs, setIsSharedAcrossOrgs] = useState<boolean>(false);
    const hasInitializedRef = useRef(false);
    const previousPublicRef = useRef<boolean | undefined>(undefined);
    const previousSharedRef = useRef<boolean>(false);

    // Initialize local state from courseStructure
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isLoading && courseStructure?.public !== undefined && !hasInitializedRef.current) {
            setIsClientPublic(courseStructure.public);
            setIsGuestAccessEnabled(courseStructure.guest_access === true);
            setIsSharedAcrossOrgs(courseStructure.shared === true);
            previousPublicRef.current = courseStructure.public;
            previousSharedRef.current = courseStructure.shared === true;
            hasInitializedRef.current = true;
        }
    }, [isLoading, courseStructure?.public, courseStructure?.guest_access, courseStructure?.shared]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Sync public state changes to context
    useEffect(() => {
        // Skip if not initialized or values haven't changed
        if (!hasInitializedRef.current || isLoading || isSaving) return;
        if (isClientPublic === undefined) return;
        if (isClientPublic === previousPublicRef.current) return;

        // Sync the change immediately (no debounce for toggle actions)
        syncChanges({ public: isClientPublic }, true);
        previousPublicRef.current = isClientPublic;
    }, [isClientPublic, isLoading, isSaving, syncChanges]);

    useEffect(() => {
        if (!hasInitializedRef.current || isLoading || isSaving) return;
        if (isSharedAcrossOrgs === previousSharedRef.current) return;

        syncChanges({ shared: isSharedAcrossOrgs }, true);
        previousSharedRef.current = isSharedAcrossOrgs;
    }, [isSharedAcrossOrgs, isLoading, isSaving, syncChanges]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelPendingSync();
        };
    }, [cancelPendingSync]);

    const handleSetPublic = useCallback((value: boolean) => {
        setIsClientPublic(value);
    }, []);

    return (
        courseStructure ? (
            <section className="rounded-xl bg-white p-6 shadow-xs">
                <h2 className="text-lg font-bold text-gray-900">{t('dashboard.courses.access.title')}</h2>
                <div className={`mt-4 divide-y divide-gray-100 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
                    <SettingToggleRow
                        icon={<Globe className="h-4 w-4" />}
                        label="Public course"
                        description="Public courses are discoverable by anyone. Restricted courses require explicit user-group access."
                        checked={isClientPublic === true}
                        valueLabel={isClientPublic ? 'Public' : 'Restricted'}
                        onCheckedChange={handleSetPublic}
                    />
                    <SettingToggleRow
                        icon={<Users className="h-4 w-4" />}
                        label="Guest and signed-out access"
                        description="Let signed-out visitors open this published course directly and keep their progress until they create an account."
                        checked={isGuestAccessEnabled}
                        valueLabel={isGuestAccessEnabled ? 'Enabled' : 'Disabled'}
                        onCheckedChange={(checked) => {
                            setIsGuestAccessEnabled(checked)
                            syncChanges({ guest_access: checked }, true)
                        }}
                    />
                    <SettingToggleRow
                        label="Shared across organizations"
                        description="Make this course discoverable and usable by signed-in learners visiting through other org sites."
                        checked={isSharedAcrossOrgs}
                        valueLabel={isSharedAcrossOrgs ? 'Enabled' : 'Disabled'}
                        onCheckedChange={setIsSharedAcrossOrgs}
                    />
                </div>
                {!isClientPublic && <UserGroupsSection usergroups={usergroups} />}
            </section>
        ) : null
    );
}

function SettingToggleRow({
    icon,
    label,
    description,
    checked,
    valueLabel,
    onCheckedChange,
}: {
    icon?: React.ReactNode
    label: string
    description: string
    checked: boolean
    valueLabel: string
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
            <div className="flex min-w-0 gap-3">
                {icon ? (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                        {icon}
                    </div>
                ) : null}
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">{description}</p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-semibold text-gray-500">{valueLabel}</span>
                <Switch checked={checked} onCheckedChange={onCheckedChange} />
            </div>
        </div>
    )
}

function UserGroupsSection({ usergroups }: { usergroups: any[] }) {
    const { t } = useTranslation()
    const course = useCourse() as any;
    const [userGroupModal, setUserGroupModal] = useState(false);
    const session = useLHSession() as any;
    const access_token = session?.data?.tokens?.access_token;
    const org = useOrg() as any;

    const removeUserGroupLink = async (usergroup_id: number) => {
        try {
            const res = await unLinkResourcesToUserGroup(usergroup_id, course.courseStructure.course_uuid, org.id, access_token);
            if (res.status === 200) {
                toast.success(t('dashboard.courses.access.usergroups.toasts.unlink_success'));
                mutate(`${getAPIUrl()}usergroups/resource/${course.courseStructure.course_uuid}?org_id=${org.id}`);
            } else {
                toast.error(t('dashboard.courses.access.usergroups.toasts.link_error', { status: res.status, detail: res.data.detail }));
            }
        } catch {
            toast.error(t('dashboard.courses.access.usergroups.toasts.unlink_error'));
        }
    };

    return (
        <>
            <h3 className="mt-6 border-t border-gray-100 pt-5 text-sm font-semibold text-gray-900">{t('dashboard.courses.access.usergroups.title')}</h3>
            <div className="mt-3 overflow-x-auto">
                <table className="table-auto w-full text-left whitespace-nowrap rounded-md overflow-hidden">
                    <thead className="bg-gray-100 text-gray-500 rounded-xl uppercase">
                        <tr className="font-bolder text-sm">
                            <th className="py-3 px-4">{t('dashboard.courses.access.usergroups.table.name')}</th>
                            <th className="py-3 px-4">{t('dashboard.courses.access.usergroups.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="mt-5 bg-white rounded-md">
                        {usergroups?.map((usergroup: any) => (
                            <tr key={usergroup.invite_code_uuid} className="border-b border-gray-100 text-sm">
                                <td className="py-3 px-4">{usergroup.name}</td>
                                <td className="py-3 px-4">
                                    <ConfirmationModal
                                        confirmationButtonText={t('dashboard.courses.access.usergroups.modals.unlink_button')}
                                        confirmationMessage={t('dashboard.courses.access.usergroups.modals.unlink_message')}
                                        dialogTitle={t('dashboard.courses.access.usergroups.modals.unlink_title')}
                                        dialogTrigger={
                                            <button className="mr-2 flex space-x-2 hover:cursor-pointer p-1 px-3 bg-rose-700 rounded-md font-bold items-center text-sm text-rose-100">
                                                <X className="w-4 h-4" />
                                                <span>{t('dashboard.courses.access.usergroups.actions.delete_link')}</span>
                                            </button>
                                        }
                                        functionToExecute={() => removeUserGroupLink(usergroup.id)}
                                        status="warning"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-row-reverse mt-3 mr-2">
                <Modal
                    isDialogOpen={userGroupModal}
                    onOpenChange={() => setUserGroupModal(!userGroupModal)}
                    minHeight="no-min"
                    minWidth="md"
                    dialogContent={<LinkToUserGroup setUserGroupModal={setUserGroupModal} />}
                    dialogTitle={t('dashboard.courses.access.usergroups.modals.link_title')}
                    dialogDescription={t('dashboard.courses.access.usergroups.modals.link_description')}
                    dialogTrigger={
                        <button className="flex space-x-2 hover:cursor-pointer p-1 px-3 bg-green-700 rounded-md font-bold items-center text-xs sm:text-sm text-green-100">
                            <SquareUserRound className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>{t('dashboard.courses.access.usergroups.actions.link_to_usergroup')}</span>
                        </button>
                    }
                />
            </div>
        </>
    );
}

export default EditCourseAccess;
