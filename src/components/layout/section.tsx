import * as React from "react";
import { cn } from "cn";

/** Colour themes used by the existing site's sections (see globals.css). */
export type SectionTheme = "bright" | "light" | "dark" | "dark-bold" | "black";

const paddingClasses = {
  none: "",
  sm: "py-section-sm",
  md: "py-section-md",
  lg: "py-section-lg",
} as const;

type SectionProps = React.ComponentProps<"section"> & {
  theme: SectionTheme;
  /** Vertical padding, matching Squarespace section heights. */
  padding?: keyof typeof paddingClasses;
};

/** Full-width coloured band. Children inherit the theme's text, heading and button colours. */
export function Section({
  theme,
  padding = "md",
  className,
  ...props
}: SectionProps) {
  return (
    <section
      data-section={theme}
      className={cn(paddingClasses[padding], className)}
      {...props}
    />
  );
}
