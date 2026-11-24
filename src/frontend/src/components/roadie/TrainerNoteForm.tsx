import type { DateOnly, RoadieId, Shift, TrainerNote } from "@/backend";
import { Shift as ShiftEnum } from "@/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccessState } from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useAddTrainerNote,
  useDemoState,
  useStoreInfo,
  useUpdateTrainerNote,
} from "@/hooks/useQueries";
import {
  dateOnlyToInputValue,
  inputValueToDateOnly,
  pretendDateToInstant,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useEffect, useMemo, useState } from "react";

/** The maximum length of each note field, matching the backend limit. */
export const TRAINER_NOTE_MAX_LENGTH = 1000;

/** The store's shift start times, used to pick the current shift. */
interface ShiftTimes {
  amShiftStart?: bigint;
  pmShiftStart?: bigint;
}

/**
 * The current shift at `now`, in store time: AM before the PM shift start and
 * PM from then on. Falls back to AM when the store times are unknown.
 */
function currentShift(now: Date, times: ShiftTimes): Shift {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const pmStart = Number(times.pmShiftStart ?? 960n);
  return minutes >= pmStart ? ShiftEnum.pm : ShiftEnum.am;
}

/**
 * The default day and shift for a new note: today in store time, or the demo
 * pretend date when demo mode is on, with the current shift.
 */
function useDefaultDayAndShift(): { day: DateOnly; shift: Shift } {
  const { data: demo } = useDemoState();
  const { data: store } = useStoreInfo();
  const pretendDate = demo?.enabled ? demo.pretendDate : undefined;

  return useMemo(() => {
    const times: ShiftTimes = {
      amShiftStart: store?.amShiftStart,
      pmShiftStart: store?.pmShiftStart,
    };
    const instant = pretendDate
      ? pretendDateToInstant(pretendDate, {
          timeZone: store?.timeZone,
          amShiftStart: store?.amShiftStart,
          pmShiftStart: store?.pmShiftStart,
        })
      : null;
    const now = instant ?? new Date();
    const day =
      BigInt(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) *
      1_000_000n;
    return { day, shift: currentShift(now, times) };
  }, [pretendDate, store?.amShiftStart, store?.pmShiftStart, store?.timeZone]);
}

/** A live character counter that turns red once the field is over the limit. */
function CharCounter({ value }: { value: string }) {
  const { t } = useI18n();
  const over = value.length > TRAINER_NOTE_MAX_LENGTH;
  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums",
        over ? "text-destructive" : "text-muted-foreground",
      )}
      aria-live="polite"
    >
      {t("trainerNotes.counter", {
        count: value.length,
        max: TRAINER_NOTE_MAX_LENGTH,
      })}
    </span>
  );
}

/**
 * The shared trainer note form. It creates a new note for a roadie, or edits an
 * existing one when `note` is passed. The day defaults to today in store time
 * (or the demo pretend date) and the shift to the current shift. Each field
 * shows its 1,000-character limit and blocks a save past it, and a blank note
 * is refused with a visible message.
 */
export function TrainerNoteForm({
  roadieId,
  note,
  onDone,
  onCancel,
}: {
  roadieId: RoadieId;
  /** The note being edited; omit to create a new note. */
  note?: TrainerNote;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const access = useAccessState();
  const defaults = useDefaultDayAndShift();
  const add = useAddTrainerNote();
  const update = useUpdateTrainerNote();
  const isEdit = !!note;
  const mutation = isEdit ? update : add;

  const [day, setDay] = useState<string>(() =>
    dateOnlyToInputValue(note?.day ?? defaults.day),
  );
  const [shift, setShift] = useState<Shift>(note?.shift ?? defaults.shift);
  const [didWell, setDidWell] = useState(note?.didWell ?? "");
  const [workOn, setWorkOn] = useState(note?.workOn ?? "");
  const [error, setError] = useState<string | null>(null);

  // A new note follows the default day/shift until the user edits them, so a
  // demo pretend date that arrives after mount still lands on the right day.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (isEdit || touched) return;
    setDay(dateOnlyToInputValue(defaults.day));
    setShift(defaults.shift);
  }, [defaults.day, defaults.shift, isEdit, touched]);

  const tooLong =
    didWell.length > TRAINER_NOTE_MAX_LENGTH ||
    workOn.length > TRAINER_NOTE_MAX_LENGTH;
  const blank = didWell.trim() === "" && workOn.trim() === "";
  const dayValue = inputValueToDateOnly(day);
  const canSave = !tooLong && !blank && dayValue !== null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (blank) {
      setError(t("trainerNotes.blank"));
      return;
    }
    if (tooLong) {
      setError(t("trainerNotes.tooLong", { max: TRAINER_NOTE_MAX_LENGTH }));
      return;
    }
    if (dayValue === null) return;

    const payload: TrainerNote = {
      id: note?.id ?? 0n,
      day: dayValue,
      didWell: didWell.trim(),
      roadieId,
      createdAt: note?.createdAt ?? 0n,
      isDemo: note?.isDemo ?? false,
      author:
        note?.author ??
        (access.kind === "granted"
          ? access.grant.principal
          : Principal.anonymous()),
      shift,
      workOn: workOn.trim(),
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        if (!isEdit) {
          setDidWell("");
          setWorkOn("");
          setTouched(false);
        }
        onDone?.();
      },
      onError: () => {
        setError(t("trainerNotes.saveError"));
      },
    });
  };

  return (
    <form
      data-ocid="trainerNotes.form"
      className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-subtle"
      onSubmit={handleSubmit}
    >
      <h3 className="font-display text-lg font-bold uppercase tracking-wide">
        {isEdit ? t("trainerNotes.editTitle") : t("trainerNotes.addTitle")}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trainer-note-day">{t("trainerNotes.day")}</Label>
          <Input
            id="trainer-note-day"
            type="date"
            className="touch-target"
            data-ocid="trainerNotes.day_input"
            value={day}
            onChange={(event) => {
              setTouched(true);
              setDay(event.target.value);
            }}
          />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium leading-none">
            {t("trainerNotes.shift")}
          </legend>
          <div className="flex gap-2">
            {[ShiftEnum.am, ShiftEnum.pm].map((value) => {
              const active = shift === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="touch-target flex-1"
                  aria-pressed={active}
                  data-ocid={`trainerNotes.shift_${value}`}
                  onClick={() => {
                    setTouched(true);
                    setShift(value);
                  }}
                >
                  {t(
                    value === ShiftEnum.am
                      ? "roadie.shift.am"
                      : "roadie.shift.pm",
                  )}
                </Button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="trainer-note-did-well">
            {t("trainerNotes.didWell")}
          </Label>
          <CharCounter value={didWell} />
        </div>
        <Textarea
          id="trainer-note-did-well"
          data-ocid="trainerNotes.didWell_input"
          value={didWell}
          placeholder={t("trainerNotes.didWellPlaceholder")}
          aria-invalid={didWell.length > TRAINER_NOTE_MAX_LENGTH}
          onChange={(event) => setDidWell(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="trainer-note-work-on">
            {t("trainerNotes.workOn")}
          </Label>
          <CharCounter value={workOn} />
        </div>
        <Textarea
          id="trainer-note-work-on"
          data-ocid="trainerNotes.workOn_input"
          value={workOn}
          placeholder={t("trainerNotes.workOnPlaceholder")}
          aria-invalid={workOn.length > TRAINER_NOTE_MAX_LENGTH}
          onChange={(event) => setWorkOn(event.target.value)}
        />
      </div>

      {error && (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-ocid="trainerNotes.error_state"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            data-ocid="trainerNotes.cancel_button"
            onClick={onCancel}
          >
            {t("trainerNotes.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          className="touch-target"
          disabled={!canSave || mutation.isPending}
          data-ocid="trainerNotes.submit_button"
        >
          {mutation.isPending
            ? t("trainerNotes.saving")
            : t("trainerNotes.save")}
        </Button>
      </div>
    </form>
  );
}
