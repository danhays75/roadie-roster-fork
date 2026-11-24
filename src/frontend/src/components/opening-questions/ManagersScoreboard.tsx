import type { ManagerScoreRow } from "@/backend";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { BellRing, Check, ChevronRight, Users, X } from "lucide-react";

/**
 * The Managers scoreboard: one row per current question owner with their name,
 * role, owned count, approved count and how many questions still need their
 * approval, sorted by most still needing approval first. Tapping a row filters
 * the question list to that person's pending questions; tapping the active row
 * again (or the clear control) removes the filter.
 *
 * When `canNudge` is set (Managing Partner and Admins only), each row that
 * still has questions needing approval carries a Nudge button. A manager who
 * was already nudged on the current store-local day shows "Nudged today" and
 * cannot be nudged again; the backend enforces the same rule and reports the
 * state on the row itself as `nudgedToday`.
 *
 * `nudgeTargets` is the set of principals the backend would accept a nudge for
 * right now (owners with at least one non-Final question they own by area and
 * have not approved). A row outside that set shows no Nudge button, so the
 * button never appears for a target the backend would refuse.
 */
export function ManagersScoreboard({
  rows,
  isLoading,
  activePrincipal,
  onSelect,
  onClear,
  canNudge = false,
  nudgeTargets,
  onNudge,
  nudgingPrincipal,
  nudgeErrorPrincipal,
}: {
  rows: ManagerScoreRow[];
  isLoading: boolean;
  activePrincipal: string | null;
  onSelect: (row: ManagerScoreRow) => void;
  onClear: () => void;
  canNudge?: boolean;
  nudgeTargets?: Set<string>;
  onNudge?: (row: ManagerScoreRow) => void;
  nudgingPrincipal?: string | null;
  nudgeErrorPrincipal?: string | null;
}) {
  const { t } = useI18n();

  const activeRow = activePrincipal
    ? rows.find((row) => row.principal.toText() === activePrincipal)
    : undefined;

  return (
    <section
      data-ocid="oq.scoreboard.card"
      className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
            {t("oq.scoreboard.title")}
          </h2>
        </div>
        {activeRow && (
          <button
            type="button"
            data-ocid="oq.scoreboard.clear_button"
            onClick={onClear}
            className="touch-target inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/15"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t("oq.scoreboard.clearFilter", { name: activeRow.displayName })}
          </button>
        )}
      </div>

      {isLoading ? (
        <div data-ocid="oq.scoreboard.loading_state" className="mt-3 space-y-2">
          {Array.from({ length: 3 }, (_, i) => `oq-score-skeleton-${i}`).map(
            (id) => (
              <Skeleton key={id} className="h-14 w-full rounded-md" />
            ),
          )}
        </div>
      ) : rows.length === 0 ? (
        <div
          data-ocid="oq.scoreboard.empty_state"
          className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center"
        >
          <p className="text-sm text-muted-foreground">
            {t("oq.scoreboard.empty")}
          </p>
        </div>
      ) : (
        <ul data-ocid="oq.scoreboard.list" className="mt-3 space-y-1.5">
          {rows.map((row, index) => {
            const key = row.principal.toText();
            const active = key === activePrincipal;
            const needsNudge =
              canNudge &&
              row.pendingCount > 0n &&
              (nudgeTargets === undefined || nudgeTargets.has(key));
            const wasNudged = needsNudge && row.nudgedToday;
            const isNudging = nudgingPrincipal === key;
            const nudgeFailed = nudgeErrorPrincipal === key;
            return (
              <li key={key} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  data-ocid={`oq.scoreboard.row.${index + 1}`}
                  aria-pressed={active}
                  onClick={() => (active ? onClear() : onSelect(row))}
                  className={cn(
                    "touch-target flex min-w-0 flex-1 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-foreground">
                      {row.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`profile.role.${row.role}`)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-center">
                    <ScoreStat
                      label={t("oq.scoreboard.owned")}
                      value={row.ownedCount}
                      tone="muted"
                    />
                    <ScoreStat
                      label={t("oq.scoreboard.approved")}
                      value={row.approvedCount}
                      tone="success"
                    />
                    <ScoreStat
                      label={t("oq.scoreboard.pending")}
                      value={row.pendingCount}
                      tone={row.pendingCount > 0n ? "alert" : "muted"}
                    />
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
                      active
                        ? "rotate-90 text-primary"
                        : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {needsNudge && (
                  <div className="flex shrink-0 flex-col items-stretch justify-center">
                    <button
                      type="button"
                      data-ocid={`oq.scoreboard.nudge_button.${index + 1}`}
                      disabled={wasNudged || isNudging}
                      aria-label={
                        wasNudged
                          ? t("oq.nudge.sent")
                          : t("oq.nudge.buttonFor", { name: row.displayName })
                      }
                      onClick={() => onNudge?.(row)}
                      className={cn(
                        "touch-target inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider transition-colors",
                        wasNudged
                          ? "cursor-default border-success/40 bg-success/10 text-success"
                          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-60",
                      )}
                    >
                      {wasNudged ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <BellRing
                          className={cn(
                            "h-3.5 w-3.5",
                            isNudging &&
                              "animate-pulse motion-reduce:animate-none",
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <span className="whitespace-nowrap">
                        {wasNudged ? t("oq.nudge.sent") : t("oq.nudge.button")}
                      </span>
                    </button>
                    {nudgeFailed && (
                      <p
                        data-ocid={`oq.scoreboard.nudge_error.${index + 1}`}
                        className="mt-1 max-w-32 text-center text-[10px] leading-tight text-destructive"
                      >
                        {t("oq.nudge.error")}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ScoreStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: bigint;
  tone: "muted" | "success" | "alert";
}) {
  return (
    <div className="min-w-11">
      <p
        className={cn(
          "font-display text-base font-bold tabular-nums",
          tone === "success" && "text-success",
          tone === "alert" && "text-destructive",
          tone === "muted" && "text-foreground",
        )}
      >
        {value.toString()}
      </p>
      <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** A small inline chip naming the active person filter, shown above the list. */
export function ActiveOwnerFilter({
  name,
  onClear,
}: {
  name: string;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-ocid="oq.owner_filter.banner"
      className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2"
    >
      <Check className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="text-sm text-foreground">
        {t("oq.owner_filter.showing", { name })}
      </span>
      <button
        type="button"
        data-ocid="oq.owner_filter.clear_button"
        onClick={onClear}
        className="touch-target ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        {t("oq.owner_filter.clear")}
      </button>
    </div>
  );
}
