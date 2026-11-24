import type { CrewEventSummary, DateTime } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { useCreateCrewEvent, useUpdateCrewEvent } from "@/hooks/useQueries";
import { timestampToDate } from "@/lib/format";
import { useEffect, useState } from "react";

/** The `YYYY-MM-DD` value of an `<input type="date">` for a local Date. */
function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The `HH:MM` value of an `<input type="time">` for a local Date. */
function toTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Combine a local date and time input into the nanosecond `DateTime` the
 * backend stores. Returns null when either value is missing or invalid.
 */
function toDateTime(dateValue: string, timeValue: string): DateTime | null {
  if (!dateValue || !timeValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return null;
  }
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return BigInt(local.getTime()) * 1_000_000n;
}

/**
 * The New / Edit event dialog. Captures name, date, time, place and an optional
 * note. Editing keeps every answer, reason, follow-up note and attendance the
 * backend already holds, because the update only writes the event fields.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The event being edited, or null when creating a new one. */
  event: CrewEventSummary | null;
}) {
  const { t } = useI18n();
  const createEvent = useCreateCrewEvent();
  const updateEvent = useUpdateCrewEvent();
  const isEditing = event !== null;
  const pending = createEvent.isPending || updateEvent.isPending;

  const [name, setName] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed the draft once each time the dialog opens, from the event being edited
  // or from a blank draft for a new event.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      const start = timestampToDate(event.start);
      setName(event.name);
      setDateValue(start ? toDateInput(start) : "");
      setTimeValue(start ? toTimeInput(start) : "");
      setPlace(event.place);
      setNote(event.note ?? "");
    } else {
      setName("");
      setDateValue("");
      setTimeValue("");
      setPlace("");
      setNote("");
    }
  }, [open, event]);

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("events.form.nameRequired"));
      return;
    }
    const start = toDateTime(dateValue, timeValue);
    if (start === null) {
      setError(t("events.form.dateRequired"));
      return;
    }
    setError(null);
    const trimmedPlace = place.trim();
    const trimmedNote = note.trim();
    const args = {
      name: trimmedName,
      start,
      place: trimmedPlace,
      note: trimmedNote ? trimmedNote : null,
    };
    const onError = () => setError(t("events.form.error"));
    if (event) {
      updateEvent.mutate(
        { eventId: event.id, ...args },
        { onSuccess: () => onOpenChange(false), onError },
      );
    } else {
      createEvent.mutate(args, {
        onSuccess: () => onOpenChange(false),
        onError,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ocid="events.form.dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wide">
            {isEditing ? t("events.form.titleEdit") : t("events.form.titleNew")}
          </DialogTitle>
          <DialogDescription>{t("events.form.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">{t("events.form.name")}</Label>
            <Input
              id="event-name"
              data-ocid="events.form.name_input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("events.form.namePlaceholder")}
              maxLength={120}
              className="touch-target"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="event-date">{t("events.form.date")}</Label>
              <Input
                id="event-date"
                type="date"
                data-ocid="events.form.date_input"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="touch-target"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-time">{t("events.form.time")}</Label>
              <Input
                id="event-time"
                type="time"
                data-ocid="events.form.time_input"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="touch-target"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-place">{t("events.form.place")}</Label>
            <Input
              id="event-place"
              data-ocid="events.form.place_input"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={t("events.form.placePlaceholder")}
              maxLength={200}
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-note">{t("events.form.note")}</Label>
            <Textarea
              id="event-note"
              data-ocid="events.form.note_input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("events.form.notePlaceholder")}
              maxLength={1000}
              rows={3}
            />
          </div>
          {error && (
            <p
              data-ocid="events.form.error_state"
              className="text-sm font-medium text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="touch-target"
              data-ocid="events.form.cancel_button"
              onClick={() => onOpenChange(false)}
            >
              {t("events.cancelKeep")}
            </Button>
            <Button
              type="submit"
              className="touch-target"
              data-ocid="events.form.submit_button"
              disabled={pending}
            >
              {isEditing
                ? pending
                  ? t("events.form.saving")
                  : t("events.form.save")
                : pending
                  ? t("events.form.creating")
                  : t("events.form.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
