'use client'

import React from 'react'
import UserCertificates from '@components/Pages/Trail/UserCertificates'

interface AccountBadgesProps {
  orgslug: string
}

export default function AccountBadges({ orgslug }: AccountBadgesProps) {
  return (
    <div className="rounded-xl bg-white p-5 nice-shadow sm:p-6">
      <UserCertificates orgslug={orgslug} />
    </div>
  )
}
