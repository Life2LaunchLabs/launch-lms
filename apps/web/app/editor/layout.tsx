import ForceLightTheme from '@components/Utils/ForceLightTheme'

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  )
}
