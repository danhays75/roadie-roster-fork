import type {
  FinalSignOffView,
  RoadieId,
  TrainerNote,
  TrainerNoteView,
} from "@/backend";
import { Shift as ShiftEnum } from "@/backend";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { FinalSignOffForm } from "@/components/roadie/FinalSignOffForm";
import { TrainerNoteForm } from "@/components/roadie/TrainerNoteForm";
import { Button } from "@/components/ui/button";
import {
  canAddTrainerNote,
  canClearFinalSignOff,
  canReadTrainerNotes,
  canRecordFinalSignOff,
  useAccessState,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useClearFinalSignOff,
  useFinalSignOff,
  useTrainerNotes,
} from "@/hooks/useQueries";
import { formatDateOnly, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BadgeCheck, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

/** The window, in milliseconds, during which an author may still edit a note. */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a note is still inside its 24-hour edit window. */
function isWithinEditWindow(createdAt: bigint, now: number): boolean {
  const createdMs = Number(createdAt / 1_000_000n);
  if (!Number.isFinite(createdMs)) return false;
  return now - createdMs < EDIT_WINDOW_MS;
}

/** One labelled block of note text, hidden when empty. */
function NoteField({ label, value }: { label: string; value: string }) {
  if (value.trim() === "") return null;
  return (
    <div className="min-w-0">
      <dt className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** A single trainer note card with its day, shift, author and two fields. */
function TrainerNoteCard({
  note,
  index,
  canEdit,
  onEdit,
}: {
  note: TrainerNoteView;
  index: number;
  canEdit: boolean;
  onEdit: (note: TrainerNoteView) => void;
}) {
  const { t } = useI18n();
  return (
    <li
      data-ocid={`trainerNotes.item.${index}`}
      className="rounded-lg border border-border bg-card p-4 shadow-subtle"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            {formatDateOnly(note.day)}
          </span>
          <span
            className={cn(
              "rounded-full border border-border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
              note.shift === ShiftEnum.am
                ? "bg-secondary text-secondary-foreground"
                : "bg-accent text-accent-foreground",
            )}
          >
            {t(
              note.shift === ShiftEnum.am
                ? "roadie.shift.am"
                : "roadie.shift.pm",
            )}
          </span>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="touch-target"
            data-ocid={`trainerNotes.edit_button.${index}`}
            onClick={() => onEdit(note)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t("trainerNotes.edit")}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("trainerNotes.author", { name: note.authorName })}
      </p>
      <dl className="mt-3 space-y-3">
        <NoteField label={t("trainerNotes.didWell")} value={note.didWell} />
        <NoteField label={t("trainerNotes.workOn")} value={note.workOn} />
      </dl>
    </li>
  );
}

/** The current sign-off summary: outcome, reason, future trainer, signer. */
function SignOffSummary({ signOff }: { signOff: FinalSignOffView }) {
  const { t } = useI18n();
  const certified = signOff.outcome.__kind__ === "certified";
  return (
    <div
      data-ocid="signOff.current"
      className="rounded-lg border border-border bg-card p-4 shadow-subtle"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-ocid="signOff.outcome_chip"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider",
            certified
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {certified ? (
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {certified
            ? t("signOff.outcome.certified")
            : t("signOff.outcome.needsMoreTime")}
        </span>
        {signOff.futureTrainer && (
          <StatusBadge tone="hired" ocid="signOff.future_trainer_chip">
            {t("signOff.chip.futureTrainer")}
          </StatusBadge>
        )}
      </div>

      {signOff.outcome.__kind__ === "needsMoreTime" && (
        <div className="mt-3 min-w-0">
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("signOff.reason")}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
            {signOff.outcome.needsMoreTime}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t("signOff.signedBy", { name: signOff.signedByName })}
        {" · "}
        {t("signOff.signedOn", {
          date: formatTimestamp(signOff.signedAt),
        })}
      </p>
    </div>
  );
}

/**
 * The final trainer sign-off section for a roadie: the current sign-off (or a
 * short empty state), a Sign off / Update sign-off action that opens the shared
 * form, and Clear sign-off with a confirm step for Admin, Managing Partner and
 * Store Manager.
 */
function FinalSignOffSection({ roadieId }: { roadieId: RoadieId }) {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const maySignOff = canRecordFinalSignOff(role);
  const mayClear = canClearFinalSignOff(role);

  const { data, isLoading, isError, refetch } = useFinalSignOff(roadieId, true);
  const clear = useClearFinalSignOff();

  const [editing, setEditing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const signOff = data ?? null;

  return (
    <section
      data-ocid="signOff.section"
      className="space-y-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold uppercase tracking-wide">
            {t("signOff.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("signOff.subtitle")}
          </p>
        </div>
        {maySignOff && !editing && (
          <Button
            type="button"
            variant={signOff ? "outline" : "default"}
            className="touch-target"
            data-ocid="signOff.open_button"
            onClick={() => setEditing(true)}
          >
            {signOff ? t("signOff.formTitleUpdate") : t("signOff.formTitle")}
          </Button>
        )}
      </div>

      {isLoading && (
        <LoadingState
          label={t("signOff.loading")}
          ocid="signOff.loading_state"
        />
      )}

      {isError && (
        <ErrorState
          title={t("signOff.error")}
          onRetry={() => void refetch()}
          ocid="signOff.error_state"
        />
      )}

      {!isLoading && !isError && !signOff && (
        <EmptyState
          title={t("signOff.none")}
          message={t("signOff.noneHint")}
          ocid="signOff.empty_state"
        />
      )}

      {!isLoading && !isError && signOff && (
        <SignOffSummary signOff={signOff} />
      )}

      {editing && (
        <FinalSignOffForm
          roadieId={roadieId}
          signOff={signOff}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      {mayClear && signOff && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmingClear ? (
            <div
              data-ocid="signOff.clear_confirm"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {t("signOff.clearConfirm")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="touch-target"
                data-ocid="signOff.clear_cancel_button"
                onClick={() => {
                  setConfirmingClear(false);
                  setClearError(null);
                }}
              >
                {t("signOff.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="touch-target"
                disabled={clear.isPending}
                data-ocid="signOff.clear_confirm_button"
                onClick={() => {
                  setClearError(null);
                  clear.mutate(roadieId, {
                    onSuccess: () => setConfirmingClear(false),
                    onError: () => setClearError(t("signOff.clearError")),
                  });
                }}
              >
                {clear.isPending
                  ? t("signOff.clearing")
                  : t("signOff.clearConfirmAction")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="touch-target text-destructive hover:text-destructive"
              data-ocid="signOff.clear_button"
              onClick={() => setConfirmingClear(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("signOff.clear")}
            </Button>
          )}
          {clearError && (
            <p
              className="text-sm text-destructive"
              role="alert"
              data-ocid="signOff.clear_error_state"
            >
              {clearError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The shared trainer notes list for a roadie: notes newest first with their
 * day, shift, author and both fields, an empty state, and an Edit button on the
 * caller's own note while it is under 24 hours old. A role that may add notes
 * gets an "Add a note" action that opens the shared form. Below the list sits
 * the final trainer sign-off section.
 */
export function TrainerNotesTab({ roadieId }: { roadieId: RoadieId }) {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const principal =
    access.kind === "granted" ? access.grant.principal.toText() : null;
  const canRead = canReadTrainerNotes(role);
  const canAdd = canAddTrainerNote(role);

  const { data, isLoading, isError, refetch } = useTrainerNotes(
    roadieId,
    canRead,
  );

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrainerNote | null>(null);

  if (!canRead) {
    return (
      <EmptyState
        title={t("trainerNotes.title")}
        message={t("trainerNotes.readOnly")}
        ocid="trainerNotes.empty_state"
      />
    );
  }

  if (isLoading) {
    return (
      <LoadingState
        label={t("trainerNotes.loading")}
        ocid="trainerNotes.loading_state"
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t("trainerNotes.error")}
        onRetry={() => void refetch()}
        ocid="trainerNotes.error_state"
      />
    );
  }

  const notes = data ?? [];
  const now = Date.now();

  return (
    <div className="space-y-6">
      <section data-ocid="trainerNotes.section" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">
              {t("trainerNotes.title")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("trainerNotes.subtitle")}
            </p>
          </div>
          {canAdd && !adding && !editing && (
            <Button
              type="button"
              className="touch-target"
              data-ocid="trainerNotes.add_button"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("trainerNotes.add")}
            </Button>
          )}
        </div>

        {adding && (
          <TrainerNoteForm
            roadieId={roadieId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}

        {editing && (
          <TrainerNoteForm
            roadieId={roadieId}
            note={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}

        {notes.length === 0 ? (
          <EmptyState
            title={t("trainerNotes.empty")}
            message={t("trainerNotes.emptyHint")}
            ocid="trainerNotes.empty_state"
          />
        ) : (
          <ul data-ocid="trainerNotes.list" className="space-y-3">
            {notes.map((note, index) => (
              <TrainerNoteCard
                key={note.id.toString()}
                note={note}
                index={index + 1}
                canEdit={
                  principal !== null &&
                  note.author.toText() === principal &&
                  isWithinEditWindow(note.createdAt, now)
                }
                onEdit={setEditing}
              />
            ))}
          </ul>
        )}
      </section>

      <FinalSignOffSection roadieId={roadieId} />
    </div>
  );
}
