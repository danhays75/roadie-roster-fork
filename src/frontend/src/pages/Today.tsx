import type {
  FinalSignOffView,
  GroupChangeNotice,
  MyCrewRoadieRow,
  MyGroupView,
  NextEventView,
  Roadie,
  ShiftBoardRoadie,
  ShiftCheckInSummary,
  TrainerNoteView,
} from "@/backend";
import { Role, createActor } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { AbsentAlertsList } from "@/components/alerts/AbsentAlertsList";
import { CheckInBoard } from "@/components/checkin/CheckInBoard";
import { useDashboardCopy } from "@/components/dashboard/copy";
import { PracticeRunCard } from "@/components/demo/PracticeRunCard";
import { FinalSignOffForm } from "@/components/roadie/FinalSignOffForm";
import {
  type CardEntry,
  RoadieCardModal,
} from "@/components/roadie/RoadieCardModal";
import { RoadiePhoto } from "@/components/roadie/RoadiePhoto";
import { RoadieStageBadge } from "@/components/roadie/RoadieTile";
import { TrainerNoteForm } from "@/components/roadie/TrainerNoteForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canAddTrainerNote,
  canFinalizeOpeningQuestions,
  canManageCheckIns,
  canOpeningQuestions,
  canReadTrainerNotes,
  canRecordFinalSignOff,
  canSeeManagerToday,
  isTodayReadOnly,
  useAccessState,
  useRealAccessGrant,
} from "@/hooks/useAccess";
import {
  useDemoState,
  useDismissGroupChangeNotice,
  useGroupChangeNotices,
  useMyAccess,
  useMyCrew,
  useMyGroup,
  useMyOpeningQuestionNudges,
  useOpeningQuestionAlerts,
  useRoadies,
  useSchedule,
  useStoreInfo,
  useToday,
} from "@/hooks/useQueries";
import {
  dateOnlyToDate,
  formatTimestamp,
  pretendDateToInstant,
  refToDataUrl,
} from "@/lib/format";
import { hasReachedFinalSignOff } from "@/lib/schedule";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  NotebookPen,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

/**
 * One dismissible "Your group changed" notice: the shift label, the added and
 * removed roadie names and the editor's name, with a Dismiss action that hides
 * it for the signed-in trainer.
 */
function GroupChangeNoticeCard({ notice }: { notice: GroupChangeNotice }) {
  const { t } = useDashboardCopy();
  const dismiss = useDismissGroupChangeNotice();
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      data-ocid="today.notice.card"
      aria-label={t("groups.notice.title")}
      className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-subtle"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
              {t("groups.notice.title")}
            </h2>
            <span
              data-ocid="today.notice.shift"
              className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {notice.shiftLabel}
            </span>
          </div>
          {notice.addedNames.length > 0 && (
            <p
              data-ocid="today.notice.added"
              className="mt-2 text-sm text-foreground"
            >
              {t("groups.notice.added", {
                names: notice.addedNames.join(", "),
              })}
            </p>
          )}
          {notice.removedNames.length > 0 && (
            <p
              data-ocid="today.notice.removed"
              className="mt-1 text-sm text-foreground"
            >
              {t("groups.notice.removed", {
                names: notice.removedNames.join(", "),
              })}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {t("groups.notice.by", { name: notice.editorName })}
          </p>
          {error && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="touch-target shrink-0"
          aria-label={t("groups.notice.dismiss")}
          data-ocid="today.notice.dismiss_button"
          disabled={dismiss.isPending}
          onClick={() => {
            setError(null);
            dismiss.mutate(notice.id, {
              onError: (err) =>
                setError(
                  err instanceof Error
                    ? err.message
                    : t("groups.notice.dismissError"),
                ),
            });
          }}
        >
          {dismiss.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </section>
  );
}

/**
 * One roadie in the trainer's group: photo and name, tappable to open the card.
 * A role that may add a note gets a small Add note button, and a check mark
 * appears once the caller has written today's note for this roadie. From the
 * final sign-off day on, a role that may sign off also gets a Sign off button
 * (Update sign-off once a sign-off exists) and a Certified or Needs more time
 * chip showing the current outcome.
 */
function GroupRoadieCard({
  roadie,
  index,
  onOpen,
  canAddNote,
  hasTodayNote,
  onAddNote,
  canSignOff,
  signOff,
  onSignOff,
}: {
  roadie: ShiftBoardRoadie;
  index: number;
  onOpen: () => void;
  canAddNote: boolean;
  hasTodayNote: boolean;
  onAddNote: () => void;
  canSignOff: boolean;
  signOff: FinalSignOffView | null | undefined;
  onSignOff: () => void;
}) {
  const { t } = useDashboardCopy();
  const showSignOff = canSignOff;
  const hasFooter = canAddNote || showSignOff;

  return (
    <li data-ocid={`today.myGroup.item.${index}`} className="h-full">
      <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-subtle transition-smooth hover:-translate-y-0.5 hover:shadow-elevated">
        <button
          type="button"
          data-ocid={`today.myGroup.item.${index}.link`}
          onClick={onOpen}
          className="flex w-full flex-col text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <RoadiePhoto
            id={roadie.roadieId}
            name={roadie.name}
            className="aspect-[4/3] w-full rounded-none border-0 border-b-2 border-primary"
            iconClassName="h-8 w-8"
            ocid={`today.myGroup.item.${index}.photo`}
            fallback={
              <span
                className="flex h-full w-full items-center justify-center font-display text-2xl font-bold uppercase tracking-wide text-[#14284B]"
                aria-hidden="true"
              >
                {roadie.name.slice(0, 2).toUpperCase()}
              </span>
            }
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
            <span className="truncate font-display text-sm font-semibold uppercase tracking-wide text-foreground">
              {roadie.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {roadie.positionCode}
            </span>
          </span>
        </button>
        {hasFooter && (
          <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
            {showSignOff && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {signOff ? (
                  <span
                    data-ocid={`today.myGroup.item.${index}.sign_off_chip`}
                    className={
                      signOff.outcome.__kind__ === "certified"
                        ? "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                        : "inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
                    }
                  >
                    {signOff.outcome.__kind__ === "certified" ? (
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {signOff.outcome.__kind__ === "certified"
                      ? t("signOff.chip.certified")
                      : t("signOff.chip.needsMoreTime")}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <Button
                  type="button"
                  variant={signOff ? "outline" : "default"}
                  size="sm"
                  className="touch-target"
                  aria-label={
                    signOff ? t("signOff.tileUpdate") : t("signOff.tileButton")
                  }
                  data-ocid={`today.myGroup.item.${index}.sign_off_button`}
                  onClick={onSignOff}
                >
                  {signOff ? t("signOff.tileUpdate") : t("signOff.tileButton")}
                </Button>
              </div>
            )}
            {canAddNote && (
              <div className="flex items-center justify-between gap-2">
                {hasTodayNote ? (
                  <span
                    data-ocid={`today.myGroup.item.${index}.note_done`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">
                      {t("today.myGroup.noteDone")}
                    </span>
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="touch-target"
                  aria-label={t("today.myGroup.addNoteFor", {
                    name: roadie.name,
                  })}
                  data-ocid={`today.myGroup.item.${index}.add_note_button`}
                  onClick={onAddNote}
                >
                  <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t("today.myGroup.addNote")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * One roadie in the caller's crew: photo, name, position, Pending/Active
 * status and paperwork "x of y", with a red "Absent today" tag when the roadie
 * is absent today and a red "Paperwork overdue" tag when their paperwork is
 * incomplete after the due date. Tapping the row opens the shared card pop-up.
 * No contact information is shown here.
 */
function MyCrewRow({
  row,
  index,
  onOpen,
}: {
  row: MyCrewRoadieRow;
  index: number;
  onOpen: () => void;
}) {
  return (
    <li data-ocid={`today.myCrew.item.${index}`}>
      <button
        type="button"
        data-ocid={`today.myCrew.item.${index}.link`}
        onClick={onOpen}
        aria-label={`Open ${row.name}'s card`}
        className="group flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-subtle transition-smooth hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <RoadiePhoto
          id={row.roadieId}
          name={row.name}
          demoPhotoUrl={row.demoPhotoUrl}
          className="h-12 w-12 shrink-0"
          iconClassName="h-6 w-6"
          ocid={`today.myCrew.item.${index}.photo`}
          fallback={
            <span
              className="flex h-full w-full items-center justify-center font-display text-base font-bold uppercase tracking-wide text-[#14284B]"
              aria-hidden="true"
            >
              {row.name.slice(0, 2).toUpperCase()}
            </span>
          }
        />

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            data-ocid={`today.myCrew.item.${index}.name`}
            className="truncate font-display text-sm font-semibold uppercase tracking-wide text-foreground"
          >
            {row.name}
          </span>
          <span
            data-ocid={`today.myCrew.item.${index}.position`}
            className="truncate text-xs text-muted-foreground"
          >
            {row.positionName}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <RoadieStageBadge
              stage={row.stage}
              paperworkStep={row.paperworkStep}
              ocid={`today.myCrew.item.${index}.status`}
            />
            <span
              data-ocid={`today.myCrew.item.${index}.paperwork`}
              className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {`${Number(row.paperworkDone)} of ${Number(row.paperworkTotal)}`}
            </span>
            {row.absentToday && (
              <StatusBadge
                tone="danger"
                ocid={`today.myCrew.item.${index}.absent`}
              >
                Absent today
              </StatusBadge>
            )}
            {row.paperworkOverdue && (
              <StatusBadge
                tone="danger"
                ocid={`today.myCrew.item.${index}.overdue`}
              >
                Paperwork overdue
              </StatusBadge>
            )}
          </span>
        </span>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

/**
 * The caller's own crew: the "My crew · N roadies" heading and one row per
 * roadie with their photo, name, position, Pending/Active status and paperwork
 * "x of y", plus a red "Absent today" tag when absent and a red "Paperwork
 * overdue" tag when overdue. Tapping a row opens the shared card pop-up. The
 * section renders nothing when the caller owns no crew, so it is safe to mount
 * for any role.
 */
function MyCrewSection() {
  const { data: crew, isLoading, isError, refetch } = useMyCrew();
  const { data: allRoadies } = useRoadies();
  const [cardIndex, setCardIndex] = useState<number | null>(null);

  const roadieById = useMemo(() => {
    const map = new Map<string, Roadie>();
    for (const roadie of allRoadies ?? []) {
      map.set(roadie.id.toString(), roadie);
    }
    return map;
  }, [allRoadies]);

  const crewRoadies = crew?.roadies ?? [];

  // The card pop-up needs full Roadie records; a crew row whose roadie is not
  // in the roster read is skipped, so the modal never opens on a missing entry.
  const entries: CardEntry[] = useMemo(() => {
    const list: CardEntry[] = [];
    for (const row of crewRoadies) {
      const roadie = roadieById.get(row.roadieId.toString());
      if (roadie) list.push({ key: roadie.id.toString(), roadie });
    }
    return list;
  }, [crewRoadies, roadieById]);

  const entryIndexById = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry, index) => map.set(entry.key, index));
    return map;
  }, [entries]);

  if (!isLoading && !isError && !crew) return null;

  return (
    <section className="space-y-4" data-ocid="today.myCrew.section">
      <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">
        {`My crew · ${crewRoadies.length} roadies`}
      </h2>

      {isLoading && (
        <LoadingState
          label="Loading your crew…"
          ocid="today.myCrew.loading_state"
        />
      )}

      {isError && (
        <ErrorState
          message="We couldn't load your crew."
          onRetry={() => void refetch()}
          ocid="today.myCrew.error_state"
        />
      )}

      {!isLoading && !isError && crewRoadies.length === 0 && (
        <EmptyState
          title="No roadies in your crew yet."
          ocid="today.myCrew.empty_state"
        />
      )}

      {!isLoading && !isError && crewRoadies.length > 0 && (
        <ul className="space-y-3" data-ocid="today.myCrew.list">
          {crewRoadies.map((row, index) => (
            <MyCrewRow
              key={row.roadieId.toString()}
              row={row}
              index={index}
              onOpen={() =>
                setCardIndex(
                  entryIndexById.get(row.roadieId.toString()) ?? null,
                )
              }
            />
          ))}
        </ul>
      )}

      <RoadieCardModal
        entries={entries}
        index={cardIndex ?? 0}
        open={cardIndex !== null}
        onOpenChange={(next) => {
          if (!next) setCardIndex(null);
        }}
        onIndexChange={setCardIndex}
      />
    </section>
  );
}

/**
 * Whether the caller has already written a note for `roadieId` on `day`. Only
 * the caller's own notes count, so the check mark reflects this person's work.
 */
function hasTodayNote(
  notes: TrainerNoteView[] | undefined,
  roadieId: ShiftBoardRoadie["roadieId"],
  day: bigint,
  principal: string | null,
): boolean {
  if (!notes || !principal) return false;
  return notes.some(
    (note) =>
      note.roadieId.toString() === roadieId.toString() &&
      note.day === day &&
      note.author.toText() === principal,
  );
}

/**
 * The caller's own group for the current or next shift: the shift label, the
 * filled-of-capacity count, the roadies' photos and names, and a link to all
 * groups. Tapping a roadie opens the shared card pop-up. A role that may add a
 * note gets a small Add note button on each tile that opens the shared note
 * form for that roadie and today's shift, and a check mark once the caller has
 * written today's note for that roadie. A role that may record a final sign-off
 * gets a Sign off button and the Certified or Needs more time chip from the
 * sign-off day on.
 */
function MyGroupSection({
  group,
  role,
}: {
  group: MyGroupView;
  role: Role | undefined;
}) {
  const { t } = useDashboardCopy();
  const { data: allRoadies } = useRoadies();
  const { data: demo } = useDemoState();
  const { data: store } = useStoreInfo();
  const { data: access } = useMyAccess();
  const { data: schedule } = useSchedule();
  const { actor, isFetching } = useActor(createActor);
  const [cardIndex, setCardIndex] = useState<number | null>(null);
  const [noteRoadie, setNoteRoadie] = useState<ShiftBoardRoadie | null>(null);
  const [signOffRoadie, setSignOffRoadie] = useState<ShiftBoardRoadie | null>(
    null,
  );

  const canAddNote = canAddTrainerNote(role);
  const canReadNotes = canReadTrainerNotes(role);
  const canSignOff = canRecordFinalSignOff(role);
  const principal = access?.grant?.principal.toText() ?? null;

  // Today's day in store time, or the demo pretend date when demo mode is on,
  // matching the day the shared note form defaults to.
  const todayDay = useMemo(() => {
    const pretendDate = demo?.enabled ? demo.pretendDate : undefined;
    const instant = pretendDate
      ? pretendDateToInstant(pretendDate, {
          timeZone: store?.timeZone,
          amShiftStart: store?.amShiftStart,
          pmShiftStart: store?.pmShiftStart,
        })
      : null;
    const now = instant ?? new Date();
    return (
      BigInt(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) *
      1_000_000n
    );
  }, [
    demo?.enabled,
    demo?.pretendDate,
    store?.amShiftStart,
    store?.pmShiftStart,
    store?.timeZone,
  ]);

  const roadieById = useMemo(() => {
    const map = new Map<string, Roadie>();
    for (const roadie of allRoadies ?? []) {
      map.set(roadie.id.toString(), roadie);
    }
    return map;
  }, [allRoadies]);

  const groupRoadies = group.roadies;
  const entries: CardEntry[] = useMemo(() => {
    const list: CardEntry[] = [];
    for (const boardRoadie of groupRoadies) {
      const roadie = roadieById.get(boardRoadie.roadieId.toString());
      if (roadie) list.push({ key: roadie.id.toString(), roadie });
    }
    return list;
  }, [groupRoadies, roadieById]);

  // Map each board roadie to its position in `entries`, so a card opens the
  // matching entry even if a roadie is missing from the visible list.
  const entryIndexById = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry, index) => map.set(entry.key, index));
    return map;
  }, [entries]);

  // Every group roadie's notes, so each tile's check mark reflects that
  // roadie's own notes rather than only the roadie whose dialog is open. Demo
  // notes stay demo notes: the backend returns only the current partition's
  // notes, and the check mark counts only the caller's own notes.
  const groupRoadieIds = useMemo(
    () => groupRoadies.map((roadie) => roadie.roadieId),
    [groupRoadies],
  );
  const groupNotesQueries = useQueries({
    queries: groupRoadieIds.map((roadieId) => ({
      queryKey: ["trainerNotes", roadieId.toString()],
      queryFn: async (): Promise<TrainerNoteView[]> => {
        if (!actor || roadieId === undefined) return [];
        return actor.listTrainerNotes(roadieId);
      },
      enabled: canReadNotes && !!actor && !isFetching,
    })),
  });
  const notesByRoadie = useMemo(() => {
    const map = new Map<string, TrainerNoteView[]>();
    groupRoadieIds.forEach((roadieId, index) => {
      const data = groupNotesQueries[index]?.data;
      if (data) map.set(roadieId.toString(), data);
    });
    return map;
  }, [groupRoadieIds, groupNotesQueries]);

  // The sign-off window opens on the schedule's Final trainer sign-off day,
  // compared against the demo pretend date when demo mode is on so the demo
  // practice run can reach it.
  const signOffOpen = useMemo(() => {
    if (!schedule) return false;
    const pretendDate = demo?.enabled ? demo.pretendDate : undefined;
    const instant = pretendDate
      ? pretendDateToInstant(pretendDate, {
          timeZone: store?.timeZone,
          amShiftStart: store?.amShiftStart,
          pmShiftStart: store?.pmShiftStart,
        })
      : null;
    return hasReachedFinalSignOff(schedule, instant ?? new Date());
  }, [
    schedule,
    demo?.enabled,
    demo?.pretendDate,
    store?.amShiftStart,
    store?.pmShiftStart,
    store?.timeZone,
  ]);

  // Every group roadie's current sign-off, so each tile shows its own Certified
  // or Needs more time chip. Only read for a role that may sign off, matching
  // the button's visibility.
  const showSignOff = canSignOff && signOffOpen;
  const signOffQueries = useQueries({
    queries: groupRoadieIds.map((roadieId) => ({
      queryKey: ["finalSignOff", roadieId.toString()],
      queryFn: async (): Promise<FinalSignOffView | null> => {
        if (!actor || roadieId === undefined) return null;
        return actor.getFinalSignOff(roadieId);
      },
      enabled: showSignOff && !!actor && !isFetching,
    })),
  });
  const signOffByRoadie = useMemo(() => {
    const map = new Map<string, FinalSignOffView | null>();
    groupRoadieIds.forEach((roadieId, index) => {
      const query = signOffQueries[index];
      if (query?.data !== undefined) {
        map.set(roadieId.toString(), query.data);
      }
    });
    return map;
  }, [groupRoadieIds, signOffQueries]);

  return (
    <section className="space-y-4" data-ocid="today.myGroup.section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">
            {t("today.myGroup.shift", { shift: group.shiftLabel })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("today.myGroup.capacity", {
              count: groupRoadies.length,
              capacity: Number(group.capacity),
            })}
          </p>
        </div>
        <Button asChild variant="outline" className="touch-target">
          <Link to="/groups" data-ocid="today.myGroup.view_all_link">
            <Users className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("today.myGroup.viewAll")}
          </Link>
        </Button>
      </div>

      {groupRoadies.length === 0 ? (
        <EmptyState
          title={t("today.myGroup.empty")}
          ocid="today.myGroup.empty_state"
        />
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-ocid="today.myGroup.list"
        >
          {groupRoadies.map((roadie, index) => (
            <GroupRoadieCard
              key={roadie.roadieId.toString()}
              roadie={roadie}
              index={index}
              canAddNote={canAddNote}
              hasTodayNote={hasTodayNote(
                notesByRoadie.get(roadie.roadieId.toString()),
                roadie.roadieId,
                todayDay,
                principal,
              )}
              onAddNote={() => setNoteRoadie(roadie)}
              canSignOff={showSignOff}
              signOff={signOffByRoadie.get(roadie.roadieId.toString())}
              onSignOff={() => setSignOffRoadie(roadie)}
              onOpen={() =>
                setCardIndex(
                  entryIndexById.get(roadie.roadieId.toString()) ?? null,
                )
              }
            />
          ))}
        </ul>
      )}

      <RoadieCardModal
        entries={entries}
        index={cardIndex ?? 0}
        open={cardIndex !== null}
        onOpenChange={(next) => {
          if (!next) setCardIndex(null);
        }}
        onIndexChange={setCardIndex}
      />

      <Dialog
        open={noteRoadie !== null}
        onOpenChange={(next) => {
          if (!next) setNoteRoadie(null);
        }}
      >
        <DialogContent data-ocid="today.myGroup.note_dialog">
          <DialogTitle>
            {t("today.myGroup.noteDialogTitle", {
              name: noteRoadie?.name ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("today.myGroup.noteDialogDescription", {
              name: noteRoadie?.name ?? "",
            })}
          </DialogDescription>
          {noteRoadie && (
            <TrainerNoteForm
              roadieId={noteRoadie.roadieId}
              onDone={() => setNoteRoadie(null)}
              onCancel={() => setNoteRoadie(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={signOffRoadie !== null}
        onOpenChange={(next) => {
          if (!next) setSignOffRoadie(null);
        }}
      >
        <DialogContent data-ocid="today.myGroup.sign_off_dialog">
          <DialogTitle>
            {t("signOff.title")}
            {signOffRoadie ? ` · ${signOffRoadie.name}` : ""}
          </DialogTitle>
          <DialogDescription>{t("signOff.subtitle")}</DialogDescription>
          {signOffRoadie && (
            <FinalSignOffForm
              roadieId={signOffRoadie.roadieId}
              signOff={signOffByRoadie.get(signOffRoadie.roadieId.toString())}
              onDone={() => setSignOffRoadie(null)}
              onCancel={() => setSignOffRoadie(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * The Opening Questions alert card for Admin, Store Manager, Training Manager
 * and leaders with a Manager area: how many questions need the caller's
 * approval, how many new suggestions or replies landed on questions they own or
 * commented on, and — for Admin only — how many decisions are due, with a link
 * to the Opening Qs page. Renders nothing while the counts load, on error, or
 * when nothing is waiting, so the rest of Today is unchanged.
 */
function OpeningQuestionsAlertCard() {
  const { t } = useDashboardCopy();
  // Opening Questions ownership and approval checks use the person's real role,
  // so the card matches what the backend allows even while demo mode is on.
  const realRole = useRealAccessGrant()?.role;
  const mayRead = canOpeningQuestions(realRole);
  const { data } = useOpeningQuestionAlerts(mayRead);

  if (!mayRead || !data) return null;

  const needsApproval = Number(data.needsMyApproval);
  const newActivity = Number(data.newSuggestionsOrReplies);
  const decisionsDue = realRole === Role.admin ? Number(data.decisionsDue) : 0;
  const total = needsApproval + newActivity + decisionsDue;

  if (total === 0) return null;

  const rows = [
    {
      key: "approval",
      count: needsApproval,
      label: t("oq.today.needsApproval", { count: needsApproval }),
      icon: BellRing,
    },
    {
      key: "activity",
      count: newActivity,
      label: t("oq.today.newActivity", { count: newActivity }),
      icon: MessageSquare,
    },
    {
      key: "decisions",
      count: decisionsDue,
      label: t("oq.today.decisionsDue", { count: decisionsDue }),
      icon: CalendarClock,
    },
  ].filter((row) => row.count > 0);

  return (
    <section
      data-ocid="today.openingQuestions.card"
      aria-label={t("oq.today.title")}
      className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-subtle"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MessageSquare className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
              {t("oq.today.title")}
            </h2>
            <span
              data-ocid="today.openingQuestions.count"
              className="inline-flex items-center rounded-full border border-primary/40 bg-card px-2 py-0.5 font-display text-[11px] font-semibold tabular-nums text-primary"
            >
              {total}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <li
                  key={row.key}
                  data-ocid={`today.openingQuestions.${row.key}`}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">{row.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button asChild variant="outline" className="touch-target">
          <Link to="/opening-questions" data-ocid="today.openingQuestions.link">
            {t("oq.today.open")}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * The Opening Questions nudge alert for the manager who was nudged: "<sender>
 * asked you to review N opening questions", where N is the count stored with
 * the nudge. Tapping it opens the Opening Qs page on the Needs my approval tab.
 * The backend returns only the caller's own nudges, so no other manager sees
 * this card. Renders nothing while the read loads, on error, or when the caller
 * has no nudge.
 */
function NudgeAlertCard() {
  const { t } = useDashboardCopy();
  const { data } = useMyOpeningQuestionNudges();
  const nudge = data?.[0];

  if (!nudge) return null;

  const count = Number(nudge.pendingCount);

  return (
    <section
      data-ocid="today.nudge.card"
      aria-label={t("oq.nudge.alertTitle")}
      className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-subtle"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
              {t("oq.nudge.alertTitle")}
            </h2>
            <span
              data-ocid="today.nudge.count"
              className="inline-flex items-center rounded-full border border-primary/40 bg-card px-2 py-0.5 font-display text-[11px] font-semibold tabular-nums text-primary"
            >
              {count}
            </span>
          </div>
          <p
            data-ocid="today.nudge.body"
            className="mt-2 text-sm text-foreground"
          >
            {t("oq.nudge.alert", { name: nudge.senderName, count })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button asChild variant="outline" className="touch-target">
          <Link
            to="/opening-questions"
            search={{ tab: "needsMyApproval" }}
            data-ocid="today.nudge.link"
          >
            {t("oq.today.open")}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * The Ready for final alert for the Managing Partner only: how many Opening
 * Questions have every owner's approval and are waiting to be marked final,
 * with a link to the Opening Qs page. Renders nothing for any other role, while
 * the count loads, on error, or when nothing is waiting, so the rest of Today
 * is unchanged.
 */
function ReadyForFinalAlertCard() {
  const { t } = useDashboardCopy();
  // Only the real Managing Partner may mark final, so the check uses the real
  // role rather than the demo role.
  const realRole = useRealAccessGrant()?.role;
  const mayFinalize = canFinalizeOpeningQuestions(realRole);
  const { data } = useOpeningQuestionAlerts(mayFinalize);

  if (!mayFinalize || !data) return null;

  const count = Number(data.readyForFinal);
  if (count === 0) return null;

  return (
    <section
      data-ocid="today.readyForFinal.card"
      aria-label={t("oq.tab.readyForFinal")}
      className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-subtle"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foreground">
              {t("oq.tab.readyForFinal")}
            </h2>
            <span
              data-ocid="today.readyForFinal.count"
              className="inline-flex items-center rounded-full border border-primary/40 bg-card px-2 py-0.5 font-display text-[11px] font-semibold tabular-nums text-primary"
            >
              {count}
            </span>
          </div>
          <p
            data-ocid="today.readyForFinal.body"
            className="mt-2 text-sm text-foreground"
          >
            {t("oq.today.readyForFinal", { count })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button asChild variant="outline" className="touch-target">
          <Link to="/opening-questions" data-ocid="today.readyForFinal.link">
            {t("oq.today.open")}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * The caller's own group tiles for the current or next shift, read on their
 * own so a manager who does not train a group still gets the tiles (and their
 * Sign off buttons) when they lead one. Renders nothing while loading, on
 * error, or when the caller leads no group on that shift, so it is safe to
 * mount for any role that may read the shift boards.
 */
function MyGroupTiles({ role }: { role: Role | undefined }) {
  const { data: group } = useMyGroup();
  if (!group) return null;
  return <MyGroupSection group={group} role={role} />;
}

/**
 * The trainer-facing Today content: the undismissed "Your group changed"
 * notices at the top, then the trainer check-in board for the caller's own
 * group on the current or next shift, then the group's roadie tiles. Only
 * mounted for roles that may read the shift boards, so the group and notice
 * reads never run for a role the backend would reject.
 */
function TrainerToday({
  mayCheckIn,
  role,
}: {
  mayCheckIn: boolean;
  role: Role | undefined;
}) {
  const { t } = useDashboardCopy();
  const { data: group, isLoading, isError, refetch } = useMyGroup();
  const { data: notices } = useGroupChangeNotices();
  const { data: today } = useToday();

  return (
    <>
      <OpeningQuestionsAlertCard />
      <ReadyForFinalAlertCard />

      {(notices ?? []).map((notice) => (
        <GroupChangeNoticeCard key={notice.id.toString()} notice={notice} />
      ))}

      {isLoading && (
        <LoadingState
          label={t("today.myGroup.loading")}
          ocid="today.myGroup.loading_state"
        />
      )}

      {isError && (
        <ErrorState
          message={t("today.myGroup.error")}
          onRetry={() => void refetch()}
          ocid="today.myGroup.error_state"
        />
      )}

      {!isLoading && !isError && group && (
        <>
          {mayCheckIn && (
            <CheckInBoard
              eventId={group.eventId}
              shift={group.shift}
              shiftLabel={group.shiftLabel}
            />
          )}
          <MyGroupSection group={group} role={role} />
        </>
      )}

      {!isLoading && !isError && !group && today?.nextEvent && (
        <NextEventCard event={today.nextEvent} />
      )}

      {!isLoading && !isError && !group && !today?.nextEvent && (
        <section
          data-ocid="today.placeholder"
          className="rounded-lg border border-dashed border-border bg-card p-8 text-center"
        >
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
            {t("today.noGroup.title")}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {t("today.noGroup.body")}
          </p>
        </section>
      )}
    </>
  );
}

/** Format a millisecond span as a compact "2h 15m" / "45m" countdown. */
function formatCountdown(ms: bigint): string {
  const totalMinutes = Math.max(0, Math.floor(Number(ms) / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * The next upcoming event with a live countdown, shown when no shift is
 * scheduled today. The countdown is derived from the backend's `startsInMs`
 * so it respects the demo "Pretend it's" date.
 */
function NextEventCard({ event }: { event: NextEventView }) {
  const { t } = useDashboardCopy();
  const startsInMs = event.startsInMs;
  const happeningNow = startsInMs <= 0n;

  return (
    <section
      data-ocid="today.nextEvent.card"
      className="rounded-lg border border-border bg-card p-6 shadow-subtle"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t("today.nextEvent.title")}
          </p>
          <h2
            data-ocid="today.nextEvent.name"
            className="mt-1 truncate font-display text-xl font-bold uppercase tracking-wide text-foreground"
          >
            {event.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("today.nextEvent.startsAt", {
              time: formatTimestamp(event.start),
            })}
          </p>
          <p
            data-ocid="today.nextEvent.countdown"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-display text-sm font-semibold uppercase tracking-wide text-primary"
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            {happeningNow
              ? t("today.nextEvent.now")
              : t("today.nextEvent.startsIn", {
                  time: formatCountdown(startsInMs),
                })}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * One shift's check-in summary row for managers: the shift label, the
 * "x / y checked in" count and a tappable link that opens that shift's
 * check-in board on the Groups page.
 */
function ShiftSummaryRow({
  summary,
  index,
}: {
  summary: ShiftCheckInSummary;
  index: number;
}) {
  const { t } = useDashboardCopy();
  const checkedIn = Number(summary.present) + Number(summary.late);
  const total = Number(summary.total);

  return (
    <li data-ocid={`today.shifts.item.${index}`}>
      <Link
        to="/groups"
        data-ocid={`today.shifts.item.${index}.link`}
        className="group flex min-h-[44px] items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-subtle transition-smooth hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold uppercase text-primary">
          {summary.shift === "am" ? "AM" : "PM"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold uppercase tracking-wide text-foreground">
            {summary.shiftLabel}
          </span>
          <span
            data-ocid={`today.shifts.item.${index}.count`}
            className="mt-0.5 block text-sm text-muted-foreground"
          >
            {t("today.shifts.checkedIn", { checkedIn, total })}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          {t("today.shifts.open")}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/**
 * One shift's read-only attendance summary for Leadership and Visiting
 * Managers: the shift label and the present, late and absent counts.
 */
function ShiftAttendanceRow({
  summary,
  index,
}: {
  summary: ShiftCheckInSummary;
  index: number;
}) {
  const { t } = useDashboardCopy();

  return (
    <li
      data-ocid={`today.shifts.item.${index}`}
      className="rounded-lg border border-border bg-card p-4 shadow-subtle"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
          {summary.shiftLabel}
        </span>
        <span
          data-ocid={`today.shifts.item.${index}.read_only`}
          className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {t("today.shifts.readOnly")}
        </span>
      </div>
      <p
        data-ocid={`today.shifts.item.${index}.summary`}
        className="mt-2 text-sm text-muted-foreground"
      >
        {t("today.shifts.summary", {
          present: Number(summary.present),
          late: Number(summary.late),
          absent: Number(summary.absent),
        })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("today.shifts.total", { total: Number(summary.total) })}
      </p>
    </li>
  );
}

/**
 * The check-in board for a manager who may record check-ins but does not train
 * a group: a shift picker over today's shifts and the shared CheckInBoard for
 * the chosen shift, so a Kitchen Manager or Service Manager can record who
 * showed up. Renders nothing when today has no shift to check in.
 */
function ManagerCheckInSection({
  summaries,
}: {
  summaries: ShiftCheckInSummary[];
}) {
  const { t } = useDashboardCopy();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (summaries.length === 0) return undefined;
    const found = summaries.find(
      (summary) =>
        `${summary.eventId.toString()}-${summary.shift}` === selectedKey,
    );
    return found ?? summaries[0];
  }, [summaries, selectedKey]);

  if (!selected) return null;

  return (
    <section className="space-y-4" data-ocid="today.managerCheckIn.section">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">
          {t("today.checkIn.managerTitle", { shift: selected.shiftLabel })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("today.checkIn.managerHint")}
        </p>
      </div>

      {summaries.length > 1 && (
        <div
          className="flex flex-wrap gap-2"
          data-ocid="today.managerCheckIn.shiftPicker"
        >
          {summaries.map((summary) => {
            const key = `${summary.eventId.toString()}-${summary.shift}`;
            const active =
              key === `${selected.eventId.toString()}-${selected.shift}`;
            return (
              <Button
                key={key}
                type="button"
                variant={active ? "default" : "outline"}
                className="touch-target"
                aria-pressed={active}
                data-ocid={`today.managerCheckIn.shift.${summary.shift}`}
                onClick={() => setSelectedKey(key)}
              >
                {summary.shiftLabel}
              </Button>
            );
          })}
        </div>
      )}

      <CheckInBoard
        eventId={selected.eventId}
        shift={selected.shift}
        shiftLabel={selected.shiftLabel}
      />
    </section>
  );
}

/**
 * The manager-facing Today content: the caller's own crew (when they own one)
 * first, then the absent alerts list, then today's shifts with an "x / y
 * checked in" count per shift, each tappable to open that shift's check-in
 * board on the Groups page. A manager who may record check-ins but does not
 * train a group (Kitchen Manager, Service Manager) also gets a check-in board
 * for today's shifts, so they can record who showed up.
 */
function ManagerToday({
  role,
  mayCheckIn,
}: {
  role: Role | undefined;
  mayCheckIn: boolean;
}) {
  const { t } = useDashboardCopy();
  const { data: today, isLoading, isError, refetch } = useToday();
  const summaries = today?.shiftSummaries ?? [];

  return (
    <>
      <OpeningQuestionsAlertCard />
      <NudgeAlertCard />
      <ReadyForFinalAlertCard />

      <MyCrewSection />

      {canRecordFinalSignOff(role) && <MyGroupTiles role={role} />}

      <AbsentAlertsList role={role} />

      {mayCheckIn && !isLoading && !isError && (
        <ManagerCheckInSection summaries={summaries} />
      )}

      <section className="space-y-4" data-ocid="today.shifts.section">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">
          {t("today.shifts.title")}
        </h2>

        {isLoading && (
          <LoadingState
            label={t("today.loading")}
            ocid="today.shifts.loading_state"
          />
        )}

        {isError && (
          <ErrorState
            message={t("today.error")}
            onRetry={() => void refetch()}
            ocid="today.shifts.error_state"
          />
        )}

        {!isLoading && !isError && summaries.length === 0 && (
          <EmptyState
            title={t("today.shifts.empty")}
            ocid="today.shifts.empty_state"
          />
        )}

        {!isLoading && !isError && summaries.length > 0 && (
          <ul className="space-y-3" data-ocid="today.shifts.list">
            {summaries.map((summary, index) => (
              <ShiftSummaryRow
                key={`${summary.eventId.toString()}-${summary.shift}`}
                summary={summary}
                index={index}
              />
            ))}
          </ul>
        )}
      </section>

      {!isLoading && !isError && today?.nextEvent && summaries.length === 0 && (
        <NextEventCard event={today.nextEvent} />
      )}
    </>
  );
}

/**
 * The read-only Today content for Leadership and Visiting Managers: today's
 * attendance summary per shift with present, late and absent counts, plus the
 * next upcoming event when no shift is scheduled today.
 */
function ReadOnlyToday() {
  const { t } = useDashboardCopy();
  const { data: today, isLoading, isError, refetch } = useToday();
  const summaries = today?.shiftSummaries ?? [];

  return (
    <>
      <OpeningQuestionsAlertCard />
      <ReadyForFinalAlertCard />

      <section className="space-y-4" data-ocid="today.shifts.section">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">
          {t("today.shifts.title")}
        </h2>

        {isLoading && (
          <LoadingState
            label={t("today.loading")}
            ocid="today.shifts.loading_state"
          />
        )}

        {isError && (
          <ErrorState
            message={t("today.error")}
            onRetry={() => void refetch()}
            ocid="today.shifts.error_state"
          />
        )}

        {!isLoading && !isError && summaries.length === 0 && (
          <EmptyState
            title={t("today.shifts.empty")}
            ocid="today.shifts.empty_state"
          />
        )}

        {!isLoading && !isError && summaries.length > 0 && (
          <ul className="space-y-3" data-ocid="today.shifts.list">
            {summaries.map((summary, index) => (
              <ShiftAttendanceRow
                key={`${summary.eventId.toString()}-${summary.shift}`}
                summary={summary}
                index={index}
              />
            ))}
          </ul>
        )}

        {!isLoading &&
          !isError &&
          today?.nextEvent &&
          summaries.length === 0 && <NextEventCard event={today.nextEvent} />}
      </section>
    </>
  );
}

/**
 * The Today page. A trainer sees the check-in board for their own group on the
 * current or next shift — one row per roadie with Present / Late / Absent — plus
 * their roadies' photos and names and any undismissed "Your group changed"
 * notices at the top. Admin, Store Manager and Training Manager see the absent
 * alerts list first, then today's shifts with an "x / y checked in" count per
 * shift. Leadership and Visiting Managers see a read-only attendance summary per
 * shift. When no shift is scheduled today, the next upcoming event and a
 * countdown are shown.
 */
export default function TodayPage() {
  const { t } = useDashboardCopy();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const isTrainer = role === Role.trainer;
  const mayCheckIn = canManageCheckIns(role);
  const maySeeManager = canSeeManagerToday(role);
  const readOnly = isTodayReadOnly(role);

  return (
    <div className="space-y-6" data-ocid="today.page">
      <PageHeader title={t("today.title")} subtitle={t("app.tagline")} />

      <PracticeRunCard />

      {isTrainer ? (
        <TrainerToday mayCheckIn={mayCheckIn} role={role} />
      ) : maySeeManager ? (
        <ManagerToday role={role} mayCheckIn={mayCheckIn} />
      ) : readOnly ? (
        <ReadOnlyToday />
      ) : (
        <section
          data-ocid="today.placeholder"
          className="rounded-lg border border-dashed border-border bg-card p-8 text-center"
        >
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
            {t("today.placeholder.title")}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {t("today.placeholder.body")}
          </p>
        </section>
      )}
    </div>
  );
}
