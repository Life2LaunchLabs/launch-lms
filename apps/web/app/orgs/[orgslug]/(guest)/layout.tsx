function GuestLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1">{children}</div>
    </div>
  )
}

export default function GuestLayout(props: {
  children: React.ReactNode
  params: Promise<{ orgslug: string }>
}) {
  return <GuestLayoutContent>{props.children}</GuestLayoutContent>
}
