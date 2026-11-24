import Map "mo:core/Map";
import Common "common";

/// Opening Questions domain types: the TLC B33 opening questions the store's
/// managers review, comment on and approve. Owners are resolved live from the
/// Kitchen Manager, Service Manager and Managing Partner roles, never stored
/// per question.
module {
  /// Identifier for an opening question.
  public type QuestionId = Nat;

  /// Identifier for a suggested change.
  public type SuggestionId = Nat;

  /// Identifier for a comment.
  public type CommentId = Nat;

  /// The area a question belongs to. `#both` means every Kitchen and Service
  /// Manager; `#dan` means the Managing Partner.
  public type QuestionArea = {
    #kitchen;
    #service;
    #both;
    #dan;
  };

  /// The state of a suggested change.
  public type SuggestionState = {
    #open;
    #accepted;
    #declined;
  };

  /// One owner's approval of a question.
  public type Approval = {
    principal : Principal;
    at : Common.Timestamp;
  };

  /// A suggested change to a question's answer, with a 48-hour discussion.
  public type Suggestion = {
    id : SuggestionId;
    author : Principal;
    proposedAnswer : Text;
    note : Text;
    createdAt : Common.Timestamp;
    discussionEndsAt : Common.Timestamp;
    state : SuggestionState;
    decidedBy : ?Principal;
    decidedAt : ?Common.Timestamp;
  };

  /// A comment on a question, or a reply in a suggestion's discussion when
  /// `suggestionId` is set.
  public type Comment = {
    id : CommentId;
    author : Principal;
    text : Text;
    createdAt : Common.Timestamp;
    suggestionId : ?SuggestionId;
  };

  /// The kind of change a history entry records.
  public type QuestionChangeKind = {
    #answerEdited;
    #approved;
    #approvalWithdrawn;
    #markedFinal;
    #reopened;
    #suggestionAccepted;
    #suggestionDeclined;
  };

  /// One entry in a question's history: which question it belongs to, when it
  /// happened, who did it, which kind of change it was, and the old and new
  /// answer text for answer edits (null for every other kind).
  public type QuestionHistoryEntry = {
    id : Nat;
    questionId : QuestionId;
    at : Common.Timestamp;
    by : Principal;
    kind : QuestionChangeKind;
    oldAnswer : ?Text;
    newAnswer : ?Text;
  };

  /// A stored opening question. `comments` and `suggestions` are the stored
  /// discussion; the list view never carries them (see `QuestionView`), and a
  /// question's discussion is loaded on demand by `getOpeningQuestionDiscussion`.
  public type OpeningQuestion = {
    id : QuestionId;
    sectionTitle : Text;
    sectionOrder : Nat;
    number : Nat;
    order : Nat;
    question : Text;
    area : QuestionArea;
    answer : Text;
    approvals : [Approval];
    finalizedBy : ?Principal;
    finalizedAt : ?Common.Timestamp;
    suggestions : [Suggestion];
    comments : [Comment];
    updatedAt : Common.Timestamp;
    updatedBy : Principal;
    isDemo : Bool;
  };

  /// A question's discussion, loaded when its card is opened: the stored
  /// suggestions and comments. The list view carries only their counts.
  public type QuestionDiscussion = {
    questionId : QuestionId;
    suggestions : [Suggestion];
    comments : [Comment];
  };

  /// The daily-email setting for Opening Questions.
  public type EmailSettings = {
    enabled : Bool;
  };

  /// The Opening Questions Finish-by setting: an optional store-local calendar
  /// date (UTC midnight nanoseconds) that the Managing Partner or an Admin sets
  /// or clears. Null means no Finish-by date is shown.
  public type FinishBySettings = {
    finishBy : ?Common.DateOnly;
  };

  /// The Finish-by date as the page reads it: the stored date (null when unset),
  /// the store-local day it falls on, and the computed days left (positive
  /// before the date) or days overdue (positive after it). Both counts are 0 on
  /// the date itself and when no date is set.
  public type FinishByView = {
    finishBy : ?Common.DateOnly;
    daysLeft : Nat;
    daysOverdue : Nat;
  };

  /// One stored nudge: which manager was nudged, who sent it, the store-local
  /// day it was sent (UTC midnight nanoseconds) and the manager's pending count
  /// at that moment. One nudge per manager per store-local day is enforced from
  /// this record. The alert's live count is recomputed from the questions still
  /// waiting on the manager, never read from `pendingCount`.
  public type Nudge = {
    manager : Principal;
    sender : Principal;
    day : Common.DateOnly;
    pendingCount : Nat;
    sentAt : Common.Timestamp;
  };

  /// The nudge alert carried to a manager's Today page and Opening Qs badge:
  /// the sender's display name, how many questions still need the manager's
  /// approval right now (live, not the count at send time), and when it was
  /// sent. An alert is absent once the manager has no questions left waiting.
  public type NudgeAlert = {
    senderName : Text;
    pendingCount : Nat;
    sentAt : Common.Timestamp;
  };

  /// One recipient's daily digest: how many questions need their approval, how
  /// many open discussions they are in, and (Admin only) how many decisions are
  /// due.
  public type DigestEntry = {
    principal : Principal;
    email : Text;
    needsApproval : Nat;
    openDiscussions : Nat;
    decisionsDue : Nat;
  };

  /// The stored state of the daily Opening Questions email: the last send time
  /// and recipient count (for the Admin screen), and the store-local day each
  /// person was last emailed, so a late or repeated run the same store day sends
  /// nothing more to anyone already sent that day.
  public type DailyEmailState = {
    var lastSentAt : ?Common.Timestamp;
    var lastRecipientCount : Nat;
    lastSentDay : Map.Map<Principal, Common.DateOnly>;
  };

  /// The Admin > Opening Questions daily-email status: when the last daily email
  /// went out (null when never sent) and to how many people.
  public type DailyEmailStatus = {
    lastSentAt : ?Common.Timestamp;
    lastRecipientCount : Nat;
  };

  /// A live owner of a question: principal plus display name.
  public type OwnerView = {
    principal : Principal;
    displayName : Text;
  };

  /// A question as the page reads it: the stored record plus the live owner
  /// list, the caller's own approval state and approval date, the owner
  /// approvals, the other approvals shown as Input, whether the question is
  /// final and who marked it, whether every current owner has approved it but
  /// it is not final yet, the open suggestion count and the decision-due flag.
  /// `myApprovedAt` is the caller's own approval timestamp, or null when they
  /// have not approved; it drives the "You approved · <date>" chip on every tab.
  /// The list view carries only discussion counts (`commentCount`,
  /// `replyCount`); the full suggestions and comments load separately through
  /// `getOpeningQuestionDiscussion` when a card is opened.
  public type QuestionView = {
    question : OpeningQuestion;
    owners : [OwnerView];
    myApproved : Bool;
    myApprovedAt : ?Common.Timestamp;
    ownerApprovals : [OwnerView];
    inputApprovals : [OwnerView];
    isFinal : Bool;
    finalizedByAdmin : Bool;
    finalizedByName : ?Text;
    readyForFinal : Bool;
    openSuggestionCount : Nat;
    decisionDue : Bool;
    /// The number of top-level comments on the question (comments with no
    /// `suggestionId`).
    commentCount : Nat;
    /// The number of replies across the question's suggestions (comments with a
    /// `suggestionId`).
    replyCount : Nat;
  };

  /// The progress summary shown on the page. `final` counts only questions the
  /// Managing Partner marked Final; `readyForFinal` counts questions every
  /// owner approved that are not Final yet. `answered` (non-blank answer text)
  /// is kept for compatibility and never drives the Final counts.
  public type ProgressSummary = {
    total : Nat;
    answered : Nat;
    final : Nat;
    readyForFinal : Nat;
    openSuggestions : Nat;
    sections : [SectionProgress];
  };

  /// Per-section progress for the thin progress bars. `final` is the section's
  /// Final count; `answered` is kept for compatibility.
  public type SectionProgress = {
    sectionTitle : Text;
    sectionOrder : Nat;
    total : Nat;
    answered : Nat;
    final : Nat;
  };

  /// The filters the page combines.
  public type QuestionFilter = {
    sectionTitle : ?Text;
    area : ?QuestionArea;
    search : ?Text;
  };

  /// The tabs the page offers. `#myQuestions` lists every question the caller
  /// owns, approved or not, in imported order, and is the default tab for
  /// owners. `#needsMyApproval` lists the questions the caller owns that they
  /// have not approved and that are not Final. `#readyForFinal` is visible to
  /// the Managing Partner only.
  public type QuestionTab = {
    #myQuestions;
    #needsMyApproval;
    #all;
    #decisionDue;
    #final;
    #readyForFinal;
  };

  /// One row of the Managers scoreboard: a current question owner with their
  /// role, how many questions they own right now, how many of those they have
  /// approved, and how many still need their approval. `nudgedToday` is true
  /// when that manager was already nudged on the current store-local day.
  public type ManagerScoreRow = {
    principal : Principal;
    displayName : Text;
    role : Common.Role;
    ownedCount : Nat;
    approvedCount : Nat;
    pendingCount : Nat;
    nudgedToday : Bool;
  };

  /// The result of a batch Mark final request: how many questions were marked
  /// final and how many were skipped because they were no longer ready.
  public type BatchFinalResult = {
    markedCount : Nat;
    skippedCount : Nat;
  };

  /// The caller's Opening Questions alerts and counts. `readyForFinal` is
  /// non-zero only for the Managing Partner.
  public type AlertSummary = {
    needsMyApproval : Nat;
    newSuggestionsOrReplies : Nat;
    decisionsDue : Nat;
    readyForFinal : Nat;
  };

  // --- Import file shape ---

  /// A question as it appears in the import file. `who` and `status` are
  /// optional legacy fields: the importer accepts them when present and
  /// ignores them.
  public type ImportQuestion = {
    number : Nat;
    question : Text;
    category : Text;
    who : ?Text;
    status : ?Text;
    answer : Text;
  };

  /// A section as it appears in the import file.
  public type ImportSection = {
    title : Text;
    questions : [ImportQuestion];
  };

  /// The whole import file.
  public type ImportFile = {
    kind : Text;
    version : Nat;
    title : Text;
    sections : [ImportSection];
  };

  /// The preview shown before an import is confirmed.
  public type ImportPreview = {
    title : Text;
    sectionTitles : [Text];
    questionCount : Nat;
    kitchenCount : Nat;
    serviceCount : Nat;
    bothCount : Nat;
    danCount : Nat;
  };

  /// An import validation error naming the offending section and number.
  public type ImportError = {
    sectionTitle : Text;
    number : ?Nat;
    message : Text;
  };

  /// The result of validating an import file.
  public type ImportValidation = {
    #ok : ImportPreview;
    #err : ImportError;
  };
};
