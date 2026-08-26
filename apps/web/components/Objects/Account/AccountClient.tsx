'use client'

import React from 'react'
import AccountPageShell, { AccountPageTab } from '@components/Objects/Account/AccountPageShell'
import AccountGeneral from '@components/Objects/Account/subpages/AccountGeneral'
import AccountSecurity from '@components/Objects/Account/subpages/AccountSecurity'
import AccountMessages from '@components/Objects/Account/subpages/AccountMessages'
import AccountOrganizations from '@components/Objects/Account/subpages/AccountOrganizations'
import AccountPreferences from '@components/Objects/Account/subpages/AccountPreferences'

interface AccountClientProps {
  orgslug: string
  subpage: string
}

const AccountClient = ({ orgslug, subpage }: AccountClientProps) => {
  const renderSubpage = () => {
    switch (subpage) {
      case 'messages':
        return <AccountMessages orgslug={orgslug} />
      case 'organizations':
        return <AccountOrganizations orgslug={orgslug} />
      case 'preferences':
        return <AccountPreferences />
      default:
        return <div className="space-y-6"><AccountGeneral /><AccountSecurity /></div>
    }
  }

  return (
    <AccountPageShell orgslug={orgslug} activeTab={(subpage || 'account') as AccountPageTab}>
      {renderSubpage()}
    </AccountPageShell>
  )
}

export default AccountClient
