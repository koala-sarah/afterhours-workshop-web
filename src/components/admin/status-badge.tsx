import { cn } from "cn";

import { STATUS_LABELS, type AppointmentStatus } from "@/lib/appointments/format";

const STYLES: Record<AppointmentStatus, string> = {
  PENDING: "bg-butter text-ink",
  RESCHEDULE_REQUESTED: "bg-steel text-ink",
  APPROVED: "bg-olive text-paper",
  COMPLETED: "bg-ink text-paper",
  DECLINED: "bg-transparent text-muted-foreground ring-1 ring-current",
  CANCELLED: "bg-transparent text-muted-foreground ring-1 ring-current",
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-semibold whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
