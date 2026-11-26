import type {
  Alert,
  Position,
  RosterSummary,
  ScheduleEvent,
  StoreInfo,
} from "@/backend";
import { EventKind, RoadieStatus, createActor } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { StoreLogo } from "@/components/StoreLogo";
import { DashboardErrorBoundary } from "@/components/dashboard/DashboardErrorBoundary";
import type { OrientationWindow } from "@/components/dashboard/KpiTiles";
import { PositionPanel } from "@/components/dashboard/PositionPanel";
import { PositionRosterDialog } from "@/components/dashboard/PositionRosterDialog";
import { useDashboardCopy } from "@/components/dashboard/copy";
import { usePaperworkIncompleteMap } from "@/components/roadie/RoadieTile";
import { Button } from "@/components/ui/button";
import {
  canApproveSignups,
  canArchive,
  canCoverage,
  canEvents,
  canFinalizeOpeningQuestions,
  canOpeningQuestions,
  canSeeAbsentAlerts,
  isAdminRole,
  useAccessState,
  useDemoAwareStoreInfo,
  useRealAccessGrant,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useAbsentAlerts,
  useAcknowledgeAlert,
  useAtRiskRoadies,
  useCoverage,
  useDashboard,
  useDemoState,
  useOpeningQuestionAlerts,
  usePendingSignups,
  useRoadies,
  useRosterSummary,
  useSchedule,
} from "@/hooks/useQueries";
import { useSeedWhenEmpty } from "@/hooks/useSeeding";
import { formatCoverage } from "@/lib/coverage";
import {
  formatDateOnly,
  pretendDateToInstant,
  timestampToDate,
} from "@/lib/format";
import { paperworkDueEvent } from "@/lib/schedule";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronRight,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

// The two heaviest dashboard sections load on demand so the page shell paints
// first. Both lazy components are module-level constants so a re-render never
// creates a new lazy wrapper (which would re-import and remount the section).
// The `.then` mapping keeps their named exports intact for other callers. The
// timeline is rendered through its hook-free view: the page already holds the
// store info, effective "now" and paperwork flags it needs, and every backend
// hook mounted inside the chunk would refetch the whole query cache on arrival.
const KpiTiles = lazy(() =>
  import("@/components/dashboard/KpiTiles").then((m) => ({
    default: m.KpiTiles,
  })),
);
const OpeningTimeline = lazy(() =>
  import("@/components/dashboard/OpeningTimeline").then((m) => ({
    default: m.OpeningTimelineView,
  })),
);

const KPI_SKELETON_TILES = ["hired", "needed", "showed", "certified"];
const TIMELINE_SKELETON_ROWS = ["first", "second", "third", "fourth"];

/** A neutral grey placeholder for the KPI section: a progress bar plus tiles. */
function KpiTilesSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-ocid="dashboard.kpi.loading_state"
      className="space-y-4"
    >
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI_SKELETON_TILES.map((id) => (
          <div key={id} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

/** A neutral grey placeholder for the timeline: a short stack of rows. */
function OpeningTimelineSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-ocid="dashboard.timeline.loading_state"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      {TIMELINE_SKELETON_ROWS.map((id) => (
        <div key={id} className="h-10 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

/**
 * The dashboard hero banner: a navy panel with the red-and-white flag stripe,
 * the store's secondary logo at about 96px on phones and 120px from the small
 * breakpoint up, and the store name and opening date beside it. On phones the
 * logo is centered above the name and date; from the small breakpoint up it
 * sits on the left alongside them. When no secondary logo has been uploaded the
 * banner shows just the name and date, with no star fallback.
 */
function DashboardHero({ storeInfo }: { storeInfo: StoreInfo | null }) {
  const storeName = storeInfo?.locationName || storeInfo?.appName || "";
  const openingDate = storeInfo ? formatDateOnly(storeInfo.openingDate) : null;
  const hasOpeningDate = !!openingDate && openingDate !== "—";

  return (
    <section
      data-ocid="dashboard.hero"
      className="overflow-hidden rounded-lg bg-secondary text-secondary-foreground shadow-subtle"
    >
      <div className="flex flex-col items-center gap-4 px-5 py-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-7 sm:text-left">
        {/* The secondary logo sits on the left of the store name and date. It
            renders nothing when no secondary logo has been uploaded, so the
            banner falls back to just the name and date. */}
        <StoreLogo
          variant="secondary"
          className="h-24 shrink-0 sm:h-[120px]"
          title={storeName || "Roadie store"}
        />
        <div className="min-w-0">
          {storeName && (
            <h2 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide text-white md:text-3xl">
              {storeName}
            </h2>
          )}
          {hasOpeningDate && (
            <p className="mt-1 text-sm text-white/80 md:text-base">
              <span className="font-display uppercase tracking-wider text-white/60">
                Opening
              </span>{" "}
              <span className="font-medium text-white">{openingDate}</span>
            </p>
          )}
        </div>
      </div>
      <div className="stripe-flag" aria-hidden="true" />
    </section>
  );
}

/** The backend alerts store, readable by Admin and Store Manager only. */
function useAlerts(enabled: boolean) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async (): Promise<Alert[]> => {
      if (!actor) return [];
      return actor.listAlerts();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * The current instant, refreshed on an interval. When demo mode supplies a
 * pretend date, that instant is returned instead of the real clock so the
 * orientation window follows the pretend date.
 */
function useNow(pretendInstant: number | null, intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return pretendInstant ?? now;
}

/**
 * The orientation window, derived from the schedule. The window opens on the
 * schedule's "Paperwork due" deadline event and closes on the final sign-off
 * date; the orientation session date marks the point after which no-shows are
 * counted. All three dates respect the demo "Pretend it's" date through `now`.
 */
function useOrientationWindow(
  events: ScheduleEvent[],
  now: number,
): OrientationWindow {
  return useMemo(() => {
    const dueEvent = paperworkDueEvent(events);
    const dueInstant = dueEvent
      ? (timestampToDate(dueEvent.start)?.getTime() ?? null)
      : null;

    let orientationInstant: number | null = null;
    let signOffInstant: number | null = null;
    for (const event of events) {
      const date = timestampToDate(event.start);
      if (!date) continue;
      const time = date.getTime();
      if (event.kind === EventKind.orientation) {
        if (orientationInstant === null || time < orientationInstant) {
          orientationInstant = time;
        }
      } else if (event.kind === EventKind.signOff) {
        if (signOffInstant === null || time > signOffInstant) {
          signOffInstant = time;
        }
      }
    }

    const isOpen =
      dueInstant !== null &&
      now >= dueInstant &&
      (signOffInstant === null || now <= signOffInstant);

    return {
      isOpen,
      afterOrientation:
        orientationInstant !== null && now >= orientationInstant,
      afterSignOff: signOffInstant !== null && now >= signOffInstant,
    };
  }, [events, now]);
}

/**
 * One row in the "Needs attention" box: a count, a short label and a link to
 * the page where the person acts. Styled as a link like the existing rows.
 */
function AttentionRow({
  to,
  count,
  label,
  detail,
  ocid,
}: {
  to: string;
  count: number;
  label: string;
  detail?: string;
  ocid: string;
}) {
  return (
    <Link
      to={to}
      data-ocid={ocid}
      className="flex min-h-[44px] items-center gap-3 rounded-md border border-destructive/30 bg-card px-3 py-2 text-foreground transition-colors hover:border-destructive/60 hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 px-2 font-display text-sm font-bold tabular-nums text-destructive">
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xs font-semibold uppercase tracking-wider text-destructive">
          {label}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-sm text-foreground">
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * The dashboard "Needs attention" box: what is waiting on the signed-in person,
 * each item as one row with a count, a short label and a link to the page where
 * they act. Rows appear in a fixed order — new hires to approve, absent roadies
 * waiting on a decision, paperwork incomplete, Opening Questions, then stored
 * alerts — and only when the count is above 0 and the role may act on it. The
 * whole box hides when nothing is waiting.
 */
function DashboardAlerts({
  paperworkNames,
  alerts,
}: {
  paperworkNames: string[];
  alerts: Alert[];
}) {
  const { t } = useDashboardCopy();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const { data: demoState } = useDemoState();
  const demoEnabled = demoState?.enabled ?? false;

  // New hires and absent roadies follow demo mode exactly as their own pages do,
  // so their reads run while demo mode is on and show demo data.
  const mayApproveSignups = canApproveSignups(role);
  const { data: pendingSignups } = usePendingSignups(mayApproveSignups);
  const maySeeAbsent = canSeeAbsentAlerts(role);
  const { data: absentAlerts } = useAbsentAlerts(maySeeAbsent);

  // At-risk roadies follow the caller's role and the demo partition, matching
  // the Events page, so the row shows the same roadies the manager can act on.
  // The backend listAtRiskRoadies only requires a manager (Admin, Managing
  // Partner or Store Manager), so the read is gated on that rather than on the
  // Events page role list: a crew leader whose My crew flag shows the risk must
  // still see the row, even though the Events page itself is not open to them.
  const maySeeAtRisk = canArchive(role);
  const { data: atRiskRoadies } = useAtRiskRoadies(maySeeAtRisk);

  // Opening Questions ownership uses the caller's real role, as Today does, and
  // the rows hide entirely while demo mode is on.
  const realRole = useRealAccessGrant()?.role;
  const mayReadQuestions = canOpeningQuestions(realRole) && !demoEnabled;
  const { data: questionAlerts } = useOpeningQuestionAlerts(mayReadQuestions);

  const acknowledge = useAcknowledgeAlert();
  const openAlerts = alerts.filter((alert) => !alert.acknowledged);

  const newHires = mayApproveSignups ? (pendingSignups?.length ?? 0) : 0;
  const absent = maySeeAbsent ? (absentAlerts?.length ?? 0) : 0;
  const atRisk = maySeeAtRisk ? (atRiskRoadies?.length ?? 0) : 0;
  const paperwork = paperworkNames.length;

  const needsApproval = mayReadQuestions
    ? Number(questionAlerts?.needsMyApproval ?? 0)
    : 0;
  const newActivity = mayReadQuestions
    ? Number(questionAlerts?.newSuggestionsOrReplies ?? 0)
    : 0;
  const decisionsDue =
    mayReadQuestions && isAdminRole(realRole)
      ? Number(questionAlerts?.decisionsDue ?? 0)
      : 0;
  const readyForFinal =
    mayReadQuestions && canFinalizeOpeningQuestions(realRole)
      ? Number(questionAlerts?.readyForFinal ?? 0)
      : 0;

  const hasAny =
    newHires > 0 ||
    absent > 0 ||
    atRisk > 0 ||
    paperwork > 0 ||
    needsApproval > 0 ||
    newActivity > 0 ||
    decisionsDue > 0 ||
    readyForFinal > 0 ||
    openAlerts.length > 0;
  if (!hasAny) return null;

  return (
    <section
      data-ocid="dashboard.alerts"
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {t("dashboard.alerts.title")}
      </h2>

      {newHires > 0 && (
        <AttentionRow
          to="/approvals"
          count={newHires}
          label={t("dashboard.alerts.newHires", { count: newHires })}
          ocid="dashboard.alerts.newHires"
        />
      )}

      {absent > 0 && (
        <AttentionRow
          to="/today"
          count={absent}
          label={t("dashboard.alerts.absent", { count: absent })}
          ocid="dashboard.alerts.absent"
        />
      )}

      {atRisk > 0 && (
        <AttentionRow
          to="/events"
          count={atRisk}
          label={t("dashboard.alerts.atRisk", { count: atRisk })}
          ocid="dashboard.alerts.atRisk"
        />
      )}

      {paperwork > 0 && (
        <AttentionRow
          to="/roster"
          count={paperwork}
          label={t("dashboard.alerts.paperwork", { count: paperwork })}
          detail={paperworkNames.join(", ")}
          ocid="dashboard.alerts.paperwork"
        />
      )}

      {needsApproval > 0 && (
        <AttentionRow
          to="/opening-questions"
          count={needsApproval}
          label={t("dashboard.alerts.oqNeedsApproval", {
            count: needsApproval,
          })}
          ocid="dashboard.alerts.oqNeedsApproval"
        />
      )}

      {newActivity > 0 && (
        <AttentionRow
          to="/opening-questions"
          count={newActivity}
          label={t("dashboard.alerts.oqNewActivity", { count: newActivity })}
          ocid="dashboard.alerts.oqNewActivity"
        />
      )}

      {decisionsDue > 0 && (
        <AttentionRow
          to="/opening-questions"
          count={decisionsDue}
          label={t("dashboard.alerts.oqDecisionsDue", { count: decisionsDue })}
          ocid="dashboard.alerts.oqDecisionsDue"
        />
      )}

      {readyForFinal > 0 && (
        <AttentionRow
          to="/opening-questions"
          count={readyForFinal}
          label={t("dashboard.alerts.oqReadyForFinal", {
            count: readyForFinal,
          })}
          ocid="dashboard.alerts.oqReadyForFinal"
        />
      )}

      {openAlerts.map((alert) => (
        <div
          key={alert.id.toString()}
          data-ocid="dashboard.alerts.item"
          className="flex min-h-[44px] items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
        >
          <p className="min-w-0 flex-1 text-sm text-foreground">
            {alert.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="touch-target shrink-0"
            disabled={acknowledge.isPending}
            data-ocid="dashboard.alerts.dismiss_button"
            onClick={() => acknowledge.mutate(alert.id)}
          >
            {t("dashboard.alerts.dismiss")}
          </Button>
        </div>
      ))}

      {acknowledge.isError && (
        <p
          role="alert"
          data-ocid="dashboard.alerts.dismiss_error"
          className="text-sm text-destructive"
        >
          {t("dashboard.alerts.dismissError")}
        </p>
      )}
    </section>
  );
}

/**
 * The one-line coverage summary card: the same FOH + BOH totals the Roster
 * Coverage tab shows, as a single row of figures. Shown only to the six manager
 * roles that may read coverage, and read-only — it never changes pars or
 * build-to numbers. Links to the Coverage tab on the Roster.
 */
function CoverageSummaryCard() {
  const { t } = useDashboardCopy();
  const { locale } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const maySeeCoverage = canCoverage(role);
  const { data, isLoading } = useCoverage(maySeeCoverage);
  const summary = useMemo(() => formatCoverage(data), [data]);

  if (!maySeeCoverage) return null;

  const figures: Array<{ key: string; label: string; value: number }> = [
    {
      key: "shiftsNeeded",
      label: t("roster.coverage.shiftsNeeded"),
      value: summary.foh.shiftsNeeded + summary.boh.shiftsNeeded,
    },
    {
      key: "shiftCapacity",
      label: t("roster.coverage.shiftCapacity"),
      value: summary.foh.shiftCapacity + summary.boh.shiftCapacity,
    },
    {
      key: "shortShifts",
      label: t("roster.coverage.shortShifts"),
      value: summary.foh.shortShifts + summary.boh.shortShifts,
    },
    {
      key: "stillToHire",
      label: t("roster.coverage.stillToHire"),
      value: summary.stillToHire,
    },
  ];

  return (
    <Link
      to="/roster"
      search={{ tab: "coverage" }}
      data-ocid="dashboard.coverage.card"
      className="block rounded-lg border border-border bg-card p-4 shadow-subtle transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Layers className="h-4 w-4" aria-hidden="true" />
          {t("roster.coverage.title")}
        </h2>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          {locale === "es" ? "Ver cobertura" : "View coverage"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      {isLoading ? (
        <div
          aria-hidden="true"
          data-ocid="dashboard.coverage.loading_state"
          className="mt-3 h-10 animate-pulse rounded-md bg-muted"
        />
      ) : (
        <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {figures.map((figure) => (
            <div key={figure.key} className="flex items-baseline gap-2">
              <dt className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {figure.label}
              </dt>
              <dd
                className={
                  figure.key === "shortShifts" && figure.value > 0
                    ? "font-display text-xl font-bold tabular-nums text-destructive"
                    : "font-display text-xl font-bold tabular-nums text-foreground"
                }
              >
                {figure.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}

function DashboardContent() {
  const { t } = useDashboardCopy();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const canAdjust = canArchive(role);
  const canRehire = canArchive(role);

  const { data, isLoading, isError, refetch } = useDashboard();
  const { data: schedule } = useSchedule();
  const { data: storeInfo } = useDemoAwareStoreInfo();
  const { data: rosterSummary } = useRosterSummary();
  const { data: roadies } = useRoadies();
  const { data: alerts } = useAlerts(canAdjust);

  // The orientation window follows the demo "Pretend it's" date when demo mode
  // supplies one, so the summary phases move with the pretend date. The demo
  // state is read directly: `useDemo` also mounts the four demo mutations, and
  // every mounted backend hook refetches the whole query cache on mount.
  const { data: demoState } = useDemoState();
  const demoEnabled = demoState?.enabled ?? false;
  const pretendDate = demoState?.pretendDate ?? null;
  const pretendInstant = useMemo(() => {
    if (!demoEnabled || !pretendDate || !storeInfo) return null;
    return (
      pretendDateToInstant(
        pretendDate,
        storeInfo.timeZone,
        storeInfo.amShiftStart,
        storeInfo.pmShiftStart,
      )?.getTime() ?? null
    );
  }, [demoEnabled, pretendDate, storeInfo]);
  const now = useNow(pretendInstant);
  const orientationWindow = useOrientationWindow(schedule ?? [], now);

  // A fresh install (or a store with no positions yet) is seeded once so the
  // dashboard shows the 18 seeded positions instead of an empty shell.
  const hasNoPositions =
    !!data && data.foh.length === 0 && data.boh.length === 0;
  useSeedWhenEmpty(!!data, hasNoPositions);

  const summaryByPosition = useMemo(() => {
    const map = new Map<string, RosterSummary>();
    for (const row of rosterSummary ?? []) {
      map.set(row.positionId.toString(), row);
    }
    return map;
  }, [rosterSummary]);

  // The paperwork-overdue flag is computed from the orientation check-off,
  // which only Admin and Store Manager may read.
  const paperworkFlags = usePaperworkIncompleteMap(roadies ?? [], canAdjust);
  const paperworkNames = useMemo(() => {
    if (!canAdjust) return [];
    return (roadies ?? [])
      .filter((roadie) => paperworkFlags.get(roadie.id.toString()))
      .map((roadie) => roadie.profile.preferredName || roadie.profile.name);
  }, [canAdjust, roadies, paperworkFlags]);
  // Whether any active roadie still has incomplete paperwork, which turns a
  // past paperwork deadline on the timeline into "Past due".
  const hasIncompleteActivePaperwork = useMemo(
    () =>
      (roadies ?? []).some(
        (roadie) =>
          roadie.status !== RoadieStatus.archived &&
          paperworkFlags.get(roadie.id.toString()) === true,
      ),
    [roadies, paperworkFlags],
  );

  const [adjustMode, setAdjustMode] = useState(false);
  const [selected, setSelected] = useState<Position | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  const openRoster = (position: Position) => {
    setSelected(position);
    setRosterOpen(true);
  };

  return (
    <div className="space-y-6" data-ocid="dashboard.page">
      <DashboardHero storeInfo={storeInfo ?? null} />

      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          canAdjust ? (
            <Button
              type="button"
              variant={adjustMode ? "default" : "outline"}
              className="touch-target"
              aria-pressed={adjustMode}
              data-ocid="dashboard.adjust.toggle"
              onClick={() => setAdjustMode((on) => !on)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
              {adjustMode
                ? t("dashboard.adjust.done")
                : t("dashboard.adjust.mode")}
            </Button>
          ) : undefined
        }
      />

      {isLoading && <LoadingState label={t("dashboard.loading")} />}
      {isError && (
        <ErrorState
          message={t("dashboard.error")}
          onRetry={() => void refetch()}
        />
      )}

      {data && (
        <>
          <Suspense fallback={<OpeningTimelineSkeleton />}>
            <OpeningTimeline
              events={schedule ?? []}
              openingDate={storeInfo?.openingDate ?? null}
              now={now}
              timeZone={storeInfo?.timeZone}
              hasIncompleteActivePaperwork={hasIncompleteActivePaperwork}
            />
          </Suspense>

          <DashboardAlerts
            paperworkNames={paperworkNames}
            alerts={alerts ?? []}
          />

          <CoverageSummaryCard />

          <Suspense fallback={<KpiTilesSkeleton />}>
            <KpiTiles
              hired={data.hired}
              active={data.active}
              pending={data.pending}
              buildToTotal={data.buildToTotal}
              stillNeeded={data.stillNeeded}
              certified={data.certified}
              window={orientationWindow}
            />
          </Suspense>

          {adjustMode && canAdjust && (
            <p
              className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
              data-ocid="dashboard.adjust.hint"
            >
              {t("dashboard.adjust.hint")}
            </p>
          )}

          {data.foh.length === 0 && data.boh.length === 0 ? (
            <EmptyState title={t("dashboard.empty")} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <PositionPanel
                titleKey="dashboard.section.foh"
                positions={data.foh}
                summaryByPosition={summaryByPosition}
                adjustMode={adjustMode}
                canAdjust={canAdjust}
                showSplit={orientationWindow.isOpen}
                onOpenRoster={openRoster}
                ocid="dashboard.foh.section"
              />
              <PositionPanel
                titleKey="dashboard.section.boh"
                positions={data.boh}
                summaryByPosition={summaryByPosition}
                adjustMode={adjustMode}
                canAdjust={canAdjust}
                showSplit={orientationWindow.isOpen}
                onOpenRoster={openRoster}
                ocid="dashboard.boh.section"
              />
            </div>
          )}
        </>
      )}

      {/* The roster dialog (and the card modal inside it) mounts once a
          position has been picked and stays mounted afterwards, so its backend
          hooks do not run for a dialog nobody has opened. */}
      {selected && (
        <PositionRosterDialog
          position={selected}
          open={rosterOpen}
          onOpenChange={setRosterOpen}
          canRehire={canRehire}
        />
      )}
    </div>
  );
}
