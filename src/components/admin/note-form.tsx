"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { AdminActionState } from "@/lib/appointments/actions";

import { adminTextareaClass } from "./fields";

type NoteAction = (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;

/** Internal note on a record's history (appointment or customer). Only admins see notes. */
export function NoteForm({ recordId, action }: { recordId: string; action: NoteAction }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={recordId} />
      <label htmlFor="note" className="text-body-sm font-semibold">
        Add an internal note
      </label>
      <textarea
        id="note"
        name="note"
        required
        maxLength={2000}
        rows={3}
        className={adminTextareaClass}
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
