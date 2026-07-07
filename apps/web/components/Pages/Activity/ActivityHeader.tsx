'use client'

import React from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'

interface ActivityHeaderProps {
  courseuuid: string
  orgslug: string
}

export default function ActivityHeader({
  courseuuid,
  orgslug,
}: ActivityHeaderProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={getUriWithOrg(orgslug, routePaths.org.course(courseuuid.replace('course_', '')))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted"
        aria-label="Close activity viewer"
      >
        <X size={18} />
      </Link>
    </div>
  )
}
