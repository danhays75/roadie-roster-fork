import { QuestionArea, QuestionTab } from "@/backend";
import type { FinishByView, QuestionFilter, QuestionView } from "@/backend";
import { formatDateOnly } from "@/lib/format";

/**
 * The Opening Questions area palette. Kitchen is orange, Service is teal, Both
 * is purple and Dan is navy — the store's own brand colours, kept as literal
 * OKLCH values so the pills read the same in light and dark themes.
 */
export const AREA_COLORS: Record<QuestionArea, string> = {
  [QuestionArea.kitchen]: "oklch(0.58 0.14 45)",
  [QuestionArea.service]: "oklch(0.55 0.09 205)",
  [QuestionArea.both]: "oklch(0.5 0.13 300)",
  [QuestionArea.dan]: "oklch(0.28 0.07 258.5)",
};

/** The copy key for an area's short label. */
export function areaLabelKey(area: QuestionArea): string {
  switch (area) {
    case QuestionArea.kitchen:
      return "oq.area.kitchen";
    case QuestionArea.service:
      return "oq.area.service";
    case QuestionArea.both:
      return "oq.area.both";
    case QuestionArea.dan:
      return "oq.area.dan";
    default:
      return "oq.area.dan";
  }
}

/** The copy key for a tab label. */
export function tabLabelKey(tab: QuestionTab): string {
  switch (tab) {
    case QuestionTab.all:
      return "oq.tab.all";
    case QuestionTab.myQuestions:
      return "oq.tab.myQuestions";
    case QuestionTab.needsMyApproval:
      return "oq.tab.needsMyApproval";
    case QuestionTab.decisionDue:
      return "oq.tab.decisionDue";
    case QuestionTab.final:
      return "oq.tab.final";
    case QuestionTab.readyForFinal:
      return "oq.tab.readyForFinal";
    default:
      return "oq.tab.all";
  }
}

/** The tabs in display order. */
export const QUESTION_TABS: QuestionTab[] = [
  QuestionTab.all,
  QuestionTab.myQuestions,
  QuestionTab.needsMyApproval,
  QuestionTab.decisionDue,
  QuestionTab.readyForFinal,
  QuestionTab.final,
];

/**
 * The tabs a viewer may see, in display order. Decision due is Admin only,
 * My questions and Needs my approval are for the area owners, and Ready for
 * final is offered only to the Managing Partner, who is the only role that may
 * mark a question final.
 */
export function visibleQuestionTabs(
  isAdmin: boolean,
  isOwner: boolean,
  canFinalize: boolean,
): QuestionTab[] {
  return QUESTION_TABS.filter((tab) => {
    if (tab === QuestionTab.decisionDue) return isAdmin;
    if (tab === QuestionTab.myQuestions) return isOwner;
    if (tab === QuestionTab.needsMyApproval) return isOwner;
    if (tab === QuestionTab.readyForFinal) return canFinalize;
    return true;
  });
}

/** The areas offered by the area filter, in display order. */
export const AREA_FILTERS: QuestionArea[] = [
  QuestionArea.kitchen,
  QuestionArea.service,
  QuestionArea.both,
  QuestionArea.dan,
];

/** A stable query key for a tab + filter pair. */
export function questionListKey(
  tab: QuestionTab,
  filter: QuestionFilter,
): (string | undefined)[] {
  return [
    "openingQuestions",
    tab,
    filter.area,
    filter.sectionTitle,
    filter.search,
  ];
}

/** Whether a question's 48-hour suggestion discussion window is still open. */
export function isDiscussionOpen(
  discussionEndsAt: bigint,
  now = Date.now(),
): boolean {
  return Number(discussionEndsAt / 1_000_000n) > now;
}

/** A short "3h left" / "2d left" label for a discussion window. */
export function discussionTimeLeft(
  discussionEndsAt: bigint,
  now = Date.now(),
): string {
  const ms = Number(discussionEndsAt / 1_000_000n) - now;
  if (ms <= 0) return "0h";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  return `${Math.max(1, hours)}h`;
}

/**
 * The Finish-by banner text: "Finish by <date> · N days left" while the date is
 * ahead, "<N> days overdue" once it has passed, and null when no date is set.
 * The day counts come from the backend (computed against the store clock), so
 * the banner never drifts from the server's notion of today. `t` is the page's
 * copy lookup, so the caller keeps its own locale.
 */
export function finishByBannerText(
  view: FinishByView | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!view || view.finishBy === undefined) return null;
  const date = formatDateOnly(view.finishBy);
  if (view.daysOverdue > 0n) {
    const days = Number(view.daysOverdue);
    return days === 1
      ? t("oq.finishBy.overdueOne")
      : t("oq.finishBy.overdue", { days });
  }
  const days = Number(view.daysLeft);
  return days === 1
    ? t("oq.finishBy.bannerOne", { date })
    : t("oq.finishBy.banner", { date, days });
}

/**
 * The next question still needing the caller's approval, in imported order.
 * `questions` is the caller's own pending list (already filtered to questions
 * they own and have not approved); `afterId` is the question just approved, so
 * the Next button advances past it. Returns null when nothing remains, which
 * the page renders as "All caught up".
 */
export function nextPendingQuestion(
  questions: QuestionView[],
  afterId?: bigint,
): QuestionView | null {
  const ordered = [...questions].sort((a, b) =>
    a.question.order < b.question.order
      ? -1
      : a.question.order > b.question.order
        ? 1
        : 0,
  );
  if (afterId === undefined) return ordered[0] ?? null;
  const afterIndex = ordered.findIndex((q) => q.question.id === afterId);
  if (afterIndex === -1) return ordered[0] ?? null;
  return ordered[afterIndex + 1] ?? null;
}
