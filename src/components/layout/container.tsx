import * as React from "react";
import { cn } from "cn";

/**
 * Site-width wrapper, as on the existing site: 6vw gutters on mobile, 4vw from md up,
 * and the 1400px max width applies to the content inside the gutters.
 * `className` is applied to the inner content box.
 */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className="w-full px-gutter-mobile md:px-gutter">
      <div className={cn("mx-auto w-full max-w-site", className)} {...props} />
    </div>
  );
}
