import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

// Native <select> styled like the site's pill inputs (works well on phones and with screen readers).
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "w-full min-w-0 appearance-none rounded-field border border-current/60 bg-transparent py-field-y pr-10 pl-field-x font-body text-base text-current transition-colors outline-none focus-visible:border-current focus-visible:ring-3 focus-visible:ring-current/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-section-error aria-invalid:ring-3 aria-invalid:ring-section-error/25 [&>option]:text-ink",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 opacity-70"
      />
    </div>
  )
}

export { NativeSelect }
