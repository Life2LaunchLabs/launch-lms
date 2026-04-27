'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type ContainerBreakpointMap = Record<string, number>

type OrderedBreakpoint = {
  name: string
  minWidth: number
}

/* eslint-disable no-unused-vars */
export interface ContainerBreakpointContextValue {
  width: number | null
  current: string | null
  breakpoints: ContainerBreakpointMap
  orderedBreakpoints: OrderedBreakpoint[]
  is(name: string): boolean
  atLeast(name: string): boolean
  below(name: string): boolean
  between(minName: string, maxName: string): boolean
}
/* eslint-enable no-unused-vars */

const ContainerBreakpointContext = createContext<ContainerBreakpointContextValue | null>(null)

function getOrderedBreakpoints(breakpoints: ContainerBreakpointMap): OrderedBreakpoint[] {
  return Object.entries(breakpoints)
    .map(([name, minWidth]) => ({ name, minWidth }))
    .sort((a, b) => a.minWidth - b.minWidth)
}

function getActiveBreakpoint(
  width: number | null,
  orderedBreakpoints: OrderedBreakpoint[]
): string | null {
  if (orderedBreakpoints.length === 0) return null
  if (width === null) return orderedBreakpoints[0].name

  let active = orderedBreakpoints[0].name
  for (const breakpoint of orderedBreakpoints) {
    if (width >= breakpoint.minWidth) {
      active = breakpoint.name
    }
  }
  return active
}

type ContainerBreakpointProviderProps = {
  breakpoints: ContainerBreakpointMap
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function ContainerBreakpointProvider({
  breakpoints,
  children,
  className,
  style,
}: ContainerBreakpointProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)

  const orderedBreakpoints = useMemo(
    () => getOrderedBreakpoints(breakpoints),
    [breakpoints]
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setWidth(entry.contentRect.width)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const current = useMemo(
    () => getActiveBreakpoint(width, orderedBreakpoints),
    [width, orderedBreakpoints]
  )

  const value = useMemo<ContainerBreakpointContextValue>(() => {
    const getMinWidth = (name: string) =>
      orderedBreakpoints.find((breakpoint) => breakpoint.name === name)?.minWidth

    return {
      width,
      current,
      breakpoints,
      orderedBreakpoints,
      is: (name: string) => current === name,
      atLeast: (name: string) => {
        const minWidth = getMinWidth(name)
        if (minWidth === undefined || width === null) return false
        return width >= minWidth
      },
      below: (name: string) => {
        const minWidth = getMinWidth(name)
        if (minWidth === undefined || width === null) return false
        return width < minWidth
      },
      between: (minName: string, maxName: string) => {
        const minWidth = getMinWidth(minName)
        const maxWidth = getMinWidth(maxName)
        if (minWidth === undefined || maxWidth === undefined || width === null) return false
        return width >= minWidth && width < maxWidth
      },
    }
  }, [breakpoints, current, orderedBreakpoints, width])

  return (
    <ContainerBreakpointContext.Provider value={value}>
      <div ref={containerRef} className={className} style={style}>
        {children}
      </div>
    </ContainerBreakpointContext.Provider>
  )
}

export function useContainerBreakpoints() {
  const context = useContext(ContainerBreakpointContext)

  if (!context) {
    throw new Error('useContainerBreakpoints must be used within a ContainerBreakpointProvider')
  }

  return context
}
