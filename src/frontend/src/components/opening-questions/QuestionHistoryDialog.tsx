import type { QuestionChangeKind, QuestionId } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";
import { useOpeningQuestionHistory } from "@/hooks/useQueries";
import { formatTimestamp, shortPrincipal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";

/** The copy key for a change kind's plain-language label. */
function kindLabelKey(kind: QuestionChangeKind): string {
  switch (kind) {
    case "answerEdited":
      return "oq.history.kind.answerEdited";
    case "approved":
      return "oq.history.kind.approved";
    case "approvalWithdrawn":
      return "oq.history.kind.approvalWithdrawn";
    case "markedFinal":
      return "oq.history.kind.markedFinal";
    case "reopened":
      return "oq.history.kind.reopened";
    case "suggestionAccepted":
      return "oq.history.kind.suggestionAccepted";
    case "suggestionDeclined":
      return "oq.history.kind.suggestionDeclined";
    default:
      return "oq.history.kind.answerEdited";
  }
}

/** A short accent per change kind so the timeline scans quickly. */
function kindAccent(kind: QuestionChangeKind): string {
  switch (kind) {
    case "approved":
    case "suggestionAccepted":
      return "bg-success";
    case "approvalWithdrawn":
    case "suggestionDeclined":
      return "bg-destructive";
    case "markedFinal":
      return "bg-primary";
    case "reopened":
      return "bg-muted-foreground";
    default:
      return "bg-foreground/40";
  }
}

/**
 * The change history for one Opening Question, newest first. Only the Managing
 * Partner and Admins reach this popup; the backend refuses everyone else.
 */
export function QuestionHistoryDialog({
  questionId,
  questionNumber,
  open,
  onOpenChange,
  nameFor,
}: {
  questionId: QuestionId;
  questionNumber: bigint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameFor: (principal: { toText(): string }) => string;
}) {
  const { t } = useI18n();
  const history = useOpeningQuestionHistory(questionId, open);
  const entries = history.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-ocid="oq.history.dialog"
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("oq.history.title", { number: questionNumber.toString() })}
          </DialogTitle>
          <DialogDescription>{t("oq.history.description")}</DialogDescription>
        </DialogHeader>

        {history.isLoading ? (
          <div data-ocid="oq.history.loading_state" className="space-y-2">
            {Array.from(
              { length: 3 },
              (_, i) => `oq-history-skeleton-${i}`,
            ).map((id) => (
              <Skeleton key={id} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : history.isError ? (
          <div
            data-ocid="oq.history.error_state"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center"
          >
            <p className="text-sm text-foreground">{t("oq.history.error")}</p>
            <Button
              type="button"
              variant="outline"
              className="touch-target mt-3"
              data-ocid="oq.history.retry_button"
              onClick={() => void history.refetch()}
            >
              {t("oq.history.retry")}
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p
            data-ocid="oq.history.empty_state"
            className="rounded-md border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground"
          >
            {t("oq.history.empty")}
          </p>
        ) : (
          <ol data-ocid="oq.history.list" className="space-y-3">
            {entries.map((entry) => {
              const name = nameFor(entry.by) || shortPrincipal(entry.by);
              return (
                <li
                  key={entry.id.toString()}
                  data-ocid="oq.history.item"
                  className="flex gap-3"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                      kindAccent(entry.kind),
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-display text-sm font-semibold text-foreground">
                        {t(kindLabelKey(entry.kind))}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatTimestamp(entry.at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("oq.history.by", { name })}
                    </p>
                    {entry.kind === "answerEdited" && (
                      <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                        <p className="text-foreground">
                          <span className="font-semibold">
                            {t("oq.history.oldAnswer")}:{" "}
                          </span>
                          <span className="whitespace-pre-wrap break-words">
                            {entry.oldAnswer?.trim()
                              ? entry.oldAnswer
                              : t("oq.history.noText")}
                          </span>
                        </p>
                        <p className="text-foreground">
                          <span className="font-semibold">
                            {t("oq.history.newAnswer")}:{" "}
                          </span>
                          <span className="whitespace-pre-wrap break-words">
                            {entry.newAnswer?.trim()
                              ? entry.newAnswer
                              : t("oq.history.noText")}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            data-ocid="oq.history.close_button"
            onClick={() => onOpenChange(false)}
          >
            {t("oq.history.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
