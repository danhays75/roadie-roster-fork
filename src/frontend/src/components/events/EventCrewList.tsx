import type { CrewEventSummary, EventCrewRow } from "@/backend";
import { EventAnswer, EventAttendance } from "@/backend";
import { RoadiePhoto } from "@/components/roadie/RoadiePhoto";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { useMarkEventAttendance, useSaveEventAnswer } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Clock, X } from "lucide-react";
import { useState } from "react";

/** The longest reason or follow-up note the backend accepts. */
const NOTE_MAX_LENGTH = 1000;

/** One roadie's editable answer, reason, follow-up note and attendance. */
function EventCrewRowItem({
  event,
  row,
  readOnly,
}: {
  event: CrewEventSummary;
  row: EventCrewRow;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const saveAnswer = useSaveEventAnswer();
  const markAttendance = useMarkEventAttendance();

  const [answer, setAnswer] = useState<EventAnswer>(row.answer);
  const [reason, setReason] = useState(row.reason ?? "");
  const [followUp, setFollowUp] = useState(row.followUpNote ?? "");
  const [attendance, setAttendance] = useState<EventAttendance>(row.attendance);
  const [error, setError] = useState<string | null>(null);

  const pending = saveAnswer.isPending || markAttendance.isPending;
  const showAttendance =
    !readOnly && Date.now() >= Number(event.start / 1_000_000n);

  function handleSave() {
    const trimmedReason = reason.trim();
    if (answer === EventAnswer.cantGo && !trimmedReason) {
      setError(t("events.reasonRequired"));
      return;
    }
    setError(null);
    const trimmedFollowUp = followUp.trim();
    saveAnswer.mutate(
      {
        eventId: event.id,
        roadieId: row.roadieId,
        answer,
        reason: answer === EventAnswer.cantGo ? trimmedReason : null,
        followUpNote: trimmedFollowUp ? trimmedFollowUp : null,
      },
      {
        onError: () => setError(t("events.saveError")),
        onSuccess: () => {
          if (showAttendance) {
            markAttendance.mutate(
              {
                eventId: event.id,
                roadieId: row.roadieId,
                attendance,
              },
              { onError: () => setError(t("events.saveError")) },
            );
          }
        },
      },
    );
  }

  return (
    <li
      data-ocid="events.crew.row"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <RoadiePhoto
            id={row.roadieId}
            name={row.name}
            demoPhotoUrl={row.demoPhotoUrl}
            className="h-11 w-11 shrink-0"
            ocid="events.crew.photo"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            {row.followUpDue && (
              <span
                data-ocid="events.crew.follow_up_due"
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {t("events.followUpDue")}
              </span>
            )}
          </div>
        </div>

        <fieldset className="flex shrink-0 gap-2" disabled={readOnly}>
          <legend className="sr-only">{t("events.answer")}</legend>
          <Button
            type="button"
            size="sm"
            variant={answer === EventAnswer.going ? "default" : "outline"}
            className="touch-target"
            data-ocid="events.crew.going_button"
            aria-pressed={answer === EventAnswer.going}
            onClick={() => {
              setAnswer(EventAnswer.going);
              setError(null);
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t("events.answerGoing")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={answer === EventAnswer.cantGo ? "destructive" : "outline"}
            className="touch-target"
            data-ocid="events.crew.cant_go_button"
            aria-pressed={answer === EventAnswer.cantGo}
            onClick={() => {
              setAnswer(EventAnswer.cantGo);
              setError(null);
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("events.answerCantGo")}
          </Button>
        </fieldset>
      </div>

      {answer === EventAnswer.cantGo && (
        <div className="mt-3 space-y-1.5">
          <label
            htmlFor={`reason-${row.roadieId}`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t("events.reason")}
          </label>
          <Textarea
            id={`reason-${row.roadieId}`}
            data-ocid="events.crew.reason_input"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            placeholder={t("events.reasonPlaceholder")}
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            disabled={readOnly}
            aria-invalid={error === t("events.reasonRequired")}
          />
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        <label
          htmlFor={`followup-${row.roadieId}`}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("events.followUp")}
        </label>
        <Textarea
          id={`followup-${row.roadieId}`}
          data-ocid="events.crew.follow_up_input"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          placeholder={t("events.followUpPlaceholder")}
          maxLength={NOTE_MAX_LENGTH}
          rows={2}
          disabled={readOnly}
        />
      </div>

      {showAttendance && (
        <fieldset className="mt-3 flex flex-wrap gap-2" disabled={readOnly}>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("events.attended")}
          </legend>
          <Button
            type="button"
            size="sm"
            variant={attendance === EventAttendance.yes ? "default" : "outline"}
            className="touch-target"
            data-ocid="events.crew.attended_yes_button"
            aria-pressed={attendance === EventAttendance.yes}
            onClick={() => setAttendance(EventAttendance.yes)}
          >
            {t("events.attendedYes")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              attendance === EventAttendance.no ? "destructive" : "outline"
            }
            className="touch-target"
            data-ocid="events.crew.attended_no_button"
            aria-pressed={attendance === EventAttendance.no}
            onClick={() => setAttendance(EventAttendance.no)}
          >
            {t("events.attendedNo")}
          </Button>
        </fieldset>
      )}

      {error && (
        <p
          data-ocid="events.crew.error_state"
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            className="touch-target"
            data-ocid="events.crew.save_button"
            disabled={pending}
            onClick={handleSave}
          >
            {pending ? t("events.saving") : t("events.save")}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * One event's crew list. Each roadie row carries the answer buttons, the reason
 * box when they can't go, the follow-up note, the attended toggle after the
 * event and a Save per row. A cancelled event renders every row read-only.
 */
export function EventCrewList({
  event,
  rows,
}: {
  event: CrewEventSummary;
  rows: EventCrewRow[];
}) {
  const { t } = useI18n();
  const readOnly = event.cancelled;

  if (rows.length === 0) {
    return (
      <p
        data-ocid="events.crew.empty_state"
        className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground"
      >
        {t("events.crewEmpty")}
      </p>
    );
  }

  return (
    <ul data-ocid="events.crew.list" className={cn("space-y-3")}>
      {rows.map((row) => (
        <EventCrewRowItem
          key={row.roadieId.toString()}
          event={event}
          row={row}
          readOnly={readOnly}
        />
      ))}
    </ul>
  );
}
