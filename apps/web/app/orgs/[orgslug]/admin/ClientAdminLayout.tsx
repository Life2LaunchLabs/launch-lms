'use client';
import DashLeftMenu from '@components/Dashboard/Menus/DashLeftMenu';
import DashMobileMenu from '@components/Dashboard/Menus/DashMobileMenu';
import AdminAuthorization from '@components/Security/AdminAuthorization'
import React from 'react'
import { useMediaQuery } from 'usehooks-ts';

function ClientAdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: any
}) {
    const isMobile = useMediaQuery('(max-width: 768px)')

    return (
        <AdminAuthorization authorizationMode="page">
            <div className="flex min-h-[100dvh] flex-col md:h-[100dvh] md:flex-row md:overflow-hidden">
                {isMobile ? (
                    <DashMobileMenu />
                ) : (
                    <DashLeftMenu />
                )}
                <div className="relative isolate flex min-w-0 w-full md:h-[100dvh] md:overflow-y-auto">{children}</div>
            </div>
        </AdminAuthorization>
    )
}

export default ClientAdminLayout
