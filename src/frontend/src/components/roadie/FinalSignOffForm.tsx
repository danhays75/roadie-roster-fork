import type { FinalSignOff, FinalSignOffView, RoadieId } from "@/backend";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccessState } from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import { useRecordFinalSignOff } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useState } from "react";

/** The maximum length of a Needs more time reason, matching the backend limit. */
export const SIGN_OFF_REASON_MAX_LENGTH = 1000;

type Outcome = "certified" | "needsMoreTime";

/** A live character counter that turns red once the field is over the limit. */
function CharCounter({ value }: { value: string }) {
  const { t } = useI18n();
  const over = value.length > SIGN_OFF_REASON_MAX_LENGTH;
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
        max: SIGN_OFF_REASON_MAX_LENGTH,
      })}
    </span>
  );
}

/**
 * The shared final trainer sign-off form, used by the roadie card's Trainer
 * notes tab and the Today My group tiles. It offers Certified or Needs more
 * time, shows a reason box only for Needs more time (1,000-character limit,
 * required), and a Future trainer checkbox. When `signOff` is passed the form
 * starts from that sign-off so a trainer can update it.
 */
export function FinalSignOffForm({
  roadieId,
  signOff,
  onDone,
  onCancel,
}: {
  roadieId: RoadieId;
  /** The current sign-off, when updating one; omit to record a new one. */
  signOff?: FinalSignOffView | null;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const access = useAccessState();
  const record = useRecordFinalSignOff();

  const [outcome, setOutcome] = useState<Outcome>(
    signOff?.outcome.__kind__ ?? "certified",
  );
  const [reason, setReason] = useState(
    signOff?.outcome.__kind__ === "needsMoreTime"
      ? signOff.outcome.needsMoreTime
      : "",
  );
  const [futureTrainer, setFutureTrainer] = useState(
    signOff?.futureTrainer ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const tooLong = reason.length > SIGN_OFF_REASON_MAX_LENGTH;
  const reasonMissing = outcome === "needsMoreTime" && trimmedReason === "";
  const canSave = !tooLong && !reasonMissing;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (reasonMissing) {
      setError(t("signOff.reasonRequired"));
      return;
    }
    if (tooLong) {
      setError(t("signOff.tooLong", { max: SIGN_OFF_REASON_MAX_LENGTH }));
      return;
    }

    const payload: FinalSignOff = {
      roadieId,
      isDemo: signOff?.isDemo ?? false,
      signedAt: 0n,
      signedBy:
        access.kind === "granted"
          ? access.grant.principal
          : Principal.anonymous(),
      outcome:
        outcome === "certified"
          ? { __kind__: "certified", certified: null }
          : { __kind__: "needsMoreTime", needsMoreTime: trimmedReason },
      futureTrainer,
    };

    record.mutate(payload, {
      onSuccess: () => onDone?.(),
      onError: () => setError(t("signOff.saveError")),
    });
  };

  return (
    <form
      data-ocid="signOff.form"
      className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-subtle"
      onSubmit={handleSubmit}
    >
      <h3 className="font-display text-lg font-bold uppercase tracking-wide">
        {signOff ? t("signOff.formTitleUpdate") : t("signOff.formTitle")}
      </h3>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none">
          {t("signOff.outcomeLabel")}
        </legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(["certified", "needsMoreTime"] as const).map((value) => {
            const active = outcome === value;
            return (
              <Button
                key={value}
                type="button"
                variant={active ? "default" : "outline"}
                className="touch-target flex-1"
                aria-pressed={active}
                data-ocid={`signOff.outcome_${value}`}
                onClick={() => setOutcome(value)}
              >
                {t(
                  value === "certified"
                    ? "signOff.outcome.certified"
                    : "signOff.outcome.needsMoreTime",
                )}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {outcome === "needsMoreTime" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sign-off-reason">{t("signOff.reasonLabel")}</Label>
            <CharCounter value={reason} />
          </div>
          <Textarea
            id="sign-off-reason"
            data-ocid="signOff.reason_input"
            value={reason}
            placeholder={t("signOff.reasonPlaceholder")}
            aria-invalid={tooLong || reasonMissing}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        <Checkbox
          id="sign-off-future-trainer"
          data-ocid="signOff.futureTrainer_checkbox"
          className="mt-0.5 size-5"
          checked={futureTrainer}
          onCheckedChange={(checked) => setFutureTrainer(checked === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="sign-off-future-trainer">
            {t("signOff.futureTrainer")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("signOff.futureTrainerHint")}
          </p>
        </div>
      </div>

      {error && (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-ocid="signOff.error_state"
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
            data-ocid="signOff.cancel_button"
            onClick={onCancel}
          >
            {t("signOff.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          className="touch-target"
          disabled={!canSave || record.isPending}
          data-ocid="signOff.submit_button"
        >
          {record.isPending ? t("signOff.saving") : t("signOff.save")}
        </Button>
      </div>
    </form>
  );
}
