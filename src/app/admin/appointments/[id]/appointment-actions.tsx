"use client";

import { useActionState, useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  approveAppointment,
  declineAppointment,
  proposeAppointmentTime,
  updateAppointmentStatus,
  type AdminActionState,
} from "@/lib/appointments/actions";
import type { AppointmentStatus } from "@/lib/appointments/format";

const IDLE: AdminActionState = { status: "idle" };
const field =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-body-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const DURATIONS = [30, 60, 90, 120, 180, 240, 360, 480];

type SlotOption = { key: string; label: string; date: string; time: string };

export function AppointmentActions({
  appointmentId,
  status,
  slotOptions,
  defaultDuration,
  schedule,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  /** Preferred / alternative / proposed times to offer as one-click choices. */
  slotOptions: SlotOption[];
  defaultDuration: number;
  /** Server-rendered list of approved bookings on the requested dates. */
  schedule: ReactNode;
}) {
  const canApprove = status === "PENDING" || status === "RESCHEDULE_REQUESTED";
  const canDecline = canApprove;
  const canPropose = canApprove || status === "APPROVED";
  const canComplete = status === "APPROVED";
  const canCancel = status === "PENDING" || status === "RESCHEDULE_REQUESTED" || status === "APPROVED";
  const canReopen = status === "DECLINED" || status === "CANCELLED";

  // Last result, shown above the panels. Kept here because a successful change
  // refreshes the page and the panel that ran it may no longer be shown.
  const [flash, setFlash] = useState<AdminActionState | null>(null);
  const report = useCallback(
    (state: AdminActionState) => setFlash(state.status === "idle" ? null : state),
    [],
  );

  const banner = flash && (
    <p
      role={flash.status === "error" ? "alert" : "status"}
      className={
        flash.status === "error"
          ? "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body-sm text-destructive"
          : "rounded-md bg-olive px-3 py-2 text-body-sm text-paper"
      }
    >
      {flash.message}
    </p>
  );

  if (!canApprove && !canPropose && !canReopen && !canCancel) {
    return (
      <div className="space-y-4">
        {banner}
        <p className="text-muted-foreground">This appointment is {status.toLowerCase()}. No further actions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner}
      {canApprove && (
        <Panel title="Approve" description="Confirms the booking. The time must not overlap another approved booking.">
          {schedule}
          <SlotForm
            action={approveAppointment}
            appointmentId={appointmentId}
            slotOptions={slotOptions}
            defaultDuration={defaultDuration}
            noteName="note"
            noteLabel="Note for the history (optional)"
            submitLabel="Approve appointment"
            onResult={report}
          />
        </Panel>
      )}

      {canPropose && (
        <Panel
          title="Suggest a different time"
          description="Records a proposed slot (must be free). Contact the customer, then approve once they agree."
        >
          <SlotForm
            action={proposeAppointmentTime}
            appointmentId={appointmentId}
            slotOptions={[]}
            defaultDuration={defaultDuration}
            noteName="message"
            noteLabel="Message / reason (optional)"
            submitLabel="Propose this time"
            variant="outline"
            onResult={report}
          />
        </Panel>
      )}

      {canComplete && (
        <Panel title="Mark completed" description="The work has been done.">
          <StatusForm appointmentId={appointmentId} target="COMPLETED" submitLabel="Mark completed" onResult={report} />
        </Panel>
      )}

      {canDecline && (
        <Panel title="Decline" description="The request can’t be accepted.">
          <ReasonForm action={declineAppointment} appointmentId={appointmentId} submitLabel="Decline request" destructive onResult={report} />
        </Panel>
      )}

      {canCancel && (
        <Panel title="Cancel" description="Cancel this request or booking (for example, the customer cancelled).">
          <StatusForm appointmentId={appointmentId} target="CANCELLED" submitLabel="Cancel appointment" destructive onResult={report} />
        </Panel>
      )}

      {canReopen && (
        <Panel title="Reopen" description="Move this back to pending so it can be approved.">
          <StatusForm appointmentId={appointmentId} target="PENDING" submitLabel="Reopen as pending" onResult={report} />
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-body text-base font-semibold normal-case">{title}</h3>
        <p className="text-body-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

type Action = (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;

/**
 * useActionState that also reports the result to the shared message area.
 * Reporting inside the action (not in an effect) matters: a successful change
 * refreshes the page, which can remove this form in the same update.
 */
function useReportedAction(action: Action, onResult: (state: AdminActionState) => void) {
  return useActionState<AdminActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    onResult(result);
    return result;
  }, IDLE);
}

function SlotForm({
  action,
  appointmentId,
  slotOptions,
  defaultDuration,
  noteName,
  noteLabel,
  submitLabel,
  variant = "default",
  onResult,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  appointmentId: string;
  slotOptions: SlotOption[];
  defaultDuration: number;
  noteName: string;
  noteLabel: string;
  submitLabel: string;
  variant?: "default" | "outline";
  onResult: (state: AdminActionState) => void;
}) {
  const [, formAction, pending] = useReportedAction(action, onResult);
  const [date, setDate] = useState(slotOptions[0]?.date ?? "");
  const [time, setTime] = useState(slotOptions[0]?.time ?? "");
  const durations = DURATIONS.includes(defaultDuration) ? DURATIONS : [...DURATIONS, defaultDuration].sort((a, b) => a - b);
  const idPrefix = `${noteName}-${appointmentId.slice(0, 8)}`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={appointmentId} />
      {slotOptions.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Use a requested time">
          {slotOptions.map((option) => {
            const selected = option.date === date && option.time === time;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setDate(option.date);
                  setTime(option.time);
                }}
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1 text-body-sm ${selected ? "border-ink bg-ink text-paper" : "hover:bg-muted"}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-body-sm">
          <span className="font-semibold">Date</span>
          <input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} id={`${idPrefix}-date`} />
        </label>
        <label className="space-y-1 text-body-sm">
          <span className="font-semibold">Start time</span>
          <input type="time" name="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} className={field} id={`${idPrefix}-time`} />
        </label>
        <label className="col-span-2 space-y-1 text-body-sm">
          <span className="font-semibold">Duration</span>
          <select name="duration" defaultValue={defaultDuration} className={field}>
            {durations.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`.replace(".5 h", " h 30")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-body-sm">
        <span className="font-semibold">{noteLabel}</span>
        <input name={noteName} maxLength={500} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ReasonForm({
  action,
  appointmentId,
  submitLabel,
  destructive,
  onResult,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  appointmentId: string;
  submitLabel: string;
  destructive?: boolean;
  onResult: (state: AdminActionState) => void;
}) {
  const [, formAction, pending] = useReportedAction(action, onResult);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={appointmentId} />
      <label className="block space-y-1 text-body-sm">
        <span className="font-semibold">Reason (optional, kept in the history)</span>
        <input name="reason" maxLength={500} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function StatusForm({
  appointmentId,
  target,
  submitLabel,
  destructive,
  onResult,
}: {
  appointmentId: string;
  target: "CANCELLED" | "COMPLETED" | "PENDING";
  submitLabel: string;
  destructive?: boolean;
  onResult: (state: AdminActionState) => void;
}) {
  const [, formAction, pending] = useReportedAction(updateAppointmentStatus, onResult);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={appointmentId} />
      <input type="hidden" name="status" value={target} />
      <label className="block space-y-1 text-body-sm">
        <span className="font-semibold">Reason (optional, kept in the history)</span>
        <input name="reason" maxLength={500} className={field} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={destructive ? "destructive" : "outline"} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
