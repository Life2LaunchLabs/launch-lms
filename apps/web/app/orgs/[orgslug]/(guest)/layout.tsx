'use client'
import { use } from 'react'
import { SessionProvider } from '@components/Contexts/AuthContext'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'

function GuestLayoutContent({
  children,
  orgslug,
}: {
  children: React.ReactNode
  orgslug: string
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <GuestHeader orgslug={orgslug} />
      <div className="flex-1">{children}</div>
    </div>
  )
}

export default function GuestLayout(props: {
  children: React.ReactNode
  params: Promise<{ orgslug: string }>
}) {
  const params = use(props.params)
  return (
    <SessionProvider>
      <GuestLayoutContent orgslug={params.orgslug}>
        {props.children}
      </GuestLayoutContent>
    </SessionProvider>
  )
}
