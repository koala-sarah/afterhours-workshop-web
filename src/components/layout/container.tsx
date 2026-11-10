import * as React from "react";
import { cn } from "cn";

/** Site-width wrapper: 1400px max width, 6vw gutters on mobile, 4vw from md up. */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-site px-gutter-mobile md:px-gutter",
        className,
      )}
      {...props}
    />
  );
}
