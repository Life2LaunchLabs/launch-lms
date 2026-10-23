'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ROLES, type StartRole } from './roles'

/**
 * The role's character. Placeholder art from the prototype: the final four are still to come, and
 * they replace this component without touching the flow.
 */
export default function Critter({ role, cheer = false, className }: { role: StartRole; cheer?: boolean; className?: string }) {
  const { color: c, dark: dk } = ROLES[role]
  const still = useReducedMotion()
  const front = role === 'teacher' || role === 'district'
  const wave = still ? {} : { animate: { rotate: [0, -12, 0, -8, 0] }, transition: { duration: 1.6, repeat: Infinity, repeatDelay: 1.2 } }
  const accessory = {
    parent: <><path d="M98 40c-3-13 9-21 18-14" stroke={dk} strokeWidth="6" fill="none" strokeLinecap="round" />
      <motion.g animate={still ? undefined : { y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}><path d="M156 40c0-9 12-12 15-3 3-9 15-6 15 3 0 10-15 18-15 18s-15-8-15-18z" fill="#FF5D8F" /></motion.g></>,
    mentor: <><path d="M54 76C56 36 144 36 146 76Z" fill={dk} /><path d="M128 72h44a6 6 0 0 1 0 11h-44z" fill={dk} /><circle cx="100" cy="44" r="5" fill="#fff" opacity=".5" />
      <path d="M76 150q24 18 48 0" stroke="#fff" strokeWidth="3" fill="none" opacity=".7" /><circle cx="100" cy="166" r="7" fill="#C9D2D8" stroke={dk} strokeWidth="2" /></>,
    teacher: <><g fill="none" stroke="#14202a" strokeWidth="4"><circle cx="80" cy="104" r="19" /><circle cx="120" cy="104" r="19" /><path d="M99 102h2M61 100l-12-4M139 100l12-4" /></g>
      <motion.g style={{ originX: '28px', originY: '150px' }} {...wave}><rect x="8" y="128" width="40" height="30" rx="4" fill="#fff" stroke={dk} strokeWidth="3" /><path d="M28 128v30" stroke={dk} strokeWidth="3" /></motion.g></>,
    program: <><path d="M84 44c4-10 12-12 16-4 4-8 12-6 16 4" stroke={dk} strokeWidth="5" fill="none" strokeLinecap="round" />
      <motion.g style={{ originX: '160px', originY: '120px' }} {...wave}><path d="M160 112l32-18v44l-32-18z" fill="#fff" stroke={dk} strokeWidth="3" strokeLinejoin="round" /><rect x="150" y="110" width="14" height="14" rx="3" fill={dk} />
        <path d="M200 102q8 14 0 28" stroke={dk} strokeWidth="3" fill="none" strokeLinecap="round" /></motion.g></>,
    district: <><path d="M100 160l-18-10v20zM100 160l18-10v20z" fill={dk} /><circle cx="100" cy="160" r="5" fill={dk} />
      <motion.g style={{ originX: '28px', originY: '160px' }} {...wave}><rect x="10" y="124" width="36" height="46" rx="5" fill="#fff" stroke={dk} strokeWidth="3" /><rect x="19" y="119" width="18" height="9" rx="2" fill={dk} />
        <path d="M18 140h20M18 149h20M18 158h12" stroke={dk} strokeWidth="2.5" strokeLinecap="round" /></motion.g></>,
  }[role]
  return <svg viewBox="0 0 210 210" aria-hidden="true" overflow="visible" className={className}>
    <ellipse cx="100" cy="200" rx="50" ry="7" fill="#000" opacity=".1" />
    <motion.g animate={still ? undefined : { y: [0, -5, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
      {front ? null : <ellipse cx="40" cy="128" rx="13" ry="22" fill={c} transform="rotate(25 40 128)" />}
      <motion.g style={{ originX: '150px', originY: '140px' }} {...(front ? {} : wave)}><ellipse cx="160" cy="124" rx="13" ry="22" fill={c} transform="rotate(-30 160 124)" /></motion.g>
      <ellipse cx="78" cy="188" rx="17" ry="9" fill={dk} /><ellipse cx="122" cy="188" rx="17" ry="9" fill={dk} />
      <path d="M100 38C146 38 166 76 166 118C166 162 140 188 100 188C60 188 34 162 34 118C34 76 54 38 100 38Z" fill={c} />
      <ellipse cx="100" cy="146" rx="42" ry="32" fill="#fff" opacity=".22" />
      <circle cx="80" cy="104" r="14" fill="#fff" /><circle cx="120" cy="104" r="14" fill="#fff" />
      <circle cx="83" cy="106" r="7" fill="#14202a" /><circle cx="123" cy="106" r="7" fill="#14202a" />
      <circle cx="85.5" cy="103" r="2.5" fill="#fff" /><circle cx="125.5" cy="103" r="2.5" fill="#fff" />
      <ellipse cx="62" cy="128" rx="9" ry="5" fill="#FF7AA8" opacity=".5" /><ellipse cx="138" cy="128" rx="9" ry="5" fill="#FF7AA8" opacity=".5" />
      {cheer ? <path d="M86 126Q100 150 114 126Z" fill="#14202a" /> : <path d="M88 130Q100 145 112 130" fill="none" stroke="#14202a" strokeWidth="4.5" strokeLinecap="round" />}
      {accessory}
      {front ? <ellipse cx="40" cy="132" rx="12" ry="20" fill={c} transform="rotate(10 40 132)" /> : null}
    </motion.g>
  </svg>
}
