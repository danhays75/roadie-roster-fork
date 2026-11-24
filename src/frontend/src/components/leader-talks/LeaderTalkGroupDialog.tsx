import type { DateOnly, LeaderTalkView, Roadie, RoadieId } from "@/backend";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/useI18n";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

/** A selectable day option: a training day first, then any other schedule day. */
export interface DayOption {
  day: DateOnly;
  label: string;
  isTraining: boolean;
}

/** The roadie's display name, preferring the preferred name. */
export function roadieDisplayName(roadie: Roadie): string {
  return roadie.profile.preferredName || roadie.profile.name;
}

/**
 * The group editor: create a new leader talk or edit an existing one. The
 * manager picks the day (training days first), names the group, and chooses
 * roadies from the active roster. Roadies already in another group are shown
 * but disabled so a roadie never lands in two groups. A "Fill from not yet met"
 * action tops the group up to the store's leader talk size by adding active
 * roadies who are in no group at all, sorted by name. It only changes this
 * dialog's selection and never saves the group by itself, so it behaves the
 * same in New group and Edit group.
 */
export function LeaderTalkGroupDialog({
  open,
  onOpenChange,
  talk,
  dayOptions,
  activeRoadies,
  assignedElsewhere,
  notYetMet,
  maxSize,
  defaultName,
  isSaving,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The talk being edited, or null when creating a new group. */
  talk: LeaderTalkView | null;
  dayOptions: DayOption[];
  activeRoadies: Roadie[];
  /** Roadie ids already in a different group, keyed by id string. */
  assignedElsewhere: Set<string>;
  /** Active roadies in no group at all, already sorted by display name. */
  notYetMet: Roadie[];
  maxSize: number;
  /** The default name shown when the name field is left blank. */
  defaultName: string;
  isSaving: boolean;
  error: string | null;
  onSave: (args: {
    day: DateOnly;
    name: string;
    attendees: RoadieId[];
  }) => void;
}) {
  const { t } = useI18n();
  const editing = talk !== null;

  const [day, setDay] = useState<DateOnly | null>(talk?.day ?? null);
  const [name, setName] = useState(talk?.name ?? "");
  const [selected, setSelected] = useState<RoadieId[]>(
    talk ? talk.attendees.map((a) => a.roadieId) : [],
  );
  const [query, setQuery] = useState("");
  const [fillMessage, setFillMessage] = useState<string | null>(null);

  const selectedSet = useMemo(
    () => new Set(selected.map((id) => id.toString())),
    [selected],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? activeRoadies.filter((r) =>
          roadieDisplayName(r).toLowerCase().includes(q),
        )
      : activeRoadies;
    return [...list].sort((a, b) =>
      roadieDisplayName(a).localeCompare(roadieDisplayName(b)),
    );
  }, [activeRoadies, query]);

  const atMax = selected.length >= maxSize;
  const canFill = selected.length < maxSize;

  function toggle(id: RoadieId) {
    const key = id.toString();
    setFillMessage(null);
    setSelected((current) => {
      if (current.some((existing) => existing.toString() === key)) {
        return current.filter((existing) => existing.toString() !== key);
      }
      if (current.length >= maxSize) return current;
      return [...current, id];
    });
  }

  // Fill only changes this dialog's selection: it adds active roadies who are
  // in no group at all (not in another group and not already selected), sorted
  // by name, until the group reaches the store's leader talk size. It never
  // saves, so New group and Edit group behave identically.
  function handleFill() {
    const currentSet = new Set(selected.map((id) => id.toString()));
    const additions: RoadieId[] = [];
    for (const roadie of notYetMet) {
      if (selected.length + additions.length >= maxSize) break;
      const key = roadie.id.toString();
      if (currentSet.has(key) || assignedElsewhere.has(key)) continue;
      additions.push(roadie.id);
    }
    if (additions.length === 0) {
      setFillMessage(t("leaderTalks.fillNone"));
      return;
    }
    setFillMessage(null);
    setSelected((current) => [...current, ...additions]);
  }

  function handleSave() {
    if (day === null) return;
    onSave({ day, name: name.trim(), attendees: selected });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-ocid="leaderTalks.group.dialog"
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-wide">
            {editing ? t("leaderTalks.edit") : t("leaderTalks.newGroup")}
          </DialogTitle>
          <DialogDescription>{t("leaderTalks.selectHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="leader-talk-day">{t("leaderTalks.day")}</Label>
              <select
                id="leader-talk-day"
                data-ocid="leaderTalks.group.day_select"
                value={day === null ? "" : day.toString()}
                onChange={(event) => {
                  const value = event.target.value;
                  setDay(value === "" ? null : BigInt(value));
                }}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
              >
                <option value="">{t("leaderTalks.dayPlaceholder")}</option>
                {dayOptions.map((option) => (
                  <option
                    key={option.day.toString()}
                    value={option.day.toString()}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leader-talk-name">{t("leaderTalks.name")}</Label>
              <Input
                id="leader-talk-name"
                data-ocid="leaderTalks.group.name_input"
                value={name}
                maxLength={80}
                placeholder={defaultName || t("leaderTalks.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              data-ocid="leaderTalks.group.attendee_count"
              className={cn(
                "text-sm font-medium",
                atMax ? "text-primary" : "text-muted-foreground",
              )}
            >
              {t("leaderTalks.attendeeCount", {
                count: selected.length,
                max: maxSize,
              })}
            </p>
            <Button
              type="button"
              variant="outline"
              data-ocid="leaderTalks.group.fill_button"
              onClick={handleFill}
              disabled={!canFill || isSaving}
              className="touch-target"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("leaderTalks.fillFromNotYetMet")}
            </Button>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              data-ocid="leaderTalks.group.search_input"
              value={query}
              placeholder={t("leaderTalks.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 pl-9"
              aria-label={t("leaderTalks.searchPlaceholder")}
            />
          </div>

          {filtered.length === 0 ? (
            <p
              data-ocid="leaderTalks.group.no_matches"
              className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground"
            >
              {activeRoadies.length === 0
                ? t("leaderTalks.noActiveRoadies")
                : t("leaderTalks.noMatches")}
            </p>
          ) : (
            <ul
              data-ocid="leaderTalks.group.roadie_list"
              className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
            >
              {filtered.map((roadie, index) => {
                const key = roadie.id.toString();
                const isSelected = selectedSet.has(key);
                const elsewhere = !isSelected && assignedElsewhere.has(key);
                const disabled = elsewhere || (!isSelected && atMax);
                const name = roadieDisplayName(roadie);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      data-ocid={`leaderTalks.group.roadie.${index + 1}`}
                      onClick={() => toggle(roadie.id)}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-accent",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <RoadiePhoto
                        id={roadie.id}
                        name={name}
                        demoPhotoUrl={roadie.demoPhotoUrl}
                        className="h-10 w-10 shrink-0"
                        iconClassName="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {name}
                        </span>
                        {elsewhere && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t("leaderTalks.inOtherGroup")}
                          </span>
                        )}
                      </span>
                      {isSelected ? (
                        <Check
                          className="h-5 w-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : (
                        <X
                          className="h-4 w-4 shrink-0 text-muted-foreground/40"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {fillMessage && (
            <p
              data-ocid="leaderTalks.group.fill_message"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              {fillMessage}
            </p>
          )}

          {error && (
            <p
              data-ocid="leaderTalks.group.error_state"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-ocid="leaderTalks.group.cancel_button"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="touch-target"
          >
            {t("leaderTalks.cancel")}
          </Button>
          <Button
            type="button"
            data-ocid="leaderTalks.group.save_button"
            onClick={handleSave}
            disabled={isSaving || day === null}
            className="touch-target"
          >
            {isSaving
              ? editing
                ? t("leaderTalks.saving")
                : t("leaderTalks.creating")
              : editing
                ? t("leaderTalks.save")
                : t("leaderTalks.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A short label for a day option, e.g. "Training day · Mar 14". */
export function dayOptionLabel(
  day: DateOnly,
  isTraining: boolean,
  t: (key: string) => string,
): string {
  const date = formatDateOnly(day);
  return isTraining
    ? `${t("leaderTalks.trainingDay")} · ${date}`
    : `${t("leaderTalks.otherDay")} · ${date}`;
}
