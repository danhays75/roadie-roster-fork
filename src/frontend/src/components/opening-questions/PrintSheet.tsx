import type { QuestionView } from "@/backend";
import { SuggestionState } from "@/backend";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { formatTimestampMediumDate } from "@/lib/format";
import { AREA_COLORS, areaLabelKey } from "@/lib/openingQuestions";
import { Check, Printer, X } from "lucide-react";
import { useEffect } from "react";

/**
 * A print-ready answer sheet. It renders the same cover, legend and per-question
 * layout as the Word download, then calls the browser print dialog so the user
 * can print or save as PDF. The screen chrome is hidden when printing.
 */
export function PrintSheet({
  questions,
  storeNumber,
  location,
  onClose,
}: {
  questions: QuestionView[];
  storeNumber: string;
  location: string;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const previous = document.title;
    document.title = `${storeNumber} ${t("oq.card.printTitle")}`;
    const timer = window.setTimeout(() => window.print(), 350);
    const restore = () => {
      document.title = previous;
    };
    window.addEventListener("afterprint", restore);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      document.title = previous;
    };
  }, [storeNumber, t]);

  const legend = [
    { key: "kitchen", label: t("oq.card.legendKitchen") },
    { key: "service", label: t("oq.card.legendService") },
    { key: "both", label: t("oq.card.legendBoth") },
    { key: "dan", label: t("oq.card.legendDan") },
  ] as const;

  return (
    <div
      data-ocid="oq.print.sheet"
      className="fixed inset-0 z-50 overflow-auto bg-background print:static print:overflow-visible print:bg-white"
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {t("oq.card.printHint")}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            className="touch-target"
            data-ocid="oq.print.print_button"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t("oq.card.printNow")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="touch-target"
            data-ocid="oq.print.close_button"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("oq.card.printClose")}
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-8 text-foreground print:max-w-none print:px-0 print:text-black">
        <header className="mb-8 border-b-2 border-primary pb-6 text-center print:border-black">
          <p className="font-display text-3xl font-bold uppercase tracking-wide text-primary print:text-black">
            {t("oq.card.printCover")}
          </p>
          <p className="mt-1 font-display text-xl font-semibold uppercase tracking-wider text-foreground print:text-black">
            {t("oq.card.printStore", { number: storeNumber })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground print:text-black">
            {location}
          </p>
          <h1 className="mt-6 font-display text-2xl font-bold uppercase tracking-wide text-foreground print:text-black">
            {t("oq.card.printTitle")}
          </h1>
          <ul className="mt-4 flex flex-wrap justify-center gap-3">
            {legend.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: AREA_COLORS[item.key] }}
                  aria-hidden="true"
                />
                {item.label}
              </li>
            ))}
          </ul>
        </header>

        {questions.map((view) => {
          const q = view.question;
          return (
            <section
              key={q.id.toString()}
              className="mb-6 break-inside-avoid border-b border-border pb-5 print:border-gray-300"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-white print:border print:border-black print:bg-white print:text-black"
                  style={{ backgroundColor: AREA_COLORS[q.area] }}
                >
                  {t(areaLabelKey(q.area))}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-foreground print:text-black">
                    {q.number}. {q.question}
                  </h2>
                </div>
              </div>

              <div className="mt-2 rounded-md bg-muted px-3 py-2 print:border print:border-gray-300 print:bg-white">
                <p className="text-sm text-foreground print:text-black">
                  <span className="font-semibold">
                    {t("oq.card.printAnswer")}:{" "}
                  </span>
                  {q.answer.trim() ? q.answer : t("oq.card.printNoAnswer")}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-semibold text-foreground print:text-black">
                  {t("oq.card.printOwners")}:
                </span>
                {view.owners.length === 0 && <span>—</span>}
                {view.owners.map((owner) => {
                  const approved = view.ownerApprovals.some(
                    (a) => a.principal.toText() === owner.principal.toText(),
                  );
                  const approval = q.approvals.find(
                    (a) => a.principal.toText() === owner.principal.toText(),
                  );
                  return (
                    <span
                      key={owner.principal.toText()}
                      className="inline-flex items-center gap-1"
                    >
                      <span
                        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-border print:border-black"
                        aria-hidden="true"
                      >
                        {approved && <Check className="h-3 w-3" />}
                      </span>
                      {owner.displayName}
                      {approved && approval && (
                        <span className="text-muted-foreground print:text-black">
                          ({formatTimestampMediumDate(approval.at)})
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              <p className="mt-1 text-xs">
                <span className="font-semibold">
                  {t("oq.card.printFinalLine")}:{" "}
                </span>
                {view.isFinal
                  ? view.finalizedByName
                    ? `${t("oq.card.printFinal")} · ${view.finalizedByName}`
                    : t("oq.card.printFinal")
                  : t("oq.card.printNotFinal")}
              </p>

              {q.suggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold">
                    {t("oq.card.printSuggestions")}:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {q.suggestions.map((s) => (
                      <li key={s.id.toString()} className="text-xs">
                        • {s.proposedAnswer}{" "}
                        <span className="font-semibold">
                          [
                          {s.state === SuggestionState.accepted
                            ? t("oq.card.printAccepted")
                            : s.state === SuggestionState.declined
                              ? t("oq.card.printDeclined")
                              : t("oq.card.printOpen")}
                          ]
                        </span>
                        {s.note && (
                          <span className="text-muted-foreground print:text-black">
                            {" "}
                            — {s.note}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </article>
    </div>
  );
}
