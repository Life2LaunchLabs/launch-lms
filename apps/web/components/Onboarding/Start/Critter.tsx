'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { ROLES, type StartRole } from './roles'

/**
 * The role's person: a hand-drawn scene in public/images/start/roles, one per role. They breathe a
 * little while you choose, and hop when setup is done.
 */
export default function Critter({ role, cheer = false, className }: { role: StartRole; cheer?: boolean; className?: string }) {
  const still = useReducedMotion()
  const motionProps = still ? {}
    : cheer ? { animate: { y: [0, -14, 0, -6, 0] }, transition: { duration: 1.2, repeat: Infinity, repeatDelay: 1.4 } }
      : { animate: { y: [0, -3, 0], rotate: [0, -0.6, 0] }, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const } }
  return <motion.img src={`/images/start/roles/${role}.svg`} alt={ROLES[role].label} draggable={false}
    className={cn('select-none object-contain', className)} {...motionProps} />
}
