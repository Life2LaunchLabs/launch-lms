function GeneralWrapperStyled({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16 tracking-tight relative" style={{ zIndex: 'var(--z-content)' }}>
      {children}
    </div>
  )
}

export default GeneralWrapperStyled
