"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input, type InputProps } from "@components/ui/input"

export interface PasswordInputProps extends Omit<InputProps, "type"> {
  wrapperClassName?: string
  /** Underlying input to render; defaults to the shared ui Input. */
  component?: React.ElementType
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, wrapperClassName, disabled, component: Field = Input, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <div className={cn("relative", wrapperClassName)}>
        <Field
          {...props}
          ref={ref}
          disabled={disabled}
          type={visible ? "text" : "password"}
          className={cn(className, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-gray-500 transition-colors hover:text-gray-950 disabled:pointer-events-none disabled:opacity-50"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
