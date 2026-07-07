interface DashboardWelcomeHeaderProps {
  displayName: string
}

export default function DashboardWelcomeHeader({
  displayName,
}: DashboardWelcomeHeaderProps) {
  return (
    <div className="w-full pt-8 pb-2 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
        My Dashboard
      </p>
      <h1 className="text-xl font-bold tracking-tight text-foreground">
        Welcome, {displayName}
      </h1>
    </div>
  )
}
