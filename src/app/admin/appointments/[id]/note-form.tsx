"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { addAppointmentNote, type AdminActionState } from "@/lib/appointments/actions";

export function NoteForm({ appointmentId }: { appointmentId: string }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(addAppointmentNote, {
    status: "idle",
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={appointmentId} />
      <label htmlFor="note" className="text-body-sm font-semibold">
        Add an internal note
      </label>
      <textarea
        id="note"
        name="note"
        required
        maxLength={2000}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        placeholder="Only visible to admins"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Add note"}
        </Button>
        {state.status !== "idle" && (
          <p role={state.status === "error" ? "alert" : "status"} className="text-body-sm text-muted-foreground">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
