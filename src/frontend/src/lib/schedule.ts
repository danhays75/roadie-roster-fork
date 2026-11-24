import { EventKind, type ScheduleEvent } from "@/backend";
import { dateToDateOnly, timestampToDate } from "@/lib/format";

/**
 * The schedule's "Paperwork due" deadline event, the single source of the
 * paperwork due date. Matches the `#deadline` event named "Paperwork due";
 * returns undefined when the schedule carries no such event, so the paperwork
 * window stays closed rather than reading a different deadline.
 */
export function paperworkDueEvent(
  events: ScheduleEvent[],
): ScheduleEvent | undefined {
  let named: ScheduleEvent | undefined;
  for (const event of events) {
    if (event.kind !== EventKind.deadline) continue;
    if (event.name !== "Paperwork due") continue;
    if (!named || event.start < named.start) named = event;
  }
  return named;
}

/**
 * The schedule's "Final trainer sign-off" event, the single source of the
 * sign-off date. Matches the `#signOff` event; returns undefined when the
 * schedule carries no such event, so the sign-off window stays closed rather
 * than reading a different date.
 */
export function finalSignOffEvent(
  events: ScheduleEvent[],
): ScheduleEvent | undefined {
  let named: ScheduleEvent | undefined;
  for (const event of events) {
    if (event.kind !== EventKind.signOff) continue;
    if (!named || event.start < named.start) named = event;
  }
  return named;
}

/**
 * Whether the final sign-off day has arrived at `now`, compared by store-local
 * calendar date like the other schedule helpers: the sign-off event's own
 * calendar day counts as arrived. Returns false when the schedule carries no
 * sign-off event, so the sign-off action stays closed.
 */
export function hasReachedFinalSignOff(
  events: ScheduleEvent[],
  now: Date,
): boolean {
  const event = finalSignOffEvent(events);
  if (!event) return false;
  const eventDate = timestampToDate(event.start);
  if (!eventDate) return false;
  return dateToDateOnly(now) >= dateToDateOnly(eventDate);
}
