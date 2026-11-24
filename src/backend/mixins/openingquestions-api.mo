import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import OQ "../types/openingquestions";
import OQLib "../lib/openingquestions";

/// Public API for the Opening Questions section.
mixin (
  accessGrants : Map.Map<Principal, Access.AccessGrant>,
  demoState : Common.DemoState,
  openingQuestions : OQLib.State,
  storeInfo : { var value : Store.StoreInfo },
  changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
  counters : OQLib.Counters,
  logCounters : OQLib.LogCounters,
) {
  /// List questions for a tab, applying the combined filters.
  public query ({ caller }) func listOpeningQuestions(tab : OQ.QuestionTab, filter : OQ.QuestionFilter) : async [OQ.QuestionView] {
    OQLib.listQuestions(accessGrants, demoState, openingQuestions, storeInfo, caller, tab, filter);
  };

  /// The progress summary: answered and final counts plus per-section progress.
  public query ({ caller }) func getOpeningQuestionsProgress() : async OQ.ProgressSummary {
    OQLib.getProgress(accessGrants, demoState, openingQuestions, caller);
  };

  /// The caller's own pending-approval count for the Needs my approval badge.
  public query ({ caller }) func getMyPendingOpeningQuestionApprovals() : async Nat {
    OQLib.getMyPendingApprovalCount(accessGrants, demoState, openingQuestions, caller);
  };

  /// Save a question's answer; changing the text clears its approvals.
  public shared ({ caller }) func saveOpeningQuestionAnswer(id : OQ.QuestionId, answer : Text) : async () {
    OQLib.saveAnswer(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id, answer);
  };

  /// Tick the caller's own Approved box. Refused while the question is Final.
  public shared ({ caller }) func approveOpeningQuestion(id : OQ.QuestionId) : async () {
    OQLib.approve(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id);
  };

  /// Withdraw the caller's own approval only. Refused while the question is
  /// Final; returns the question to Needs my approval and out of Ready for final.
  public shared ({ caller }) func withdrawOpeningQuestionApproval(id : OQ.QuestionId) : async () {
    OQLib.withdrawApproval(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id);
  };

  /// Mark a question final (Managing Partner only, works anytime).
  public shared ({ caller }) func markOpeningQuestionFinal(id : OQ.QuestionId) : async () {
    OQLib.markFinal(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id);
  };

  /// Reopen a final question (Managing Partner only). Clears the final mark and
  /// keeps the answer and discussion.
  public shared ({ caller }) func reopenOpeningQuestion(id : OQ.QuestionId) : async () {
    OQLib.reopen(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id);
  };

  /// Post a suggested change, opening a 48-hour discussion.
  public shared ({ caller }) func postOpeningQuestionSuggestion(id : OQ.QuestionId, proposedAnswer : Text, note : Text) : async () {
    OQLib.postSuggestion(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id, proposedAnswer, note);
  };

  /// Reply in a suggestion's discussion.
  public shared ({ caller }) func replyToOpeningQuestionSuggestion(id : OQ.QuestionId, suggestionId : OQ.SuggestionId, text : Text) : async () {
    OQLib.replyToSuggestion(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id, suggestionId, text);
  };

  /// Post a comment on a question.
  public shared ({ caller }) func postOpeningQuestionComment(id : OQ.QuestionId, text : Text) : async () {
    OQLib.postComment(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id, text);
  };

  /// Accept or decline a suggestion (Admin only).
  public shared ({ caller }) func decideOpeningQuestionSuggestion(id : OQ.QuestionId, suggestionId : OQ.SuggestionId, accept : Bool) : async () {
    OQLib.decideSuggestion(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, id, suggestionId, accept);
  };

  /// Import questions from a validated file (Admin only, only when none exist).
  public shared ({ caller }) func importOpeningQuestions(file : OQ.ImportFile) : async OQ.ImportValidation {
    OQLib.importQuestions(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, file);
  };

  /// Clear all questions (Admin only, `confirm` must be "CLEAR").
  public shared ({ caller }) func clearOpeningQuestions(confirm : Text) : async () {
    OQLib.clearAll(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, confirm);
  };

  /// The caller's Opening Questions alerts and counts.
  public query ({ caller }) func getOpeningQuestionAlerts() : async OQ.AlertSummary {
    OQLib.getAlerts(accessGrants, demoState, openingQuestions, storeInfo, caller);
  };

  /// Read the daily-email setting (Admin only).
  public query ({ caller }) func getOpeningQuestionEmailSettings() : async OQ.EmailSettings {
    OQLib.getEmailSettings(accessGrants, demoState, openingQuestions, caller);
  };

  /// Update the daily-email setting (Admin only).
  public shared ({ caller }) func updateOpeningQuestionEmailSettings(settings : OQ.EmailSettings) : async () {
    OQLib.updateEmailSettings(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, settings);
  };

  /// The Managers scoreboard: one row per current question owner, sorted by
  /// most questions still needing approval first. Managing Partner and Admins
  /// only; every other role is refused.
  public query ({ caller }) func getOpeningQuestionManagerScoreboard() : async [OQ.ManagerScoreRow] {
    OQLib.getManagerScoreboard(accessGrants, demoState, openingQuestions, caller);
  };

  /// Mark several questions final at once (Managing Partner only). Returns how
  /// many were marked final and how many were skipped because they were no
  /// longer ready.
  public shared ({ caller }) func markOpeningQuestionsFinal(ids : [OQ.QuestionId]) : async OQ.BatchFinalResult {
    OQLib.markFinalBatch(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, ids);
  };

  /// One question's history, newest first. Readable only by the Managing
  /// Partner and Admins; every other role is refused.
  public query ({ caller }) func getOpeningQuestionHistory(id : OQ.QuestionId) : async [OQ.QuestionHistoryEntry] {
    OQLib.getQuestionHistory(accessGrants, demoState, openingQuestions, caller, id);
  };

  /// Read the Finish-by date with the computed days left or days overdue.
  public query ({ caller }) func getOpeningQuestionFinishBy() : async OQ.FinishByView {
    OQLib.getFinishBy(accessGrants, demoState, openingQuestions, storeInfo, caller);
  };

  /// Set or clear the Finish-by date (Managing Partner and Admins only).
  public shared ({ caller }) func setOpeningQuestionFinishBy(finishBy : ?Common.DateOnly) : async () {
    OQLib.setFinishBy(accessGrants, demoState, openingQuestions, changeLog, counters, logCounters, caller, finishBy);
  };

  /// Send a nudge to one manager who still has questions needing approval
  /// (Managing Partner and Admins only). Refused when that manager was already
  /// nudged on the current store-local day.
  public shared ({ caller }) func sendOpeningQuestionNudge(manager : Principal) : async () {
    OQLib.sendNudge(accessGrants, demoState, openingQuestions, storeInfo, changeLog, counters, logCounters, caller, manager);
  };

  /// The caller's own nudge alerts, newest first.
  public query ({ caller }) func getMyOpeningQuestionNudges() : async [OQ.NudgeAlert] {
    OQLib.getMyNudges(accessGrants, demoState, openingQuestions, caller);
  };
};
