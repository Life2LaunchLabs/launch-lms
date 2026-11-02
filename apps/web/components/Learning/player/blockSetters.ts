import React from 'react'
import { setQuestionAnswer } from '../schema'

type Setters = { answer: (value: any) => void; unlocked: (value: boolean) => void } // eslint-disable-line no-unused-vars

/**
 * Per-block answer and unlock setters for a page with several blocks. Each block keeps the same two
 * functions across renders: blocks list them in effect dependencies, and a fresh function each render
 * re-ran those effects into a render loop (React error #185).
 */
export function useBlockSetters(questionIds: string[], unlockedByBlock: React.MutableRefObject<Record<string, boolean>>, setAnswer: any, setUnlocked: any) {
  return React.useMemo(() => {
    const cache: Record<string, Setters> = {}
    return (blockId: string) => (cache[blockId] ||= {
      answer: (value: any) => setAnswer?.((current: any) => setQuestionAnswer(current, blockId, value)),
      unlocked: (value: boolean) => {
        unlockedByBlock.current[blockId] = value
        setUnlocked?.(questionIds.every((id: string) => unlockedByBlock.current[id]))
      },
    })
  }, [questionIds, unlockedByBlock, setAnswer, setUnlocked])
}
