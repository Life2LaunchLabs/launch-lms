import React from 'react'

function GeneralWrapperStyled({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`general-content-wrapper mx-auto w-full ${wide ? "max-w-none" : "max-w-[1056px]"} p-6 tracking-tight relative`}>
      {children}
    </div>
  )
}

export default GeneralWrapperStyled
