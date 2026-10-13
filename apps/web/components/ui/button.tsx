import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none hover:cursor-pointer cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        // Pressable variants: a solid face over a darker edge that collapses on press.
        brand:
          "rounded-2xl bg-[var(--org-primary-color)] font-extrabold uppercase tracking-wide text-[var(--org-on-primary-color)] shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)] transition-[transform,box-shadow] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--org-primary-color)] focus-visible:ring-0 active:translate-y-[3px] active:shadow-[0_1px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)]",
        plan:
          "rounded-2xl bg-[var(--plan-face)] font-extrabold uppercase tracking-wide text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)] transition-[transform,box-shadow] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--plan-face)] focus-visible:ring-0 active:translate-y-[3px] active:shadow-[0_1px_0_var(--plan-edge)]",
        surface:
          "rounded-2xl border-2 border-border bg-card font-bold text-foreground shadow-[0_4px_0_hsl(var(--border))] transition-[transform,box-shadow] hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--org-primary-color)] focus-visible:ring-0 active:translate-y-[3px] active:shadow-[0_1px_0_hsl(var(--border))]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        cta: "h-14 px-8 text-sm",
        tall: "h-12 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
