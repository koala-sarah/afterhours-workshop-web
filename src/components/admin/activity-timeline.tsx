import Link from "next/link";

import { formatDateTime } from "@/lib/appointments/format";

export type TimelineItem = {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  related_type?: string;
  related_id?: string;
  author: { full_name: string | null; email: string | null } | null;
};

const NOTE_TYPES = new Set(["appointment.note", "customer.note"]);

const RELATED: Record<string, { label: string; href: (id: string) => string }> = {
  APPOINTMENT: { label: "Appointment", href: (id) => `/admin/appointments/${id}` },
};

/**
 * Activity history, newest first. `showRelated` adds a link to the record each
 * entry belongs to (used on the customer profile, which mixes several records).
 */
export function ActivityTimeline({ items, showRelated }: { items: TimelineItem[]; showRelated?: boolean }) {
  if (items.length === 0) return <p className="text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-4 border-l pl-4">
      {items.map((item) => {
        const isNote = NOTE_TYPES.has(item.activity_type);
        const related = showRelated && item.related_type && item.related_id ? RELATED[item.related_type] : undefined;
        return (
          <li key={item.id} className="space-y-0.5">
            <p className={isNote ? "whitespace-pre-line" : "font-semibold"}>
              {isNote && <span className="mr-2 rounded bg-butter px-1.5 py-0.5 text-xs font-semibold">Note</span>}
              {item.description}
            </p>
            <p className="text-body-sm text-muted-foreground">
              {formatDateTime(item.created_at)} ·{" "}
              {item.author ? (item.author.full_name ?? item.author.email) : "Website"}
              {related && item.related_id && (
                <>
                  {" "}·{" "}
                  <Link href={related.href(item.related_id)} className="underline underline-offset-4">
                    {related.label}
                  </Link>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
