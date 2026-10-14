'use client'
import { ChatCircleDots } from '@phosphor-icons/react'
import { openCandidatePanel } from '@components/Candidate/CandidateExperience'
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Admin sidebar Feedback button, shown directly above the account menu. */
export default function DashFeedbackButton({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => openCandidatePanel('feedback')}
          aria-label="Send feedback"
          className={cn(
            "mb-1 flex items-center w-full rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-all",
            isCollapsed ? "justify-center h-10" : "px-3 py-2 gap-3"
          )}
        >
          <ChatCircleDots size={20} weight="fill" />
          {!isCollapsed && <span className="text-sm font-medium">Feedback</span>}
        </button>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right" className="z-tooltip bg-[#1a1a1b] border-white/10 text-white text-xs px-2 py-1 shadow-lg shadow-black/20">
          Feedback
        </TooltipContent>
      )}
    </Tooltip>
  )
}
