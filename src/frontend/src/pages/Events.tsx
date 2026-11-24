import type { CrewEventSummary, CrewId } from "@/backend";
import { Role } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { EventCrewList } from "@/components/events/EventCrewList";
import { EventFormDialog } from "@/components/events/EventFormDialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canEditEvents,
  canEvents,
  useAccessState,
  useDemoAwareStoreInfo,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useCrewEvents,
  useCrews,
  useDemoState,
  useEventCrew,
  useMyCrew,
  useSetCrewEventCancelled,
} from "@/hooks/useQueries";
import {
  formatTimestampMediumDate,
  pretendDateToInstant,
  timestampToDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ChevronDown,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

/** The store-local time of an event, e.g. "6:30 PM". */
function formatEventTime(start: bigint, timeZone?: string): string {
  const date = timestampToDate(start);
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** The store-local calendar day of an event, as a comparable number. */
function eventDayNumber(start: bigint, timeZone?: string): number {
  const date = timestampToDate(start);
  if (!date) return 0;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Number(parts.replaceAll("-", ""));
}

/** The store-local "today" as a comparable day number, honoring the pretend date. */
function useTodayNumber(): number {
  const { data: store } = useDemoAwareStoreInfo();
  const { data: demoState } = useDemoState();
  const demoEnabled = demoState?.enabled ?? false;
  const pretendDate = demoState?.pretendDate ?? null;
  return useMemo(() => {
    // The backend classifies events by `Clock.effectiveNow`, which is the demo
    // "Pretend it's" instant while demo mode is on. Resolve that same instant
    // here so an upcoming event is never filed under Past against the real
    // clock, then read its store-local calendar day.
    const pretendInstant =
      demoEnabled && pretendDate && store
        ? pretendDateToInstant(
            pretendDate,
            store.timeZone,
            store.amShiftStart,
            store.pmShiftStart,
          )
        : null;
    const now = pretendInstant ?? new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: store?.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return Number(parts.replaceAll("-", ""));
  }, [store, demoEnabled, pretendDate]);
}

/** One event card in the list, with its counts and editor actions. */
function EventCard({
  event,
  timeZone,
  isPast,
  canEdit,
  isOpen,
  onToggle,
  onEdit,
  onCancel,
}: {
  event: CrewEventSummary;
  timeZone?: string;
  isPast: boolean;
  canEdit: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const dateLabel = formatTimestampMediumDate(event.start, timeZone);
  const timeLabel = formatEventTime(event.start, timeZone);

  return (
    <li
      data-ocid="events.card"
      className={cn(
        "rounded-lg border bg-card shadow-sm transition-colors",
        event.cancelled ? "border-destructive/40" : "border-border",
      )}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          data-ocid="events.open_button"
          aria-expanded={isOpen}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-display text-lg font-semibold uppercase tracking-wide text-foreground">
                {event.name}
              </span>
              {event.cancelled && (
                <span
                  data-ocid="events.cancelled_badge"
                  className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive"
                >
                  {t("events.cancelled")}
                </span>
              )}
              {isPast && !event.cancelled && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("events.pastLabel")}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                {dateLabel} · {timeLabel}
              </span>
              {event.place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {event.place}
                </span>
              )}
            </span>
            <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                {t("events.going", { count: Number(event.goingCount) })}
              </span>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                {t("events.cantGo", { count: Number(event.cantGoCount) })}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {t("events.noAnswer", { count: Number(event.noAnswerCount) })}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="touch-target"
              data-ocid="events.edit_button"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t("events.edit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={event.cancelled ? "outline" : "destructive"}
              className="touch-target"
              data-ocid="events.cancel_button"
              onClick={onCancel}
            >
              {event.cancelled ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden="true" />
              )}
              {event.cancelled ? t("events.uncancel") : t("events.cancel")}
            </Button>
          </div>
        )}
      </div>

      {isOpen && <EventCrewPanel event={event} />}
    </li>
  );
}

/** The crew picker plus the crew list for one open event. */
function EventCrewPanel({ event }: { event: CrewEventSummary }) {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const canPickCrew = canEditEvents(role) || role === Role.storeManager;

  const { data: myCrew } = useMyCrew();
  const { data: crews } = useCrews();
  const [selectedCrew, setSelectedCrew] = useState<CrewId | null>(null);

  const crewId = canPickCrew ? selectedCrew : null;
  const {
    data: crewView,
    isLoading,
    isError,
    refetch,
  } = useEventCrew(event.id, crewId, canEvents(role));

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          {t("events.crew")}
          {crewView?.crewName ? ` · ${crewView.crewName}` : ""}
        </h3>
        {canPickCrew && (
          <div className="flex items-center gap-2">
            <label
              htmlFor={`crew-picker-${event.id}`}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t("events.crewPicker")}
            </label>
            <Select
              value={selectedCrew === null ? "mine" : selectedCrew.toString()}
              onValueChange={(value) =>
                setSelectedCrew(value === "mine" ? null : BigInt(value))
              }
            >
              <SelectTrigger
                id={`crew-picker-${event.id}`}
                data-ocid="events.crew_picker"
                className="touch-target w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">
                  {myCrew?.crewName ?? t("events.crew")}
                </SelectItem>
                {(crews ?? []).map((crew) => (
                  <SelectItem
                    key={crew.id.toString()}
                    value={crew.id.toString()}
                  >
                    {crew.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingState
          label={t("events.crewLoading")}
          ocid="events.crew.loading_state"
        />
      ) : isError ? (
        <ErrorState
          message={t("events.crewError")}
          onRetry={() => void refetch()}
          ocid="events.crew.error_state"
        />
      ) : (
        <EventCrewList event={event} rows={crewView?.roadies ?? []} />
      )}
    </div>
  );
}

export default function EventsPage() {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const canRead = canEvents(role);
  const canEdit = canEditEvents(role);

  const { data: store } = useDemoAwareStoreInfo();
  const { data: events, isLoading, isError, refetch } = useCrewEvents(canRead);
  const setCancelled = useSetCrewEventCancelled();
  const todayNumber = useTodayNumber();

  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CrewEventSummary | null>(
    null,
  );
  const [cancelTarget, setCancelTarget] = useState<CrewEventSummary | null>(
    null,
  );
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...(events ?? [])].sort((a, b) =>
      a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
    );
    const upcomingList: CrewEventSummary[] = [];
    const pastList: CrewEventSummary[] = [];
    for (const event of sorted) {
      if (eventDayNumber(event.start, store?.timeZone) >= todayNumber) {
        upcomingList.push(event);
      } else {
        pastList.push(event);
      }
    }
    // Past events read newest first.
    pastList.reverse();
    return { upcoming: upcomingList, past: pastList };
  }, [events, store?.timeZone, todayNumber]);

  function openNew() {
    setEditingEvent(null);
    setFormOpen(true);
  }

  function openEdit(event: CrewEventSummary) {
    setEditingEvent(event);
    setFormOpen(true);
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    setCancelError(null);
    setCancelled.mutate(
      { eventId: cancelTarget.id, cancelled: !cancelTarget.cancelled },
      {
        onSuccess: () => setCancelTarget(null),
        onError: () =>
          setCancelError(
            cancelTarget.cancelled
              ? t("events.uncancelError")
              : t("events.cancelError"),
          ),
      },
    );
  }

  const renderList = (list: CrewEventSummary[], isPast: boolean) => (
    <ul data-ocid="events.list" className="space-y-3">
      {list.map((event) => (
        <EventCard
          key={event.id.toString()}
          event={event}
          timeZone={store?.timeZone}
          isPast={isPast}
          canEdit={canEdit}
          isOpen={openId === event.id.toString()}
          onToggle={() =>
            setOpenId((current) =>
              current === event.id.toString() ? null : event.id.toString(),
            )
          }
          onEdit={() => openEdit(event)}
          onCancel={() => {
            setCancelError(null);
            setCancelTarget(event);
          }}
        />
      ))}
    </ul>
  );

  return (
    <section data-ocid="events.page" className="space-y-6">
      <PageHeader
        title={t("events.title")}
        subtitle={t("events.subtitle")}
        action={
          canEdit ? (
            <Button
              type="button"
              className="touch-target"
              data-ocid="events.new_button"
              onClick={openNew}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("events.new")}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState label={t("events.loading")} ocid="events.loading_state" />
      ) : isError ? (
        <ErrorState
          message={t("events.error")}
          onRetry={() => void refetch()}
          ocid="events.error_state"
        />
      ) : (events ?? []).length === 0 ? (
        <EmptyState
          title={t("events.empty")}
          message={t("events.emptyHint")}
          ocid="events.empty_state"
        />
      ) : (
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-foreground">
              {t("events.upcoming")}
            </h2>
            {upcoming.length > 0 ? (
              renderList(upcoming, false)
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("events.emptyHint")}
              </p>
            )}
          </div>
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-muted-foreground">
                {t("events.past")}
              </h2>
              {renderList(past, true)}
            </div>
          )}
        </div>
      )}

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editingEvent}
      />

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <DialogContent data-ocid="events.cancel_dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">
              {cancelTarget?.cancelled
                ? t("events.uncancel")
                : t("events.cancelConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("events.cancelConfirmBody")}
            </DialogDescription>
          </DialogHeader>
          {cancelError && (
            <p
              data-ocid="events.cancel_error_state"
              className="text-sm font-medium text-destructive"
            >
              {cancelError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="touch-target"
              data-ocid="events.cancel_keep_button"
              onClick={() => setCancelTarget(null)}
            >
              {t("events.cancelKeep")}
            </Button>
            <Button
              type="button"
              variant={cancelTarget?.cancelled ? "default" : "destructive"}
              className="touch-target"
              data-ocid="events.cancel_confirm_button"
              disabled={setCancelled.isPending}
              onClick={confirmCancel}
            >
              {cancelTarget?.cancelled
                ? t("events.uncancel")
                : t("events.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
