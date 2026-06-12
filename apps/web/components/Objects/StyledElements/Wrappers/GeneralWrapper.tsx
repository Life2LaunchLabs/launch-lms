import React from 'react'

function GeneralWrapperStyled({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1056px] p-6 tracking-tight relative">
      {children}
    </div>
  )
}

export default GeneralWrapperStyled
