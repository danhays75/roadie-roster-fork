import type {
  ManagerScoreRow,
  QuestionArea,
  QuestionFilter,
  QuestionId,
  QuestionView,
  SuggestionId,
} from "@/backend";
import { QuestionTab } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import {
  ActiveOwnerFilter,
  ApprovalChips,
  AreaPill,
  DiscussionBlock,
  FinalBadge,
  ManagersScoreboard,
  PrintSheet,
  QuestionHistoryDialog,
} from "@/components/opening-questions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  canFinalizeOpeningQuestions,
  canOpeningQuestions,
  isAdminRole,
  isOpeningQuestionsOwner,
  useAccessState,
} from "@/hooks/useAccess";
import { useDemo } from "@/hooks/useDemo";
import { useI18n } from "@/hooks/useI18n";
import {
  useAccessGrants,
  useApproveOpeningQuestion,
  useChangeLog,
  useDecideOpeningQuestionSuggestion,
  useLeaders,
  useMarkOpeningQuestionFinal,
  useMarkOpeningQuestionsFinal,
  useMyPendingOpeningQuestionApprovals,
  useOpeningQuestionFinishBy,
  useOpeningQuestionManagerScoreboard,
  useOpeningQuestions,
  useOpeningQuestionsProgress,
  usePostOpeningQuestionComment,
  usePostOpeningQuestionSuggestion,
  useReopenOpeningQuestion,
  useReplyToOpeningQuestionSuggestion,
  useSaveOpeningQuestionAnswer,
  useSendOpeningQuestionNudge,
  useStoreInfo,
  useWithdrawOpeningQuestionApproval,
} from "@/hooks/useQueries";
import { formatTimestampMediumDate, staffDisplayName } from "@/lib/format";
import {
  AREA_COLORS,
  AREA_FILTERS,
  areaLabelKey,
  discussionTimeLeft,
  finishByBannerText,
  isDiscussionOpen,
  nextPendingQuestion,
  tabLabelKey,
  visibleQuestionTabs,
} from "@/lib/openingQuestions";
import {
  buildOpeningQuestionsDocx,
  docxFileName,
  downloadBlob,
} from "@/lib/openingQuestionsDocx";
import { cn } from "@/lib/utils";
import { useSearch } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  History,
  Pencil,
  Printer,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** How many questions render per section before a "Show more" control. */
const SECTION_PAGE = 12;

/** The empty filter used when no filter is set. */
const EMPTY_FILTER: QuestionFilter = {};

/** Whether a filter object has any active value. */
function hasFilters(filter: QuestionFilter): boolean {
  return Boolean(filter.area || filter.sectionTitle || filter.search?.trim());
}

/** The tabs a viewer may see, in display order. */
function visibleTabs(
  isAdmin: boolean,
  isOwner: boolean,
  canFinalize: boolean,
): QuestionTab[] {
  return visibleQuestionTabs(isAdmin, isOwner, canFinalize);
}

/** The default tab for a viewer: owners land on My questions. */
function defaultTab(isOwner: boolean): QuestionTab {
  return isOwner ? QuestionTab.myQuestions : QuestionTab.all;
}

/**
 * The tab a nudge alert opens: the Needs my approval tab, which only owners
 * see. Any other tab value falls back to the viewer's default tab.
 */
function initialTab(
  requested: string | undefined,
  isOwner: boolean,
): QuestionTab {
  if (requested === QuestionTab.needsMyApproval && isOwner) {
    return QuestionTab.needsMyApproval;
  }
  return defaultTab(isOwner);
}

export default function OpeningQuestionsPage() {
  const { t } = useI18n();
  const access = useAccessState();
  const demo = useDemo();
  const grant = access.kind === "granted" ? access.grant : null;
  const role = grant?.role;
  const isAdmin = isAdminRole(role);
  const isOwner = isOpeningQuestionsOwner(role);
  const canFinalize = canFinalizeOpeningQuestions(role);
  const canRead = canOpeningQuestions(role);
  const demoOn = demo.enabled;

  // A nudge alert opens this page on the Needs my approval tab through the
  // route search; every other visit keeps the viewer's default tab.
  const search = useSearch({ from: "/opening-questions" });

  const [tab, setTab] = useState<QuestionTab>(() =>
    initialTab(search.tab, isOwner),
  );
  const [filter, setFilter] = useState<QuestionFilter>(EMPTY_FILTER);
  const [printOpen, setPrintOpen] = useState(false);
  const [docxBusy, setDocxBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<QuestionView | null>(null);
  // The scoreboard row the viewer tapped, which narrows the list to the
  // questions still waiting on that person's approval.
  const [ownerFilter, setOwnerFilter] = useState<ManagerScoreRow | null>(null);
  // The Ready for final batch selection, keyed by question id.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBatch, setConfirmBatch] = useState(false);

  const tabs = visibleTabs(isAdmin, isOwner, canFinalize);
  const activeTab = tabs.includes(tab) ? tab : QuestionTab.all;

  const { data: storeInfo } = useStoreInfo();
  const { data: progress } = useOpeningQuestionsProgress(canRead && !demoOn);
  const list = useOpeningQuestions(activeTab, filter, canRead && !demoOn);
  const questions = list.data ?? [];

  // The Managers scoreboard is Managing Partner and Admin only, so only they
  // pay for the read. Its counts follow live ownership and refresh with every
  // approval, unapproval and finalize through the shared invalidation list.
  const scoreboard = useOpeningQuestionManagerScoreboard(
    isAdmin && canRead && !demoOn,
  );
  const scoreboardRows = scoreboard.data ?? [];
  const activeOwnerPrincipal = ownerFilter?.principal.toText() ?? null;

  // The Nudge button is Managing Partner and Admin only, enforced in the
  // backend. The change log carries today's nudge state, so only those roles
  // pay for that read.
  const canNudge = isAdmin;
  const changeLog = useChangeLog();
  const nudge = useSendOpeningQuestionNudge();
  const [nudgeErrorPrincipal, setNudgeErrorPrincipal] = useState<string | null>(
    null,
  );
  const nudgingPrincipal = nudge.isPending
    ? (nudge.variables?.toText() ?? null)
    : null;

  // The person filter narrows the listed questions to those still waiting on
  // that owner's approval. It is applied on top of the tab and filter rows.
  const ownerFiltered = useMemo(() => {
    if (!ownerFilter) return questions;
    const key = ownerFilter.principal.toText();
    return questions.filter(
      (view) =>
        !view.isFinal &&
        !view.myApproved &&
        view.owners.some((owner) => owner.principal.toText() === key),
    );
  }, [questions, ownerFilter]);

  // On the Needs my approval tab an approved card stays in place with its
  // "You approved" chip until the person switches tabs or refreshes. The
  // backend list excludes approved questions, so the approved card is merged
  // back in from the last rendered list.
  const [keptApproved, setKeptApproved] = useState<QuestionView[]>([]);
  const keepApprovedInPlace = activeTab === QuestionTab.needsMyApproval;
  // The kept card lives only for the current visit to Needs my approval: a tab
  // switch or a page refresh drops it, so the card and the tab count agree.
  useEffect(() => {
    if (!keepApprovedInPlace) setKeptApproved([]);
  }, [keepApprovedInPlace]);
  const shownQuestions = useMemo(() => {
    if (!keepApprovedInPlace || keptApproved.length === 0) return ownerFiltered;
    const present = new Set(ownerFiltered.map((v) => v.question.id.toString()));
    const extra = keptApproved.filter(
      (v) => !present.has(v.question.id.toString()),
    );
    return extra.length === 0 ? ownerFiltered : [...ownerFiltered, ...extra];
  }, [ownerFiltered, keptApproved, keepApprovedInPlace]);

  // The Ready for final tab label carries a live count. The Managing Partner is
  // the only role that sees the tab, so only they pay for the extra read; the
  // count comes from the same unfiltered ready list the tab itself renders.
  const readyList = useOpeningQuestions(
    QuestionTab.readyForFinal,
    EMPTY_FILTER,
    canFinalize && canRead && !demoOn,
  );
  const readyCount = readyList.data?.length ?? 0;

  // The Ready for final batch selection. Only the Managing Partner sees the
  // checkboxes, so the selection is cleared whenever they leave the tab.
  const batchMode = canFinalize && activeTab === QuestionTab.readyForFinal;
  useEffect(() => {
    if (!batchMode) setSelected(new Set());
  }, [batchMode]);
  const readyIds = useMemo(
    () => (readyList.data ?? []).map((v) => v.question.id.toString()),
    [readyList.data],
  );
  const allReadySelected =
    readyIds.length > 0 && readyIds.every((id) => selected.has(id));
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected(allReadySelected ? new Set() : new Set(readyIds));

  // My questions carries the caller's owned-question count, read from the same
  // unfiltered list the tab renders so the badge matches the rows below it.
  const myQuestionsList = useOpeningQuestions(
    QuestionTab.myQuestions,
    EMPTY_FILTER,
    isOwner && canRead && !demoOn,
  );
  const myQuestionsCount = myQuestionsList.data?.length ?? 0;

  // The section headers report each section's real Final count and the owner's
  // real need-you count, so they read from the whole section rather than the
  // rows a tab or filter happens to list. The unfiltered All list is the source.
  const allQuestionsList = useOpeningQuestions(
    QuestionTab.all,
    EMPTY_FILTER,
    canRead && !demoOn,
  );
  const allQuestions = allQuestionsList.data ?? [];

  // Needs my approval carries the caller's own pending-approval count, not the
  // answered count the progress summary reports.
  const pendingApprovals = useMyPendingOpeningQuestionApprovals(
    isOwner && canRead && !demoOn,
  );
  const needsMyApprovalCount = pendingApprovals.data ?? 0n;

  // The Finish-by date and its day counts, computed on the backend against the
  // store clock. Every role that can read the section sees the banner.
  const finishBy = useOpeningQuestionFinishBy(canRead && !demoOn);
  const finishByText = finishByBannerText(finishBy.data, t);
  const finishByOverdue = (finishBy.data?.daysOverdue ?? 0n) > 0n;

  // The question the Next button should jump to after an approval. It is set
  // only by the approve flow, so the card that was just approved shows Next
  // (or "All caught up") while every other card stays unchanged.
  const [nextTarget, setNextTarget] = useState<{
    fromId: string;
    toId: string | null;
  } | null>(null);
  const scrollToId = useRef<string | null>(null);

  const saveAnswer = useSaveOpeningQuestionAnswer();
  const approve = useApproveOpeningQuestion(keepApprovedInPlace);
  const withdraw = useWithdrawOpeningQuestionApproval();
  const markFinal = useMarkOpeningQuestionFinal();
  const markFinalBatch = useMarkOpeningQuestionsFinal();
  const reopen = useReopenOpeningQuestion();
  const postSuggestion = usePostOpeningQuestionSuggestion();
  const replySuggestion = useReplyToOpeningQuestionSuggestion();
  const postComment = usePostOpeningQuestionComment();
  const decideSuggestion = useDecideOpeningQuestionSuggestion();

  const anyPending =
    saveAnswer.isPending ||
    approve.isPending ||
    withdraw.isPending ||
    markFinal.isPending ||
    markFinalBatch.isPending ||
    reopen.isPending ||
    postSuggestion.isPending ||
    replySuggestion.isPending ||
    postComment.isPending ||
    decideSuggestion.isPending;

  const storeNumber = storeInfo?.storeNumber ?? "";
  const location = storeInfo?.locationName ?? "";

  // The caller's own questions still needing their approval, in imported order.
  // Next only moves between these: owned, not yet approved and not Final.
  const myPendingQuestions = useMemo(
    () =>
      (myQuestionsList.data ?? []).filter(
        (view) => !view.myApproved && !view.isFinal,
      ),
    [myQuestionsList.data],
  );

  // After a question is approved, work out the next one still needing the
  // caller's approval and scroll to it once it has rendered.
  const handleApproved = (id: QuestionId) => {
    const next = nextPendingQuestion(myPendingQuestions, id);
    setNextTarget({
      fromId: id.toString(),
      toId: next ? next.question.id.toString() : null,
    });
    scrollToId.current = next ? next.question.id.toString() : null;
  };

  useEffect(() => {
    const target = scrollToId.current;
    if (!target) return;
    scrollToId.current = null;
    const el = document.getElementById(`oq-question-${target}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }, []);

  // The History popup names the person behind each change. Only the Managing
  // Partner and Admins open it, so the staff directory read is gated to them.
  const grants = useAccessGrants();
  const leaders = useLeaders(isAdmin);
  const nameFor = useMemo(() => {
    // A person with no staff profile still gets a readable label rather than a
    // blank, so every history line names a person instead of a principal.
    const unknown = t("oq.history.unknownPerson");
    const names = new Map<string, string>();
    for (const leader of leaders.data ?? []) {
      names.set(
        leader.principal.toText(),
        staffDisplayName(leader.staffProfile, unknown),
      );
    }
    for (const grant of grants.data ?? []) {
      const key = grant.principal.toText();
      if (!names.get(key)) {
        names.set(key, staffDisplayName(grant.staffProfile, unknown));
      }
    }
    return (principal: { toText(): string }) =>
      names.get(principal.toText()) ?? unknown;
  }, [grants.data, leaders.data, t]);

  const docxCopy = useMemo(
    () => ({
      cover: t("oq.card.printCover"),
      store: t("oq.card.printStore", { number: storeNumber }),
      location,
      title: t("oq.card.printTitle"),
      legend: t("oq.card.legend"),
      legendKitchen: t("oq.card.legendKitchen"),
      legendService: t("oq.card.legendService"),
      legendBoth: t("oq.card.legendBoth"),
      legendDan: t("oq.card.legendDan"),
      owners: t("oq.card.printOwners"),
      answer: t("oq.card.printAnswer"),
      finalLine: t("oq.card.printFinalLine"),
      approved: t("oq.card.printApproved"),
      notApproved: t("oq.card.printNotApproved"),
      final: t("oq.card.printFinal"),
      notFinal: t("oq.card.printNotFinal"),
      readyForFinal: t("oq.card.printReadyForFinal"),
      awaitingApprovals: t("oq.card.printAwaitingApprovals"),
      noAnswer: t("oq.card.printNoAnswer"),
      suggestions: t("oq.card.printSuggestions"),
      noSuggestions: t("oq.card.printNoSuggestions"),
      accepted: t("oq.card.printAccepted"),
      open: t("oq.card.printOpen"),
      declined: t("oq.card.printDeclined"),
      page: t("oq.card.printPage"),
      generated: t("oq.card.printGenerated"),
      areaLabel: (area: QuestionArea) => t(areaLabelKey(area)),
    }),
    [t, storeNumber, location],
  );

  const handleDocx = async () => {
    if (questions.length === 0) return;
    setDocxBusy(true);
    try {
      const blob = await buildOpeningQuestionsDocx(
        questions,
        { storeNumber, location },
        docxCopy,
      );
      downloadBlob(blob, docxFileName(storeNumber));
      toast.success(t("oq.card.docxDone"));
    } catch {
      toast.error(t("oq.card.docxError"));
    } finally {
      setDocxBusy(false);
    }
  };

  const clearFilters = () => setFilter(EMPTY_FILTER);

  const confirmMarkFinal = () => {
    const ids = Array.from(selected).map((id) => BigInt(id));
    if (ids.length === 0) return;
    markFinalBatch.mutate(ids, {
      onSuccess: (result) => {
        setConfirmBatch(false);
        setSelected(new Set());
        toast.success(
          t("oq.batch.result", {
            marked: result.markedCount.toString(),
            skipped: result.skippedCount.toString(),
          }),
        );
      },
      onError: () => toast.error(t("oq.batch.error")),
    });
  };

  if (demoOn) {
    return (
      <div data-ocid="opening_questions.page" className="space-y-6">
        <PageHeader title={t("oq.title")} subtitle={t("oq.subtitle")} />
        <div
          data-ocid="oq.demo.hidden_state"
          className="rounded-lg border border-dashed border-border bg-card p-8 text-center"
        >
          <p className="text-sm text-muted-foreground">{t("oq.demo.hidden")}</p>
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div data-ocid="opening_questions.page" className="space-y-6">
        <PageHeader title={t("oq.title")} subtitle={t("oq.subtitle")} />
        <p className="text-sm text-muted-foreground">{t("oq.empty")}</p>
      </div>
    );
  }

  return (
    <div data-ocid="opening_questions.page" className="space-y-6">
      <PageHeader
        title={t("oq.title")}
        subtitle={t("oq.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="touch-target"
              data-ocid="oq.download.docx_button"
              disabled={docxBusy || questions.length === 0}
              onClick={handleDocx}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {docxBusy ? t("oq.download.preparing") : t("oq.download.docx")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="touch-target"
              data-ocid="oq.download.pdf_button"
              disabled={questions.length === 0}
              onClick={() => setPrintOpen(true)}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t("oq.download.pdf")}
            </Button>
          </div>
        }
      />

      {finishByText && (
        <div
          data-ocid="oq.finish_by.banner"
          className={cn(
            "flex items-center gap-2 rounded-md border px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider",
            finishByOverdue
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/5 text-primary",
          )}
        >
          <span className="tabular-nums">{finishByText}</span>
        </div>
      )}

      {isAdmin && (
        <ManagersScoreboard
          rows={scoreboardRows}
          isLoading={scoreboard.isLoading}
          activePrincipal={activeOwnerPrincipal}
          onSelect={(row) => setOwnerFilter(row)}
          onClear={() => setOwnerFilter(null)}
          canNudge={canNudge}
          changeLog={changeLog.data}
          onNudge={(row) => {
            setNudgeErrorPrincipal(null);
            nudge.mutate(row.principal, {
              onError: () => setNudgeErrorPrincipal(row.principal.toText()),
            });
          }}
          nudgingPrincipal={nudgingPrincipal}
          nudgeErrorPrincipal={nudgeErrorPrincipal}
        />
      )}

      {progress && (
        <ProgressCard
          total={progress.total}
          final={progress.final}
          readyForFinal={progress.readyForFinal}
          openSuggestions={progress.openSuggestions}
          sections={progress.sections}
        />
      )}

      <div
        role="tablist"
        aria-label={t("oq.title")}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {tabs.map((item) => {
          const count =
            item === QuestionTab.myQuestions
              ? myQuestionsCount
              : item === QuestionTab.needsMyApproval
                ? needsMyApprovalCount
                : item === QuestionTab.decisionDue
                  ? progress?.openSuggestions
                  : item === QuestionTab.final
                    ? progress?.final
                    : item === QuestionTab.readyForFinal
                      ? readyCount
                      : progress?.total;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={activeTab === item}
              data-ocid={`oq.tab.${item}`}
              onClick={() => setTab(item)}
              className={cn(
                "touch-target -mb-px border-b-2 px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider transition-colors",
                activeTab === item
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tabLabelKey(item))}
              {count !== undefined && (
                <span className="ml-1.5 tabular-nums">
                  ({count.toString()})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <FilterBar
        filter={filter}
        onChange={setFilter}
        onClear={clearFilters}
        sections={progress?.sections.map((s) => s.sectionTitle) ?? []}
      />

      {ownerFilter && (
        <ActiveOwnerFilter
          name={ownerFilter.displayName}
          onClear={() => setOwnerFilter(null)}
        />
      )}

      {batchMode && readyIds.length > 0 && (
        <div
          data-ocid="oq.batch.toolbar"
          className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
        >
          <label
            htmlFor="oq-batch-select-all"
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-foreground"
          >
            <Checkbox
              id="oq-batch-select-all"
              checked={allReadySelected}
              data-ocid="oq.batch.select_all_checkbox"
              onCheckedChange={toggleSelectAll}
            />
            {t("oq.batch.selectAll")}
          </label>
          <Button
            type="button"
            className="touch-target ml-auto"
            data-ocid="oq.batch.mark_final_button"
            disabled={selected.size === 0 || markFinalBatch.isPending}
            onClick={() => setConfirmBatch(true)}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t("oq.batch.markFinal", { count: selected.size })}
          </Button>
        </div>
      )}

      {list.isLoading ? (
        <div data-ocid="oq.loading_state" className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => `oq-skeleton-${i}`).map((id) => (
            <Skeleton key={id} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <div
          data-ocid="oq.error_state"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <p className="text-sm text-foreground">{t("oq.error")}</p>
          <Button
            type="button"
            variant="outline"
            className="touch-target mt-3"
            data-ocid="oq.retry_button"
            onClick={() => void list.refetch()}
          >
            {t("oq.retry")}
          </Button>
        </div>
      ) : questions.length === 0 ? (
        <div
          data-ocid="oq.empty_state"
          className="rounded-lg border border-dashed border-border bg-card p-10 text-center"
        >
          <FileText
            className="mx-auto h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 font-display text-base font-semibold uppercase tracking-wider text-foreground">
            {t("oq.empty")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("oq.emptyHint")}
          </p>
          {hasFilters(filter) && (
            <Button
              type="button"
              variant="outline"
              className="touch-target mt-4"
              data-ocid="oq.clear_filters_button"
              onClick={clearFilters}
            >
              {t("oq.clearFilters")}
            </Button>
          )}
          {ownerFilter && (
            <Button
              type="button"
              variant="outline"
              className="touch-target mt-4"
              data-ocid="oq.owner_filter.clear_button"
              onClick={() => setOwnerFilter(null)}
            >
              {t("oq.owner_filter.clear")}
            </Button>
          )}
        </div>
      ) : (
        <QuestionSections
          questions={shownQuestions}
          allQuestions={allQuestions}
          isAdmin={isAdmin}
          isOwner={isOwner}
          canFinalize={canFinalize}
          isPending={anyPending}
          filterActive={hasFilters(filter)}
          batchMode={batchMode}
          selected={selected}
          onToggleSelected={toggleSelected}
          onOpenHistory={setHistoryFor}
          nextTarget={nextTarget}
          onNext={(toId) => {
            scrollToId.current = toId;
            const el = document.getElementById(`oq-question-${toId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.focus({ preventScroll: true });
            }
          }}
          onSaveAnswer={(id, answer) =>
            saveAnswer.mutate(
              { id, answer },
              {
                onSuccess: () => toast.success(t("oq.card.answerSaved")),
                onError: () => toast.error(t("oq.card.answerSaveError")),
              },
            )
          }
          onApprove={(id) => {
            const approvedView = questions.find(
              (v) => v.question.id.toString() === id.toString(),
            );
            approve.mutate(id, {
              onSuccess: () => {
                if (keepApprovedInPlace && approvedView) {
                  const approvedAt = BigInt(Date.now()) * 1_000_000n;
                  setKeptApproved((prev) =>
                    prev.some((v) => v.question.id.toString() === id.toString())
                      ? prev
                      : [
                          ...prev,
                          {
                            ...approvedView,
                            myApproved: true,
                            myApprovedAt: approvedAt,
                          },
                        ],
                  );
                }
                handleApproved(id);
                toast.success(t("oq.card.approvedToast"));
              },
              onError: () => toast.error(t("oq.card.actionError")),
            });
          }}
          onWithdraw={(id) =>
            withdraw.mutate(id, {
              onSuccess: () => toast.success(t("oq.card.withdrawnToast")),
              onError: () => toast.error(t("oq.card.actionError")),
            })
          }
          onMarkFinal={(id) =>
            markFinal.mutate(id, {
              onSuccess: () => toast.success(t("oq.card.finalToast")),
              onError: () => toast.error(t("oq.card.actionError")),
            })
          }
          onReopen={(id) =>
            reopen.mutate(id, {
              onSuccess: () => toast.success(t("oq.card.reopenedToast")),
              onError: () => toast.error(t("oq.card.actionError")),
            })
          }
          onSuggest={(id, proposedAnswer, note) =>
            postSuggestion.mutate(
              { id, proposedAnswer, note },
              {
                onSuccess: () => toast.success(t("oq.card.suggestionPosted")),
                onError: () => toast.error(t("oq.card.actionError")),
              },
            )
          }
          onReply={(id, suggestionId, text) =>
            replySuggestion.mutate(
              { id, suggestionId, text },
              {
                onSuccess: () => toast.success(t("oq.card.replyPosted")),
                onError: () => toast.error(t("oq.card.actionError")),
              },
            )
          }
          onComment={(id, text) =>
            postComment.mutate(
              { id, text },
              {
                onSuccess: () => toast.success(t("oq.card.commentPosted")),
                onError: () => toast.error(t("oq.card.actionError")),
              },
            )
          }
          onDecide={(id, suggestionId, accept) =>
            decideSuggestion.mutate(
              { id, suggestionId, accept },
              {
                onSuccess: () => toast.success(t("oq.card.decisionRecorded")),
                onError: () => toast.error(t("oq.card.actionError")),
              },
            )
          }
        />
      )}

      {confirmBatch && (
        <Dialog open onOpenChange={(open) => !open && setConfirmBatch(false)}>
          <DialogContent
            data-ocid="oq.batch.confirm_dialog"
            className="sm:max-w-md"
          >
            <DialogHeader>
              <DialogTitle>
                {t("oq.batch.confirmTitle", { count: selected.size })}
              </DialogTitle>
              <DialogDescription>{t("oq.batch.confirmBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="touch-target"
                data-ocid="oq.batch.cancel_button"
                onClick={() => setConfirmBatch(false)}
              >
                {t("oq.batch.cancel")}
              </Button>
              <Button
                type="button"
                className="touch-target"
                data-ocid="oq.batch.confirm_button"
                disabled={markFinalBatch.isPending}
                onClick={confirmMarkFinal}
              >
                {t("oq.batch.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {printOpen && (
        <PrintSheet
          questions={questions}
          storeNumber={storeNumber}
          location={location}
          onClose={() => setPrintOpen(false)}
        />
      )}

      {historyFor && (
        <QuestionHistoryDialog
          questionId={historyFor.question.id}
          questionNumber={historyFor.question.number}
          open
          onOpenChange={(open) => {
            if (!open) setHistoryFor(null);
          }}
          nameFor={nameFor}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Progress card
--------------------------------------------------------------------------- */

function ProgressCard({
  total,
  final,
  readyForFinal,
  openSuggestions,
  sections,
}: {
  total: bigint;
  final: bigint;
  readyForFinal: bigint;
  openSuggestions: bigint;
  sections: Array<{
    sectionTitle: string;
    answered: bigint;
    final: bigint;
    total: bigint;
  }>;
}) {
  const { t } = useI18n();
  const pct = (done: bigint, all: bigint) =>
    all === 0n ? 0 : Math.round((Number(done) / Number(all)) * 100);

  return (
    <section
      data-ocid="oq.progress.card"
      className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
        {t("oq.progress.title")}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("oq.progress.final")}
          value={t("oq.progress.of", {
            done: final.toString(),
            total: total.toString(),
          })}
          ocid="oq.progress.final"
        />
        <Stat
          label={t("oq.progress.readyForFinal")}
          value={readyForFinal.toString()}
          ocid="oq.progress.ready_for_final"
        />
        <Stat
          label={t("oq.progress.openSuggestions")}
          value={openSuggestions.toString()}
          ocid="oq.progress.open_suggestions"
        />
        <Stat
          label={t("oq.progress.total")}
          value={total.toString()}
          ocid="oq.progress.total"
        />
      </div>

      {sections.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("oq.progress.sections")}
          </p>
          {sections.map((section) => (
            <div key={section.sectionTitle} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-foreground">
                  {section.sectionTitle}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t("oq.progress.of", {
                    done: section.final.toString(),
                    total: section.total.toString(),
                  })}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct(section.final, section.total)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  ocid,
}: {
  label: string;
  value: string;
  ocid: string;
}) {
  return (
    <div data-ocid={ocid} className="rounded-md bg-muted/60 px-3 py-2">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Filters
--------------------------------------------------------------------------- */

function FilterBar({
  filter,
  onChange,
  onClear,
  sections,
}: {
  filter: QuestionFilter;
  onChange: (filter: QuestionFilter) => void;
  onClear: () => void;
  sections: string[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState(filter.search ?? "");

  const commitSearch = (value: string) => {
    setSearch(value);
    onChange({ ...filter, search: value.trim() ? value : undefined });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <label
          htmlFor="oq-search"
          className="mb-1 block font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("oq.searchLabel")}
        </label>
        <Input
          id="oq-search"
          type="search"
          value={search}
          placeholder={t("oq.searchPlaceholder")}
          data-ocid="oq.search_input"
          className="touch-target"
          onChange={(e) => commitSearch(e.target.value)}
        />
      </div>

      <div>
        <label
          htmlFor="oq-section"
          className="mb-1 block font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("oq.filter.section")}
        </label>
        <Select
          value={filter.sectionTitle ?? "__all"}
          onValueChange={(value) =>
            onChange({
              ...filter,
              sectionTitle: value === "__all" ? undefined : value,
            })
          }
        >
          <SelectTrigger
            id="oq-section"
            data-ocid="oq.filter.section_select"
            className="touch-target"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("oq.filter.allSections")}</SelectItem>
            {sections.map((title) => (
              <SelectItem key={title} value={title}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          htmlFor="oq-area"
          className="mb-1 block font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t("oq.filter.area")}
        </label>
        <Select
          value={filter.area ?? "__all"}
          onValueChange={(value) =>
            onChange({
              ...filter,
              area: value === "__all" ? undefined : (value as QuestionArea),
            })
          }
        >
          <SelectTrigger
            id="oq-area"
            data-ocid="oq.filter.area_select"
            className="touch-target"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{t("oq.filter.all")}</SelectItem>
            {AREA_FILTERS.map((area) => (
              <SelectItem key={area} value={area}>
                {t(areaLabelKey(area))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters(filter) && (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="touch-target"
            data-ocid="oq.clear_filters_button"
            onClick={() => {
              setSearch("");
              onClear();
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("oq.clearFilters")}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Sections + cards
--------------------------------------------------------------------------- */

interface QuestionActions {
  isAdmin: boolean;
  isOwner: boolean;
  canFinalize: boolean;
  isPending: boolean;
  onSaveAnswer: (id: QuestionId, answer: string) => void;
  onApprove: (id: QuestionId) => void;
  onWithdraw: (id: QuestionId) => void;
  onMarkFinal: (id: QuestionId) => void;
  onReopen: (id: QuestionId) => void;
  onSuggest: (id: QuestionId, proposedAnswer: string, note: string) => void;
  onReply: (id: QuestionId, suggestionId: SuggestionId, text: string) => void;
  onComment: (id: QuestionId, text: string) => void;
  onDecide: (
    id: QuestionId,
    suggestionId: SuggestionId,
    accept: boolean,
  ) => void;
  onOpenHistory: (view: QuestionView) => void;
  batchMode: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  nextTarget: { fromId: string; toId: string | null } | null;
  onNext: (toId: string) => void;
}

function QuestionSections({
  questions,
  allQuestions,
  filterActive,
  nextTarget,
  ...actions
}: {
  questions: QuestionView[];
  allQuestions: QuestionView[];
  filterActive: boolean;
} & QuestionActions) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  // When Next jumps to a question, its section must be open so the card is
  // visible. The target's section title is looked up from the rendered rows.
  const nextSectionTitle = useMemo(() => {
    if (!nextTarget?.toId) return null;
    return (
      questions.find((v) => v.question.id.toString() === nextTarget.toId)
        ?.question.sectionTitle ?? null
    );
  }, [questions, nextTarget]);
  useEffect(() => {
    if (nextSectionTitle) {
      setExpanded((prev) => ({ ...prev, [nextSectionTitle]: true }));
    }
  }, [nextSectionTitle]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuestionView[]>();
    for (const view of questions) {
      const key = view.question.sectionTitle;
      const bucket = map.get(key);
      if (bucket) bucket.push(view);
      else map.set(key, [view]);
    }
    return Array.from(map.entries());
  }, [questions]);

  // The whole section, keyed by title, so a header's Final count and need-you
  // badge stay correct even when a tab or filter narrows the listed rows.
  const sectionTotals = useMemo(() => {
    const map = new Map<
      string,
      { final: number; total: number; needYou: number }
    >();
    for (const view of allQuestions) {
      const key = view.question.sectionTitle;
      const bucket = map.get(key) ?? { final: 0, total: 0, needYou: 0 };
      bucket.total += 1;
      if (view.isFinal) bucket.final += 1;
      if (!view.myApproved && !view.isFinal) bucket.needYou += 1;
      map.set(key, bucket);
    }
    return map;
  }, [allQuestions]);

  // While a filter or search is active only matching sections render, and they
  // open automatically so the matches are visible without extra taps.
  const isOpen = (title: string) => filterActive || (expanded[title] ?? false);
  const toggle = (title: string) =>
    setExpanded((prev) => ({ ...prev, [title]: !isOpen(title) }));

  const openAll = () =>
    setExpanded(Object.fromEntries(grouped.map(([title]) => [title, true])));
  const closeAll = () => setExpanded({});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="touch-target"
          data-ocid="oq.sections.open_all_button"
          onClick={openAll}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          {t("oq.section.openAll")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="touch-target"
          data-ocid="oq.sections.close_all_button"
          onClick={closeAll}
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
          {t("oq.section.closeAll")}
        </Button>
      </div>

      {grouped.map(([sectionTitle, items]) => {
        const open = isOpen(sectionTitle);
        const totals = sectionTotals.get(sectionTitle);
        const finalCount =
          totals?.final ?? items.filter((v) => v.isFinal).length;
        const sectionTotal = totals?.total ?? items.length;
        const needYou =
          totals?.needYou ??
          items.filter((v) => !v.myApproved && !v.isFinal).length;
        const allShown = showAll[sectionTitle] ?? false;
        const visible = allShown ? items : items.slice(0, SECTION_PAGE);
        const panelId = `oq-section-panel-${sectionTitle.replace(/\s+/g, "-")}`;
        return (
          <section
            key={sectionTitle}
            data-ocid="oq.section"
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-3 py-2">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={open ? t("oq.section.close") : t("oq.section.open")}
                data-ocid="oq.section.toggle"
                onClick={() => toggle(sectionTitle)}
                className="touch-target flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                    open ? "rotate-0" : "-rotate-90",
                  )}
                  aria-hidden="true"
                />
                <h2 className="min-w-0 truncate font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                  {sectionTitle}
                </h2>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-ocid="oq.section.final_count"
                  className="rounded-full bg-primary/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider tabular-nums text-primary"
                >
                  {t("oq.section.finalCount", {
                    done: finalCount,
                    total: sectionTotal,
                  })}
                </span>
                {actions.isOwner && needYou > 0 && (
                  <span
                    data-ocid="oq.section.need_you"
                    className="rounded-full bg-destructive/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider tabular-nums text-destructive"
                  >
                    {t("oq.section.needYou", { count: needYou })}
                  </span>
                )}
              </div>
            </div>

            {open && (
              <div id={panelId} className="space-y-3 p-3">
                {visible.map((view) => (
                  <QuestionCard
                    key={view.question.id.toString()}
                    view={view}
                    nextTarget={nextTarget}
                    {...actions}
                  />
                ))}
                {items.length > SECTION_PAGE && !allShown && (
                  <Button
                    type="button"
                    variant="outline"
                    className="touch-target w-full"
                    data-ocid="oq.show_more_button"
                    onClick={() =>
                      setShowAll((prev) => ({
                        ...prev,
                        [sectionTitle]: true,
                      }))
                    }
                  >
                    {t("oq.card.showMore")}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function QuestionCard({
  view,
  ...actions
}: { view: QuestionView } & QuestionActions) {
  const { t } = useI18n();
  const q = view.question;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.answer);
  const [suggesting, setSuggesting] = useState(false);
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");

  const canEdit = actions.isAdmin || actions.isOwner;
  const stripe = AREA_COLORS[q.area];
  const questionKey = q.id.toString();
  const selectable = actions.batchMode && view.readyForFinal && !view.isFinal;
  const isSelected = selectable && actions.selected.has(questionKey);
  const openSuggestion = q.suggestions.find((s) =>
    isDiscussionOpen(s.discussionEndsAt),
  );

  const startEdit = () => {
    setDraft(q.answer);
    setEditing(true);
  };

  const save = () => {
    const value = draft;
    setEditing(false);
    actions.onSaveAnswer(q.id, value);
  };

  const submitSuggestion = () => {
    const proposedAnswer = proposed.trim();
    if (!proposedAnswer) return;
    setProposed("");
    setNote("");
    setSuggesting(false);
    actions.onSuggest(q.id, proposedAnswer, note.trim());
  };

  return (
    <article
      id={`oq-question-${questionKey}`}
      tabIndex={-1}
      data-ocid="oq.question.card"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex">
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: stripe }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {selectable && (
                <Checkbox
                  checked={isSelected}
                  aria-label={t("oq.batch.selectQuestion", {
                    number: q.number.toString(),
                  })}
                  data-ocid="oq.question.select_checkbox"
                  className="mt-1"
                  onCheckedChange={() => actions.onToggleSelected(questionKey)}
                />
              )}
              <span
                className="mt-0.5 shrink-0 font-display text-sm font-bold tabular-nums"
                style={{ color: stripe }}
              >
                {q.number.toString()}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold leading-snug text-foreground">
                  {q.question}
                </h3>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AreaPill area={q.area} ocid="oq.question.area_pill" />
              {view.isFinal && (
                <FinalBadge
                  finalizedByName={view.finalizedByName}
                  ocid="oq.question.final_badge"
                />
              )}
              {view.readyForFinal && !view.isFinal && (
                <span
                  data-ocid="oq.question.ready_for_final_badge"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-primary"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {t("oq.card.readyForFinal")}
                </span>
              )}
              {view.decisionDue && (
                <span
                  data-ocid="oq.question.decision_due"
                  className="rounded-full bg-destructive/10 px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wider text-destructive"
                >
                  {t("oq.card.decisionDue")}
                </span>
              )}
              {actions.isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="touch-target -my-1"
                  data-ocid="oq.question.history_button"
                  onClick={() => actions.onOpenHistory(view)}
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("oq.history.link")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("oq.card.updated", {
                date: formatTimestampMediumDate(q.updatedAt),
              })}
            </span>
          </div>

          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("oq.card.answerPlaceholder")}
                aria-label={t("oq.card.answer")}
                data-ocid="oq.question.answer_textarea"
                className="min-h-24"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="touch-target"
                  data-ocid="oq.question.save_button"
                  disabled={actions.isPending}
                  onClick={save}
                >
                  {actions.isPending
                    ? t("oq.card.saving")
                    : t("oq.card.saveAnswer")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="touch-target"
                  data-ocid="oq.question.cancel_button"
                  onClick={() => setEditing(false)}
                >
                  {t("oq.card.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-muted/60 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {q.answer.trim() ? q.answer : t("oq.card.answerEmpty")}
              </p>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="touch-target mt-1 -ml-2"
                  data-ocid="oq.question.edit_button"
                  onClick={startEdit}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("oq.card.editAnswer")}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("oq.card.approvals")}
              </span>
              <ApprovalChips
                owners={view.owners}
                approved={view.ownerApprovals}
                ocid="oq.question.approval_chips"
              />
              {view.myApproved && (
                <span
                  data-ocid="oq.question.my_approved_chip"
                  className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-success"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {view.myApprovedAt !== undefined
                    ? t("oq.card.youApprovedOn", {
                        date: formatTimestampMediumDate(view.myApprovedAt),
                      })
                    : t("oq.card.youApproved")}
                </span>
              )}
            </div>

            {actions.isOwner && (
              <div className="space-y-1">
                <label
                  htmlFor={`oq-approve-${q.id.toString()}`}
                  className={cn(
                    "flex min-h-11 items-center gap-2 text-sm text-foreground",
                    view.isFinal
                      ? "cursor-not-allowed text-muted-foreground"
                      : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    id={`oq-approve-${q.id.toString()}`}
                    checked={view.myApproved}
                    disabled={actions.isPending || view.isFinal}
                    data-ocid="oq.question.my_approval_checkbox"
                    onCheckedChange={(checked) => {
                      if (checked) actions.onApprove(q.id);
                      else actions.onWithdraw(q.id);
                    }}
                  />
                  {t("oq.card.myApproval")}
                </label>
                {view.isFinal && (
                  <p
                    data-ocid="oq.question.final_lock"
                    className="text-xs text-muted-foreground"
                  >
                    {t("oq.card.finalLocked")}
                  </p>
                )}
                {actions.nextTarget?.fromId === questionKey && (
                  <div className="pt-1">
                    {actions.nextTarget.toId ? (
                      <Button
                        type="button"
                        size="sm"
                        className="touch-target"
                        data-ocid="oq.question.next_button"
                        onClick={() =>
                          actions.onNext(actions.nextTarget?.toId ?? "")
                        }
                      >
                        {t("oq.next.button")}
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : (
                      <span
                        data-ocid="oq.question.caught_up"
                        className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-success"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        {t("oq.next.caughtUp")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {view.inputApprovals.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">{t("oq.card.input")}: </span>
                {view.inputApprovals.map((o) => o.displayName).join(", ")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {view.isFinal ? (
              <>
                <FinalBadge
                  finalizedByName={view.finalizedByName}
                  ocid="oq.question.final_line"
                />
                {actions.canFinalize && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="touch-target"
                    data-ocid="oq.question.reopen_button"
                    disabled={actions.isPending}
                    onClick={() => actions.onReopen(q.id)}
                  >
                    {t("oq.card.reopen")}
                  </Button>
                )}
              </>
            ) : (
              actions.canFinalize && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="touch-target"
                  data-ocid="oq.question.mark_final_button"
                  disabled={actions.isPending}
                  onClick={() => actions.onMarkFinal(q.id)}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("oq.card.markFinal")}
                </Button>
              )
            )}
          </div>

          {suggesting ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Textarea
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                placeholder={t("oq.card.suggestPlaceholder")}
                aria-label={t("oq.card.suggest")}
                data-ocid="oq.question.suggest_textarea"
                className="min-h-20"
              />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("oq.card.suggestNotePlaceholder")}
                aria-label={t("oq.card.suggestNoteLabel")}
                data-ocid="oq.question.suggest_note_input"
                className="touch-target"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="touch-target"
                  data-ocid="oq.question.suggest_submit_button"
                  disabled={actions.isPending || !proposed.trim()}
                  onClick={submitSuggestion}
                >
                  {t("oq.card.suggestSubmit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="touch-target"
                  data-ocid="oq.question.suggest_cancel_button"
                  onClick={() => {
                    setSuggesting(false);
                    setProposed("");
                    setNote("");
                  }}
                >
                  {t("oq.card.suggestCancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="touch-target -ml-2"
              data-ocid="oq.question.suggest_button"
              onClick={() => setSuggesting(true)}
            >
              {t("oq.card.suggestOpen")}
            </Button>
          )}

          <DiscussionBlock
            suggestions={q.suggestions}
            comments={q.comments}
            canPost
            isPending={actions.isPending}
            canDecide={actions.isAdmin}
            onReply={(suggestionId, text) =>
              actions.onReply(q.id, suggestionId, text)
            }
            onComment={(text) => actions.onComment(q.id, text)}
            onDecide={(suggestionId, accept) =>
              actions.onDecide(q.id, suggestionId, accept)
            }
            ocid="oq.question.discussion"
          />

          {openSuggestion && (
            <p className="text-xs text-muted-foreground">
              {t("oq.card.discussionEnds", {
                date: discussionTimeLeft(openSuggestion.discussionEndsAt),
              })}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
