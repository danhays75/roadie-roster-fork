import { House } from "@/backend";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useDashboardCopy } from "@/components/dashboard/copy";
import { useI18n } from "@/hooks/useI18n";
import {
  COVERAGE_DAY_LABELS,
  COVERAGE_SHIFTS,
  COVERAGE_SHIFT_LABELS,
  type CoverageGridCell,
  type CoverageGridRow,
  type CoverageSummary,
  type CoverageTotalsView,
  coverageCellKey,
  coverageRowsForHouse,
  coverageTotalsForHouse,
} from "@/lib/coverage";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

/**
 * Copy keys this tab needs that the shared dictionary does not yet define.
 * Kept local so the shared dictionary stays owned by the foundation; every key
 * has the same English and Spanish entry.
 */
const localCopy: Record<string, { en: string; es: string }> = {
  "roster.coverage.all": { en: "All", es: "Todos" },
  "roster.coverage.shift": { en: "Shift", es: "Turno" },
  "roster.coverage.setShifts": {
    en: "Set shifts to cover in Admin > Positions to see this grid.",
    es: "Configura los turnos a cubrir en Admin > Puestos para ver esta parrilla.",
  },
  "roster.coverage.shortPrefix": { en: "Short:", es: "Faltan:" },
  "roster.coverage.readOnly": {
    en: "Read-only view. Change pars and build-to numbers in Admin > Positions.",
    es: "Vista de solo lectura. Cambia los pars y las metas en Admin > Puestos.",
  },
};

/** The house filter at the top of the tab: one house, or both together. */
type HouseFilter = "foh" | "boh" | "all";

const HOUSE_FILTERS: Array<{ key: HouseFilter; labelKey: string }> = [
  { key: "foh", labelKey: "roster.coverage.foh" },
  { key: "boh", labelKey: "roster.coverage.boh" },
  { key: "all", labelKey: "roster.coverage.all" },
];

/** The four totals shown for the selected house, in a fixed order. */
const TOTAL_FIELDS: Array<{
  key: keyof CoverageTotalsView;
  labelKey: string;
}> = [
  { key: "shiftsNeeded", labelKey: "roster.coverage.shiftsNeeded" },
  { key: "shiftCapacity", labelKey: "roster.coverage.shiftCapacity" },
  { key: "shortShifts", labelKey: "roster.coverage.shortShifts" },
  { key: "stillToHire", labelKey: "roster.coverage.stillToHire" },
];

/** The per-position summary lines under each grid, in a fixed order. */
const ROW_FIELDS: Array<{ key: keyof CoverageGridRow; labelKey: string }> = [
  { key: "shiftsNeeded", labelKey: "roster.coverage.shiftsNeeded" },
  { key: "shiftCapacity", labelKey: "roster.coverage.shiftCapacity" },
  { key: "shortShifts", labelKey: "roster.coverage.shortShifts" },
  { key: "stillToHire", labelKey: "roster.coverage.stillToHire" },
];

/** The totals for the selected house, or both houses added together. */
function totalsForFilter(
  summary: CoverageSummary,
  filter: HouseFilter,
): CoverageTotalsView {
  if (filter === "all") {
    return {
      shiftsNeeded: summary.foh.shiftsNeeded + summary.boh.shiftsNeeded,
      shiftCapacity: summary.foh.shiftCapacity + summary.boh.shiftCapacity,
      shortShifts: summary.foh.shortShifts + summary.boh.shortShifts,
      stillToHire: summary.stillToHire,
    };
  }
  return coverageTotalsForHouse(
    summary,
    filter === "foh" ? House.foh : House.boh,
  );
}

/** The rows for the selected house, or every row for "all". */
function rowsForFilter(
  summary: CoverageSummary,
  filter: HouseFilter,
): CoverageGridRow[] {
  if (filter === "all") return summary.rows;
  return coverageRowsForHouse(
    summary,
    filter === "foh" ? House.foh : House.boh,
  );
}

/** One grid cell: Needed, Available and Covered, red when short. */
function CoverageCellView({
  cell,
  t,
}: {
  cell: CoverageGridCell;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <td
      data-ocid="roster.coverage.cell"
      className={cn(
        "border-l border-border px-1.5 py-2 text-center align-top tabular-nums",
        cell.short ? "bg-destructive/10" : "bg-card",
      )}
    >
      <span
        className={cn(
          "block text-[11px] leading-tight",
          cell.short ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {t("roster.coverage.needed")} {cell.needed}
      </span>
      <span
        className={cn(
          "block text-[11px] leading-tight",
          cell.short ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {t("roster.coverage.available")} {cell.available}
      </span>
      <span
        className={cn(
          "mt-0.5 block font-display text-sm font-bold leading-tight",
          cell.short ? "text-destructive" : "text-foreground",
        )}
      >
        {t("roster.coverage.covered")} {cell.covered}
      </span>
    </td>
  );
}

/** One position: its Wed–Tue grid, or the "set shifts" hint, plus its totals. */
function PositionCoverageCard({
  row,
  t,
}: {
  row: CoverageGridRow;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const houseLabel =
    row.house === House.foh
      ? t("roster.coverage.foh")
      : t("roster.coverage.boh");
  const shortCells = row.cells.filter((cell) => cell.short);

  return (
    <section
      data-ocid="roster.coverage.position_card"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
          {row.positionName}
        </h3>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
          {houseLabel}
        </span>
      </header>

      {row.hasGrid ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">
              {row.positionName} · {t("roster.coverage.title")}
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {t("roster.coverage.shift")}
                </th>
                {COVERAGE_SHIFTS.map((entry) => (
                  <th
                    key={coverageCellKey(entry.day, entry.shift)}
                    scope="col"
                    className="border-l border-border px-1.5 py-2 text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {COVERAGE_DAY_LABELS[entry.day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["am", "pm"] as const).map((shift) => (
                <tr
                  key={shift}
                  className="border-b border-border last:border-b-0"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-display text-xs font-bold uppercase tracking-wider text-foreground"
                  >
                    {COVERAGE_SHIFT_LABELS[shift]}
                  </th>
                  {row.cells
                    .filter((cell) => cell.shift === shift)
                    .map((cell) => (
                      <CoverageCellView key={cell.key} cell={cell} t={t} />
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p
          data-ocid="roster.coverage.no_grid"
          className="px-4 py-4 text-sm text-muted-foreground"
        >
          {t("roster.coverage.setShifts")}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        {ROW_FIELDS.map((field) => (
          <div key={field.key} className="bg-card px-3 py-2.5">
            <dt className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(field.labelKey)}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-bold tabular-nums text-foreground">
              {row[field.key] as number}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border px-4 py-3">
        <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("roster.coverage.shortShiftList")}
        </p>
        {shortCells.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("roster.coverage.noShortShifts")}
          </p>
        ) : (
          <p className="mt-1 text-sm font-semibold text-destructive">
            {t("roster.coverage.shortPrefix")}{" "}
            {shortCells
              .map(
                (cell) =>
                  `${cell.dayLabel} ${cell.shiftLabel} (${cell.needed - cell.covered})`,
              )
              .join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The manager-only Coverage tab: the FOH / BOH / All totals at the top, then a
 * Wed–Tue AM/PM grid per position with Needed, Available and Covered in every
 * cell, the per-position totals and the named short shifts. Read-only: it never
 * writes pars or build-to numbers.
 */
export function CoverageTab({
  summary,
  isLoading,
  isError,
  onRetry,
}: {
  summary: CoverageSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t: sharedT } = useDashboardCopy();
  const { locale } = useI18n();
  const [filter, setFilter] = useState<HouseFilter>("all");

  // Prefer the shared dictionary, then this tab's local copy, then the key.
  const t = (key: string, vars?: Record<string, string | number>) => {
    const entry = localCopy[key];
    if (entry) {
      let value = locale === "es" ? entry.es : entry.en;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return value;
    }
    return sharedT(key, vars);
  };

  const totals = useMemo(
    () => totalsForFilter(summary, filter),
    [summary, filter],
  );
  const rows = useMemo(() => rowsForFilter(summary, filter), [summary, filter]);

  if (isLoading) {
    return (
      <LoadingState
        label={t("roster.coverage.loading")}
        ocid="roster.coverage.loading_state"
      />
    );
  }
  if (isError) {
    return (
      <ErrorState
        message={t("roster.coverage.error")}
        onRetry={onRetry}
        ocid="roster.coverage.error_state"
      />
    );
  }
  if (summary.rows.length === 0) {
    return (
      <EmptyState
        title={t("roster.coverage.empty")}
        ocid="roster.coverage.empty_state"
      />
    );
  }

  return (
    <div className="space-y-6" data-ocid="roster.coverage.section">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-subtle sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          {HOUSE_FILTERS.map((entry) => {
            const active = filter === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                data-ocid={`roster.coverage.filter.${entry.key}`}
                onClick={() => setFilter(entry.key)}
                className={cn(
                  "touch-target rounded-md px-3 py-2 font-display text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "bg-secondary text-secondary-foreground shadow-subtle"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(entry.labelKey)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("roster.coverage.subtitle")}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TOTAL_FIELDS.map((field) => (
          <div
            key={field.key}
            data-ocid={`roster.coverage.total.${field.key}`}
            className="rounded-lg border border-border bg-card p-4 shadow-subtle"
          >
            <dt className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t(field.labelKey)}
            </dt>
            <dd
              className={cn(
                "mt-1 font-display text-3xl font-bold tabular-nums",
                field.key === "shortShifts" && totals.shortShifts > 0
                  ? "text-destructive"
                  : "text-foreground",
              )}
            >
              {totals[field.key]}
            </dd>
          </div>
        ))}
      </dl>

      {rows.length === 0 ? (
        <EmptyState
          title={t("roster.coverage.empty")}
          ocid="roster.coverage.empty_state"
        />
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <PositionCoverageCard key={row.positionId} row={row} t={t} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t("roster.coverage.readOnly")}
      </p>
    </div>
  );
}
