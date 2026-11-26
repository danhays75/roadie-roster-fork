import type { Roadie } from "@/backend";
import { House, RoadieStage, RoadieStatus } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { useDashboardCopy } from "@/components/dashboard/copy";
import {
  type CardEntry,
  FullProfileLink,
  RoadieCardModal,
} from "@/components/roadie/RoadieCardModal";
import {
  RoadieTile,
  useLeaderTalkLineMap,
  usePaperworkIncompleteMap,
} from "@/components/roadie/RoadieTile";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canArchive,
  canCoverage,
  canLeaderTalks,
  canOpenFullProfile,
  useAccessState,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useCoverage,
  useCrews,
  useMyCrew,
  usePositions,
  useRoadies,
} from "@/hooks/useQueries";
import {
  COVERAGE_DAY_LABELS,
  COVERAGE_SHIFTS,
  COVERAGE_SHIFT_LABELS,
  type CoverageSummary,
  coverageCellKey,
  formatCoverage,
} from "@/lib/coverage";
import { cn } from "@/lib/utils";
import { useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { useMemo, useState } from "react";

/** Which list the card pop-up is navigating within. */
type CardList = RosterTab | "former";

/** The Roster view selection: a stage tab, or the manager-only Coverage tab. */
type RosterView = RosterTab | "coverage";

/** The stage tab selection on the roster. */
type RosterTab =
  | "all"
  | "hired"
  | "paperworkDone"
  | "oriented"
  | "inTraining"
  | "certified";

/** The crew filter selection. `"all"` shows every crew, `"none"` shows roadies
 * with no crew, and any other value is a crew id as a string.
 */
type CrewFilter = "all" | "none" | string;

/** The stage tabs, used to validate a `tab` search param from a deep link. */
const ROSTER_TABS: RosterTab[] = [
  "all",
  "hired",
  "paperworkDone",
  "oriented",
  "inTraining",
  "certified",
];

/** Every roster view a `tab` search param may name, including Coverage. */
const ROSTER_VIEWS: RosterView[] = [...ROSTER_TABS, "coverage"];

/** Narrow an arbitrary search value to a known roster view, defaulting to all. */
function tabFromSearch(value: unknown): RosterView {
  return typeof value === "string" && (ROSTER_VIEWS as string[]).includes(value)
    ? (value as RosterView)
    : "all";
}

/** The backend stage a stage tab filters to. `"all"` has no single stage. */
function stageForTab(tab: RosterTab): RoadieStage | undefined {
  switch (tab) {
    case "hired":
      return RoadieStage.hired;
    case "paperworkDone":
      return RoadieStage.paperworkDone;
    case "oriented":
      return RoadieStage.oriented;
    case "inTraining":
      return RoadieStage.inTraining;
    case "certified":
      return RoadieStage.certified;
    default:
      return undefined;
  }
}

/**
 * The manager-only Coverage tab: the per-position grid, the FOH and BOH totals,
 * the named short-shift list and the still-to-hire number, all read from the
 * shared coverage helper so the Dashboard card shows the same numbers.
 */
function CoveragePanel({
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
  const { t } = useI18n();

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

  const totals: Array<{ key: string; label: string; value: number }> = [
    {
      key: "foh",
      label: t("roster.coverage.foh"),
      value: summary.foh.stillToHire,
    },
    {
      key: "boh",
      label: t("roster.coverage.boh"),
      value: summary.boh.stillToHire,
    },
    {
      key: "all",
      label: t("roster.coverage.stillToHireTotal"),
      value: summary.stillToHire,
    },
  ];

  return (
    <div className="space-y-6" data-ocid="roster.coverage.section">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {totals.map((entry) => (
          <div
            key={entry.key}
            className="rounded-lg border border-border bg-card p-4 shadow-subtle"
            data-ocid={`roster.coverage.total.${entry.key}`}
          >
            <dt className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {entry.label}
            </dt>
            <dd className="mt-1 font-display text-3xl font-bold tabular-nums">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-subtle">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">{t("roster.coverage.title")}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-display text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                {t("roster.coverage.position")}
              </th>
              {COVERAGE_SHIFTS.map((entry) => (
                <th
                  key={coverageCellKey(entry.day, entry.shift)}
                  scope="col"
                  className="px-2 py-2 text-center font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {COVERAGE_DAY_LABELS[entry.day]}
                  <span className="block text-[10px] font-semibold text-muted-foreground/80">
                    {COVERAGE_SHIFT_LABELS[entry.shift]}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="px-3 py-2 text-right font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {t("roster.coverage.stillToHire")}
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr
                key={row.positionId}
                className="border-b border-border last:border-b-0"
                data-ocid="roster.coverage.row"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold"
                >
                  {row.positionName}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {row.house === House.foh
                      ? t("roster.coverage.foh")
                      : t("roster.coverage.boh")}
                  </span>
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.key}
                    className={cn(
                      "px-2 py-2 text-center tabular-nums",
                      cell.short
                        ? "bg-destructive/10 font-semibold text-destructive"
                        : "text-foreground",
                    )}
                    title={`${cell.dayLabel} ${cell.shiftLabel}: ${t(
                      "roster.coverage.needed",
                    )} ${cell.needed} · ${t(
                      "roster.coverage.available",
                    )} ${cell.available} · ${t(
                      "roster.coverage.covered",
                    )} ${cell.covered}`}
                  >
                    {cell.covered}/{cell.needed}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-display font-bold tabular-nums">
                  {row.stillToHire}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3" data-ocid="roster.coverage.short_shifts">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {t("roster.coverage.shortShiftList")}
        </h2>
        {summary.shortShifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("roster.coverage.noShortShifts")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {summary.shortShifts.map((short) => (
              <li
                key={short.key}
                className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive"
                data-ocid="roster.coverage.short_shift.item"
              >
                {short.label}
                <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold tabular-nums text-destructive-foreground">
                  {t("roster.coverage.shortBy")} {short.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function RosterPage() {
  const { t } = useDashboardCopy();
  const { locale } = useI18n();
  const search = useSearch({ from: "/roster" });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<RosterView>(() => tabFromSearch(search.tab));
  const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");
  const [showFormer, setShowFormer] = useState(false);
  const [card, setCard] = useState<{ list: CardList; index: number } | null>(
    null,
  );
  const { data: roadies, isLoading, isError, refetch } = useRoadies();
  const { data: positions } = usePositions();
  const { data: crews } = useCrews();
  const { data: myCrew } = useMyCrew();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const mayOpenFullProfile = canOpenFullProfile(role);
  const maySeeCoverage = canCoverage(role);
  const coverage = useCoverage(maySeeCoverage);
  const coverageSummary = useMemo(
    () => formatCoverage(coverage.data),
    [coverage.data],
  );

  const positionMap = useMemo(() => {
    const map = new Map<string, { name: string; code: string }>();
    for (const position of positions ?? []) {
      map.set(position.id.toString(), {
        name: position.name,
        code: position.code,
      });
    }
    return map;
  }, [positions]);

  const crewMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of crews ?? []) {
      map.set(crew.id.toString(), crew.name);
    }
    return map;
  }, [crews]);

  // The crews offered in the filter, sorted by name for a stable menu.
  const crewOptions = useMemo(
    () => [...(crews ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [crews],
  );

  // The caller's owned crew id as a string, or null when they own no crew.
  const myCrewId = myCrew ? myCrew.crewId.toString() : null;

  // A selected crew that no longer exists falls back to showing everyone.
  const activeCrewFilter: CrewFilter =
    crewFilter !== "all" && crewFilter !== "none" && !crewMap.has(crewFilter)
      ? "all"
      : crewFilter;

  const { live, archived } = useMemo(() => {
    const list = roadies ?? [];
    const q = query.trim().toLowerCase();
    const matchesCrew = (roadie: Roadie) => {
      if (activeCrewFilter === "all") return true;
      if (activeCrewFilter === "none") return roadie.crewId === undefined;
      return roadie.crewId?.toString() === activeCrewFilter;
    };
    const matches = (roadie: Roadie) => {
      if (!matchesCrew(roadie)) return false;
      if (!q) return true;
      const name = (
        roadie.profile.preferredName || roadie.profile.name
      ).toLowerCase();
      const position = (
        positionMap.get(roadie.mainPositionId.toString())?.name ?? ""
      ).toLowerCase();
      return name.includes(q) || position.includes(q);
    };
    return {
      live: list.filter(
        (roadie) => roadie.status !== RoadieStatus.archived && matches(roadie),
      ),
      archived: list.filter(
        (roadie) => roadie.status === RoadieStatus.archived && matches(roadie),
      ),
    };
  }, [roadies, query, positionMap, activeCrewFilter]);

  // The count of live roadies at each stage, keyed by the tab that shows them.
  const stageCounts = useMemo(() => {
    const counts: Record<RosterTab, number> = {
      all: live.length,
      hired: 0,
      paperworkDone: 0,
      oriented: 0,
      inTraining: 0,
      certified: 0,
    };
    for (const roadie of live) {
      if (roadie.stage === RoadieStage.hired) counts.hired += 1;
      else if (roadie.stage === RoadieStage.paperworkDone)
        counts.paperworkDone += 1;
      else if (roadie.stage === RoadieStage.oriented) counts.oriented += 1;
      else if (roadie.stage === RoadieStage.inTraining) counts.inTraining += 1;
      else if (roadie.stage === RoadieStage.certified) counts.certified += 1;
    }
    return counts;
  }, [live]);

  // The paperwork-overdue flag is computed from the orientation check-off,
  // which only Admin and Store Manager may read.
  const paperworkFlags = usePaperworkIncompleteMap(
    roadies ?? [],
    canArchive(role),
  );

  // The leader-talk line is only read for the roles that may read talks, so a
  // role the backend would refuse never triggers the read.
  const leaderTalkLines = useLeaderTalkLineMap(canLeaderTalks(role));

  const shown =
    tab === "all" || tab === "coverage"
      ? live
      : live.filter((roadie) => roadie.stage === stageForTab(tab));

  const shownEntries: CardEntry[] = useMemo(
    () => shown.map((roadie) => ({ key: roadie.id.toString(), roadie })),
    [shown],
  );
  const formerEntries: CardEntry[] = useMemo(
    () => archived.map((roadie) => ({ key: roadie.id.toString(), roadie })),
    [archived],
  );

  const positionNameOf = (roadie: Roadie) =>
    positionMap.get(roadie.mainPositionId.toString())?.name ??
    t("roadie.field.none");
  const crewNameOf = (roadie: Roadie) =>
    roadie.crewId === undefined
      ? undefined
      : crewMap.get(roadie.crewId.toString());

  const hasAny = live.length > 0 || archived.length > 0;

  const tabs: { key: RosterView; label: string; count: number }[] = [
    { key: "all", label: t("roster.filter.all"), count: stageCounts.all },
    { key: "hired", label: t("roster.filter.hired"), count: stageCounts.hired },
    {
      key: "paperworkDone",
      label: t("roster.filter.paperworkDone"),
      count: stageCounts.paperworkDone,
    },
    {
      key: "oriented",
      label: t("roster.filter.oriented"),
      count: stageCounts.oriented,
    },
    {
      key: "inTraining",
      label: t("roster.filter.inTraining"),
      count: stageCounts.inTraining,
    },
    {
      key: "certified",
      label: t("roster.filter.certified"),
      count: stageCounts.certified,
    },
  ];
  if (maySeeCoverage) {
    tabs.push({
      key: "coverage",
      label: t("roster.tab.coverage"),
      count: coverageSummary.stillToHire,
    });
  }

  const crewLabel = locale === "es" ? "Cuadrilla" : "Crew";
  const allCrewsLabel = locale === "es" ? "Todas las cuadrillas" : "All crews";
  const noCrewLabel = locale === "es" ? "Sin cuadrilla" : "No crew";
  const myCrewLabel = locale === "es" ? "Mi cuadrilla" : "My crew";

  return (
    <div className="space-y-6" data-ocid="roster.page">
      <PageHeader title={t("roster.title")} subtitle={t("roster.subtitle")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="roster-search" className="sr-only">
            {t("roster.search")}
          </label>
          <Input
            id="roster-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("roster.searchPlaceholder")}
            data-ocid="roster.search_input"
            className="touch-target"
          />
        </div>

        <div className="w-full sm:w-56">
          <Select
            value={activeCrewFilter}
            onValueChange={(value) => setCrewFilter(value as CrewFilter)}
          >
            <SelectTrigger
              id="roster-crew-filter"
              aria-label={crewLabel}
              data-ocid="roster.crew.select"
              className="touch-target w-full"
            >
              <SelectValue placeholder={allCrewsLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-ocid="roster.crew.all.option">
                {allCrewsLabel}
              </SelectItem>
              {crewOptions.map((crew) => (
                <SelectItem
                  key={crew.id.toString()}
                  value={crew.id.toString()}
                  data-ocid="roster.crew.option"
                >
                  {crew.name}
                </SelectItem>
              ))}
              <SelectItem value="none" data-ocid="roster.crew.none.option">
                {noCrewLabel}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {myCrewId && (
          <button
            type="button"
            aria-pressed={activeCrewFilter === myCrewId}
            data-ocid="roster.crew.my_crew.toggle"
            onClick={() =>
              setCrewFilter((current) =>
                current === myCrewId ? "all" : myCrewId,
              )
            }
            className={cn(
              "touch-target inline-flex items-center gap-2 self-start rounded-full border px-4 font-display text-sm font-semibold uppercase tracking-wider transition-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-end",
              activeCrewFilter === myCrewId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            {myCrewLabel}
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label={t("roster.title")}
        className="flex flex-wrap gap-2"
        data-ocid="roster.tabs"
      >
        {tabs.map((entry) => {
          const selected = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-ocid={`roster.filter.${entry.key}.tab`}
              onClick={() => setTab(entry.key)}
              className={cn(
                "touch-target inline-flex items-center gap-2 rounded-full border px-4 font-display text-sm font-semibold uppercase tracking-wider transition-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {entry.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {entry.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "coverage" && maySeeCoverage && (
        <CoveragePanel
          summary={coverageSummary}
          isLoading={coverage.isLoading}
          isError={coverage.isError}
          onRetry={() => void coverage.refetch()}
        />
      )}

      {tab !== "coverage" && isLoading && (
        <LoadingState label={t("roster.loading")} />
      )}
      {tab !== "coverage" && isError && (
        <ErrorState
          message={t("roster.error")}
          onRetry={() => void refetch()}
        />
      )}

      {tab !== "coverage" && !isLoading && !isError && !hasAny && (
        <EmptyState title={query ? t("roster.empty") : t("roster.emptyAll")} />
      )}

      {tab !== "coverage" &&
        !isLoading &&
        !isError &&
        hasAny &&
        shown.length === 0 && (
          <EmptyState
            title={
              tab === "hired"
                ? t("roster.emptyHired")
                : tab === "paperworkDone"
                  ? t("roster.emptyPaperworkDone")
                  : tab === "oriented"
                    ? t("roster.emptyOriented")
                    : tab === "inTraining"
                      ? t("roster.emptyInTraining")
                      : tab === "certified"
                        ? t("roster.emptyCertified")
                        : t("roster.emptyAll")
            }
          />
        )}

      {tab !== "coverage" && shown.length > 0 && (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-ocid="roster.list"
        >
          {shown.map((roadie, index) => (
            <RoadieTile
              key={roadie.id.toString()}
              roadie={roadie}
              positionName={positionNameOf(roadie)}
              crewName={crewNameOf(roadie) ?? t("roadie.field.none")}
              crewLabel={t("roadie.field.crew")}
              leaderTalkLine={leaderTalkLines.get(roadie.id.toString())}
              paperworkIncomplete={paperworkFlags.get(roadie.id.toString())}
              onOpen={() => setCard({ list: tab, index })}
              ocid="roster.item"
              statusOcid="roster.item.status"
              photoOcid="roster.item.photo"
            />
          ))}
        </ul>
      )}

      {tab !== "coverage" && archived.length > 0 && (
        <section className="space-y-3" data-ocid="roster.former.section">
          <button
            type="button"
            className="touch-target flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-2 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted"
            aria-expanded={showFormer}
            data-ocid="roster.former.toggle"
            onClick={() => setShowFormer((on) => !on)}
          >
            {showFormer
              ? t("dashboard.roster.hideFormer", { count: archived.length })
              : t("dashboard.roster.showFormer", { count: archived.length })}
            {showFormer ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {showFormer && (
            <>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {t("dashboard.roster.formerTitle")}
              </h2>
              <ul
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                data-ocid="roster.former.list"
              >
                {archived.map((roadie, index) => (
                  <RoadieTile
                    key={roadie.id.toString()}
                    roadie={roadie}
                    positionName={positionNameOf(roadie)}
                    onOpen={() => setCard({ list: "former", index })}
                    ocid="roster.former.item"
                    statusOcid="roster.former.item.status"
                    photoOcid="roster.former.item.photo"
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <RoadieCardModal
        entries={card?.list === "former" ? formerEntries : shownEntries}
        index={card?.index ?? 0}
        open={card !== null}
        onOpenChange={(next) => {
          if (!next) setCard(null);
        }}
        onIndexChange={(index) =>
          setCard((current) => (current ? { ...current, index } : current))
        }
        renderFullProfile={
          mayOpenFullProfile
            ? (entry, onNavigate) => (
                <FullProfileLink entry={entry} onNavigate={onNavigate} />
              )
            : undefined
        }
      />
    </div>
  );
}
