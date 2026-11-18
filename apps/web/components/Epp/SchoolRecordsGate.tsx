'use client'

import React from 'react'
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { useSchoolRecords } from '@components/Hooks/useSchoolRecords'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** Pages about school records and the EPP show this instead when the organization has them off (PL-6). */
export default function SchoolRecordsGate({ orgslug, children }: { orgslug: string; children: React.ReactNode }) {
  const on = useSchoolRecords()
  if (on) return <>{children}</>
  return <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center">
    <GraduationCap size={28} className="text-muted-foreground" aria-hidden="true" />
    <h1 className="text-lg font-bold">School records are off</h1>
    <p className="text-sm text-muted-foreground">This organization doesn&rsquo;t use school records or the Education Plan and Profile. An admin can turn them on in Org settings.</p>
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.organization.general())} className="text-sm font-semibold underline">Org settings</Link>
  </div>
}
