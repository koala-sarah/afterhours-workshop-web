import * as React from "react"
import { cn } from "cn"

// Styled to match the existing site's message field: rounded box, 1px border, transparent fill.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-textarea border border-current/60 bg-transparent px-field-x py-field-y font-body text-base text-current transition-colors outline-none placeholder:text-current/50 focus-visible:border-current focus-visible:ring-3 focus-visible:ring-current/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-section-error aria-invalid:ring-3 aria-invalid:ring-section-error/25",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
