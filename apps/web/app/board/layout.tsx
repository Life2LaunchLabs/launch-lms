import ForceLightTheme from '@components/Utils/ForceLightTheme'

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  )
}
