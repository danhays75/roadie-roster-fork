import type { DateOnly, LeaderTalkView, Roadie, RoadieId } from "@/backend";
import { RoadieStatus, RosterState } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import {
  type DayOption,
  LeaderTalkGroupDialog,
  dayOptionLabel,
  roadieDisplayName,
} from "@/components/leader-talks/LeaderTalkGroupDialog";
import { RoadiePhoto } from "@/components/roadie/RoadiePhoto";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canEditLeaderTalks,
  canLeaderTalks,
  useAccessState,
  useDemoAwareStoreInfo,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useCreateLeaderTalk,
  useDeleteLeaderTalk,
  useDemoState,
  useLeaderTalks,
  useRoadies,
  useSchedule,
  useSetLeaderTalkAttendance,
} from "@/hooks/useQueries";
import {
  dateToDateOnly,
  formatDateOnly,
  pretendDateToInstant,
} from "@/lib/format";
import {
  CalendarDays,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

/** The store-local "today" as a DateOnly, honoring the demo pretend date. */
function useTodayDay(): DateOnly {
  const { data: demo } = useDemoState();
  const { data: store } = useDemoAwareStoreInfo();
  return useMemo(() => {
    const pretendDate = demo?.enabled ? demo.pretendDate : undefined;
    const instant = pretendDate
      ? pretendDateToInstant(pretendDate, {
          timeZone: store?.timeZone,
          amShiftStart: store?.amShiftStart,
          pmShiftStart: store?.pmShiftStart,
        })
      : null;
    const now = instant ?? new Date();
    return dateToDateOnly(now);
  }, [
    demo?.enabled,
    demo?.pretendDate,
    store?.amShiftStart,
    store?.pmShiftStart,
    store?.timeZone,
  ]);
}

/** A roadie is active when they are not archived and their roster state is active. */
function isActiveRoadie(roadie: Roadie): boolean {
  return (
    roadie.status !== RoadieStatus.archived &&
    roadie.rosterState === RosterState.active
  );
}

export default function LeaderTalksPage() {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const canRead = canLeaderTalks(role);
  const canEdit = canEditLeaderTalks(role);

  const { data: store } = useDemoAwareStoreInfo();
  const { data: talks, isLoading, isError, refetch } = useLeaderTalks(canRead);
  const { data: roadies } = useRoadies();
  const { data: schedule } = useSchedule();
  const todayDay = useTodayDay();

  const createTalk = useCreateLeaderTalk();
  const setAttendance = useSetLeaderTalkAttendance();
  const deleteTalk = useDeleteLeaderTalk();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTalk, setEditingTalk] = useState<LeaderTalkView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaderTalkView | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const leaderTalkName =
    store?.leaderTalkName?.trim() || t("leaderTalks.title");
  const maxSize = Number(store?.leaderTalkSize ?? 0n) || 6;

  const activeRoadies = useMemo(
    () => (roadies ?? []).filter(isActiveRoadie),
    [roadies],
  );

  const roadieById = useMemo(() => {
    const map = new Map<string, Roadie>();
    for (const roadie of roadies ?? []) map.set(roadie.id.toString(), roadie);
    return map;
  }, [roadies]);

  // Every roadie id that already sits in some group, so the editor can disable
  // them and the "not yet met" list can exclude them.
  const assignedIds = useMemo(() => {
    const set = new Set<string>();
    for (const talk of talks ?? []) {
      for (const attendee of talk.attendees)
        set.add(attendee.roadieId.toString());
    }
    return set;
  }, [talks]);

  // Active roadies in no group whose day is today or earlier: the "not yet met"
  // list. A roadie counts as met once they are in any group dated today or
  // before.
  const notYetMet = useMemo(() => {
    const metIds = new Set<string>();
    for (const talk of talks ?? []) {
      if (talk.day <= todayDay) {
        for (const attendee of talk.attendees) {
          metIds.add(attendee.roadieId.toString());
        }
      }
    }
    return activeRoadies
      .filter((roadie) => !metIds.has(roadie.id.toString()))
      .sort((a, b) => roadieDisplayName(a).localeCompare(roadieDisplayName(b)));
  }, [talks, activeRoadies, todayDay]);

  // Day options: the schedule's training days first, then any other schedule
  // day, de-duplicated and sorted by date within each group.
  const dayOptions = useMemo<DayOption[]>(() => {
    const seen = new Map<string, { day: DateOnly; isTraining: boolean }>();
    for (const event of schedule ?? []) {
      const day = dateToDateOnly(new Date(Number(event.start / 1_000_000n)));
      const key = day.toString();
      const isTraining = event.kind === "trainingDay";
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { day, isTraining });
      } else if (isTraining) {
        existing.isTraining = true;
      }
    }
    const options = [...seen.values()].sort((a, b) => {
      if (a.isTraining !== b.isTraining) return a.isTraining ? -1 : 1;
      return a.day < b.day ? -1 : a.day > b.day ? 1 : 0;
    });
    return options.map((option) => ({
      day: option.day,
      isTraining: option.isTraining,
      label: dayOptionLabel(option.day, option.isTraining, t),
    }));
  }, [schedule, t]);

  // Group the talks by day, ascending, each day's talks in id order.
  const grouped = useMemo(() => {
    const byDay = new Map<string, { day: DateOnly; talks: LeaderTalkView[] }>();
    for (const talk of talks ?? []) {
      const key = talk.day.toString();
      const entry = byDay.get(key);
      if (entry) entry.talks.push(talk);
      else byDay.set(key, { day: talk.day, talks: [talk] });
    }
    return [...byDay.values()]
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
      .map((entry) => ({
        ...entry,
        talks: [...entry.talks].sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        ),
      }));
  }, [talks]);

  function openCreate() {
    setEditingTalk(null);
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(talk: LeaderTalkView) {
    setEditingTalk(talk);
    setEditorError(null);
    setEditorOpen(true);
  }

  function handleSave(args: {
    day: DateOnly;
    name: string;
    attendees: RoadieId[];
  }) {
    setEditorError(null);
    if (editingTalk) {
      setAttendance.mutate(
        { id: editingTalk.id, name: args.name, attendees: args.attendees },
        {
          onSuccess: () => setEditorOpen(false),
          onError: () => setEditorError(t("leaderTalks.saveError")),
        },
      );
    } else {
      createTalk.mutate(
        {
          id: 0n,
          day: args.day,
          name: args.name,
          isDemo: false,
          attendees: args.attendees,
        },
        {
          onSuccess: () => setEditorOpen(false),
          onError: () => setEditorError(t("leaderTalks.createError")),
        },
      );
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTalk.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  if (!canRead) {
    return (
      <div data-ocid="leaderTalks.page" className="space-y-6">
        <PageHeader title={leaderTalkName} />
        <EmptyState
          title={t("leaderTalks.empty")}
          message={t("leaderTalks.emptyHint")}
          ocid="leaderTalks.empty_state"
        />
      </div>
    );
  }

  return (
    <div data-ocid="leaderTalks.page" className="space-y-6">
      <PageHeader
        title={leaderTalkName}
        subtitle={t("leaderTalks.subtitle")}
        action={
          canEdit ? (
            <Button
              type="button"
              data-ocid="leaderTalks.new_group_button"
              onClick={openCreate}
              className="touch-target"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("leaderTalks.newGroup")}
            </Button>
          ) : undefined
        }
      />

      {/* Not yet met */}
      <section
        data-ocid="leaderTalks.not_yet_met.section"
        className="rounded-lg border border-border bg-card p-4 shadow-subtle sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide text-foreground">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("leaderTalks.notYetMet")}
          </h2>
          <span
            data-ocid="leaderTalks.not_yet_met.count"
            className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          >
            {t("leaderTalks.notYetMetCount", { count: notYetMet.length })}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("leaderTalks.notYetMetHint")}
        </p>
        {notYetMet.length === 0 ? (
          <p
            data-ocid="leaderTalks.not_yet_met.empty_state"
            className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-4 py-4 text-center text-sm text-muted-foreground"
          >
            {t("leaderTalks.notYetMetEmpty")}
          </p>
        ) : (
          <ul
            data-ocid="leaderTalks.not_yet_met.list"
            className="mt-3 flex flex-wrap gap-2"
          >
            {notYetMet.map((roadie, index) => {
              const name = roadieDisplayName(roadie);
              return (
                <li
                  key={roadie.id.toString()}
                  data-ocid={`leaderTalks.not_yet_met.item.${index + 1}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-3 pl-1"
                >
                  <RoadiePhoto
                    id={roadie.id}
                    name={name}
                    demoPhotoUrl={roadie.demoPhotoUrl}
                    className="h-8 w-8"
                    iconClassName="h-3.5 w-3.5"
                  />
                  <span className="max-w-40 truncate text-sm font-medium text-foreground">
                    {name}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Talks grouped by day */}
      {isLoading ? (
        <LoadingState
          label={t("leaderTalks.loading")}
          ocid="leaderTalks.loading_state"
        />
      ) : isError ? (
        <ErrorState
          message={t("leaderTalks.error")}
          onRetry={() => void refetch()}
          ocid="leaderTalks.error_state"
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          title={t("leaderTalks.empty")}
          message={t("leaderTalks.emptyHint")}
          ocid="leaderTalks.empty_state"
          action={
            canEdit ? (
              <Button
                type="button"
                data-ocid="leaderTalks.empty_state.new_group_button"
                onClick={openCreate}
                className="touch-target"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("leaderTalks.newGroup")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group, dayIndex) => (
            <section
              key={group.day.toString()}
              data-ocid={`leaderTalks.day.${dayIndex + 1}`}
              className="space-y-3"
            >
              <h2 className="flex items-center gap-2 font-display text-base font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatDateOnly(group.day)}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.talks.map((talk, talkIndex) => (
                  <article
                    key={talk.id.toString()}
                    data-ocid={`leaderTalks.group.${dayIndex + 1}.${talkIndex + 1}`}
                    className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-subtle"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-lg font-semibold text-foreground">
                          {talk.name}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("leaderTalks.attendeeCountShort", {
                            count: talk.attendees.length,
                            max: maxSize,
                          })}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-ocid={`leaderTalks.group.edit_button.${dayIndex + 1}.${talkIndex + 1}`}
                            onClick={() => openEdit(talk)}
                            aria-label={t("leaderTalks.edit")}
                            className="touch-target"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-ocid={`leaderTalks.group.delete_button.${dayIndex + 1}.${talkIndex + 1}`}
                            onClick={() => setDeleteTarget(talk)}
                            aria-label={t("leaderTalks.delete")}
                            className="touch-target text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {talk.attendees.length === 0 ? (
                      <p className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-sm text-muted-foreground">
                        {t("leaderTalks.noAttendees")}
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {talk.attendees.map((attendee, attendeeIndex) => {
                          const roadie = roadieById.get(
                            attendee.roadieId.toString(),
                          );
                          return (
                            <li
                              key={attendee.roadieId.toString()}
                              data-ocid={`leaderTalks.group.${dayIndex + 1}.${talkIndex + 1}.attendee.${attendeeIndex + 1}`}
                              className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-3 pl-1"
                            >
                              <RoadiePhoto
                                id={attendee.roadieId}
                                name={attendee.displayName}
                                demoPhotoUrl={roadie?.demoPhotoUrl}
                                className="h-8 w-8"
                                iconClassName="h-3.5 w-3.5"
                              />
                              <span className="max-w-36 truncate text-sm font-medium text-foreground">
                                {attendee.displayName}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <LeaderTalkGroupDialog
          key={editingTalk ? editingTalk.id.toString() : "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          talk={editingTalk}
          dayOptions={dayOptions}
          activeRoadies={activeRoadies}
          assignedElsewhere={assignedIds}
          notYetMet={notYetMet}
          maxSize={maxSize}
          defaultName={leaderTalkName}
          isSaving={createTalk.isPending || setAttendance.isPending}
          error={editorError}
          onSave={handleSave}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent
          data-ocid="leaderTalks.delete.dialog"
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">
              {t("leaderTalks.deleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("leaderTalks.deleteConfirm")} {t("leaderTalks.deleteBody")}
            </DialogDescription>
          </DialogHeader>
          {deleteTalk.isError && (
            <p
              data-ocid="leaderTalks.delete.error_state"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {t("leaderTalks.deleteError")}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-ocid="leaderTalks.delete.cancel_button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteTalk.isPending}
              className="touch-target"
            >
              {t("leaderTalks.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-ocid="leaderTalks.delete.confirm_button"
              onClick={handleDelete}
              disabled={deleteTalk.isPending}
              className="touch-target"
            >
              {deleteTalk.isPending
                ? t("leaderTalks.deleting")
                : t("leaderTalks.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
