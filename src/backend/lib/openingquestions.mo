import Map "mo:core/Map";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Runtime "mo:core/Runtime";
import Debug "mo:core/Debug";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import OQ "../types/openingquestions";
import Auth "auth";
import Age "age";
import Clock "clock";
import ChangeLog "changelog";

/// Opening Questions domain logic: reading questions with live owners, the
/// progress summary, answer edits, approvals, final/reopen, suggestions and
/// comments, import and clear, the caller's alerts, and the daily-email
/// setting. Every write is refused while demo mode is on.
module {
  /// The stable state this domain owns.
  public type State = {
    questions : Map.Map<OQ.QuestionId, OQ.OpeningQuestion>;
    emailSettings : { var value : OQ.EmailSettings };
    history : Map.Map<Nat, OQ.QuestionHistoryEntry>;
    finishBy : { var value : OQ.FinishBySettings };
    nudges : Map.Map<Principal, OQ.Nudge>;
  };

  /// The counters this domain owns.
  public type Counters = {
    var nextOpeningQuestionId : Nat;
    var nextSuggestionId : Nat;
    var nextCommentId : Nat;
    var nextQuestionHistoryId : Nat;
  };

  /// The change-log counters, so this module can write entries.
  public type LogCounters = ChangeLog.Counters;

  /// The store info, needed by the effective clock.
  public type StoreInfo = { var value : Store.StoreInfo };

  /// The 48-hour suggestion discussion window, in nanoseconds.
  let discussionWindowNs : Int = 172_800_000_000_000;

  /// Nanoseconds in one day.
  let dayNs : Int = 86_400_000_000_000;

  // --- Internal helpers ---

  /// True when a text has no non-whitespace character.
  func isBlank(text : Text) : Bool {
    text.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })).size() == 0;
  };

  /// True when a question's answer counts as answered: its text is not blank.
  func isAnswered(q : OQ.OpeningQuestion) : Bool {
    not isBlank(q.answer);
  };

  /// True when a question has been marked final.
  func isFinal(q : OQ.OpeningQuestion) : Bool {
    switch (q.finalizedBy) {
      case (?_) { true };
      case null { false };
    };
  };

  /// True when a role is a leader role shown on the Leaders page.
  func isLeaderRole(role : Common.Role) : Bool {
    switch (role) {
      case (#admin) { true };
      case (#managingPartner) { true };
      case (#kitchenManager) { true };
      case (#serviceManager) { true };
      case (#storeManager) { true };
      case (#trainingManager) { true };
      case (#visitingManager) { true };
      case (#trainer) { true };
      case (#leadership) { true };
      case (_) { false };
    };
  };

  /// The display name for a grant: preferred name, else full name, else a role
  /// label.
  func displayName(grant : Access.AccessGrant) : Text {
    switch (grant.staffProfile) {
      case (?p) {
        switch (p.preferredName) {
          case (?preferred) {
            let trimmed = preferred.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() }));
            if (trimmed.size() > 0) { trimmed } else { p.fullName };
          };
          case null { p.fullName };
        };
      };
      case null { roleLabel(grant.role) };
    };
  };

  /// A human label for a role.
  func roleLabel(role : Common.Role) : Text {
    switch (role) {
      case (#admin) { "Admin" };
      case (#managingPartner) { "Managing Partner" };
      case (#kitchenManager) { "Kitchen Manager" };
      case (#serviceManager) { "Service Manager" };
      case (#storeManager) { "Store Manager" };
      case (#trainingManager) { "Training Manager" };
      case (#visitingManager) { "Visiting Manager" };
      case (#trainer) { "Trainer" };
      case (#leadership) { "Leadership" };
      case (#kiosk) { "Kiosk" };
      case (#integration) { "Integration" };
    };
  };

  /// True when a grant is a real (non-demo) leader grant.
  func isRealLeader(grant : Access.AccessGrant) : Bool {
    isLeaderRole(grant.role) and not Auth.isDemoLeader(grant);
  };

  /// The live owners of a question: the Managing Partner for `#dan`, the
  /// Kitchen Manager for `#kitchen`, the Service Manager for `#service`, and
  /// both managers for `#both`. Computed from the current grants, never stored.
  func ownersOf(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    area : OQ.QuestionArea,
  ) : [OQ.OwnerView] {
    accessGrants.values().filter(func(g) = isRealLeader(g) and ownsArea(g.role, area)).map(func(g) {
      { principal = g.principal; displayName = displayName(g) };
    }).toArray();
  };

  /// True when a role owns a question in the given area.
  func ownsArea(role : Common.Role, area : OQ.QuestionArea) : Bool {
    switch (area) {
      case (#kitchen) { role == #kitchenManager };
      case (#service) { role == #serviceManager };
      case (#both) { role == #kitchenManager or role == #serviceManager };
      case (#dan) { role == #managingPartner };
    };
  };

  /// True when a role owns questions in any area (a question owner role).
  func ownsAnyArea(role : Common.Role) : Bool {
    role == #kitchenManager or role == #serviceManager or role == #managingPartner;
  };

  /// True when the caller is one of the question's live owners.
  func isOwner(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    area : OQ.QuestionArea,
  ) : Bool {
    ownersOf(accessGrants, area).any(func(o) = o.principal == caller);
  };

  /// True when the caller may edit a question's answer: an owner or an Admin.
  func canEdit(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
    area : OQ.QuestionArea,
  ) : Bool {
    Auth.isAdmin(accessGrants, demoState, caller) or isOwner(accessGrants, caller, area);
  };

  /// True when the caller has approved a question.
  func hasApproved(q : OQ.OpeningQuestion, caller : Principal) : Bool {
    q.approvals.any(func(a) = a.principal == caller);
  };

  /// The caller's own approval timestamp, or null when they have not approved.
  func myApprovalAt(q : OQ.OpeningQuestion, caller : Principal) : ?Common.Timestamp {
    switch (q.approvals.find(func(a) = a.principal == caller)) {
      case (?a) { ?a.at };
      case null { null };
    };
  };

  /// True when every current owner has approved the question.
  func allOwnersApproved(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    q : OQ.OpeningQuestion,
  ) : Bool {
    let owners = ownersOf(accessGrants, q.area);
    if (owners.size() == 0) {
      return false;
    };
    owners.all(func(o) = hasApproved(q, o.principal));
  };

  /// True when the question is ready for final: every owner approved and it is
  /// not final yet.
  func isReadyForFinal(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    q : OQ.OpeningQuestion,
  ) : Bool {
    not isFinal(q) and allOwnersApproved(accessGrants, q);
  };

  /// The number of open suggestions on a question.
  func openSuggestionCount(q : OQ.OpeningQuestion) : Nat {
    q.suggestions.filter(func(s) = s.state == #open).size();
  };

  /// True when a question has an open suggestion whose discussion has ended and
  /// is awaiting an Admin decision.
  func decisionDue(q : OQ.OpeningQuestion, now : Common.Timestamp) : Bool {
    q.suggestions.any(func(s) = s.state == #open and s.discussionEndsAt <= now);
  };

  /// Build the page view of a question for the caller.
  func toView(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    q : OQ.OpeningQuestion,
    caller : Principal,
    now : Common.Timestamp,
  ) : OQ.QuestionView {
    let owners = ownersOf(accessGrants, q.area);
    let ownerApprovals = owners.filter(func(o) = hasApproved(q, o.principal));
    let inputApprovals = q.approvals.filter(func(a) = not owners.any(func(o) = o.principal == a.principal)).map(func(a) {
      { principal = a.principal; displayName = principalName(accessGrants, a.principal) };
    });
    let finalizedByName = switch (q.finalizedBy) {
      case (?p) { ?principalName(accessGrants, p) };
      case null { null };
    };
    {
      question = q;
      owners;
      myApproved = hasApproved(q, caller);
      myApprovedAt = myApprovalAt(q, caller);
      ownerApprovals;
      inputApprovals;
      isFinal = isFinal(q);
      finalizedByAdmin = switch (q.finalizedBy) {
        case (?p) {
          switch (Auth.realRole(accessGrants, p)) {
            case (?role) { Auth.roleHasAdminRights(role) };
            case null { false };
          };
        };
        case null { false };
      };
      finalizedByName;
      readyForFinal = isReadyForFinal(accessGrants, q);
      openSuggestionCount = openSuggestionCount(q);
      decisionDue = decisionDue(q, now);
    };
  };

  /// The display name of a principal from their grant, or a short principal
  /// label when they hold none.
  func principalName(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    p : Principal,
  ) : Text {
    switch (accessGrants.get(p)) {
      case (?g) { displayName(g) };
      case null { p.toText() };
    };
  };

  /// True when the caller may read the section: any readable role except
  /// Integration.
  func requireSectionReader(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Common.Role {
    let role = Auth.requireReadable(accessGrants, demoState, caller);
    if (role == #integration) {
      Runtime.trap("Access denied: Integration role may not read Opening Questions");
    };
    role;
  };

  /// Refuse every write while demo mode is on.
  func requireRealWrite(demoState : Common.DemoState) : () {
    if (Auth.demoActive(demoState)) {
      Runtime.trap("Turn off demo mode to change Opening Questions");
    };
  };

  /// The stored question, or a trap when it does not exist.
  func requireQuestion(state : State, id : OQ.QuestionId) : OQ.OpeningQuestion {
    state.questions.get(id) ?? Runtime.trap("Opening question not found");
  };

  /// Replace a stored question.
  func put(state : State, q : OQ.OpeningQuestion) : () {
    state.questions.add(q.id, q);
  };

  /// The effective clock for this domain.
  func nowOf(demoState : Common.DemoState, storeInfo : StoreInfo) : Common.Timestamp {
    Clock.effectiveNow(demoState, storeInfo.value);
  };

  /// Append one history entry for a question. Called by every recorded write so
  /// the History popup can list answer edits, approvals, unapprovals, Mark
  /// final, Reopen and accepted or declined suggestions.
  public func recordHistory(
    state : State,
    counters : Counters,
    questionId : OQ.QuestionId,
    by : Principal,
    kind : OQ.QuestionChangeKind,
    oldAnswer : ?Text,
    newAnswer : ?Text,
  ) : () {
    let id = counters.nextQuestionHistoryId;
    counters.nextQuestionHistoryId := id + 1;
    let entry : OQ.QuestionHistoryEntry = {
      id;
      questionId;
      at = Time.now();
      by;
      kind;
      oldAnswer;
      newAnswer;
    };
    state.history.add(id, entry);
  };

  /// List questions for a tab, applying the combined filters.
  public func listQuestions(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    storeInfo : StoreInfo,
    caller : Principal,
    tab : OQ.QuestionTab,
    filter : OQ.QuestionFilter,
  ) : [OQ.QuestionView] {
    ignore requireSectionReader(accessGrants, demoState, caller);
    let now = nowOf(demoState, storeInfo);
    let isMp = Auth.isManagingPartner(accessGrants, demoState, caller);
    let search = switch (filter.search) {
      case (?s) {
        let trimmed = s.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() }));
        if (trimmed.size() == 0) { null } else { ?trimmed.toLower() };
      };
      case null { null };
    };
    state.questions.values().filter(func(q) {
      let tabOk = switch (tab) {
        case (#myQuestions) { isOwner(accessGrants, caller, q.area) };
        case (#needsMyApproval) { isOwner(accessGrants, caller, q.area) and not hasApproved(q, caller) and not isFinal(q) };
        case (#all) { true };
        case (#decisionDue) { decisionDue(q, now) };
        case (#final) { isFinal(q) };
        case (#readyForFinal) { isMp and isReadyForFinal(accessGrants, q) };
      };
      let sectionOk = switch (filter.sectionTitle) {
        case (?title) { q.sectionTitle == title };
        case null { true };
      };
      let areaOk = switch (filter.area) {
        case (?area) { q.area == area };
        case null { true };
      };
      let searchOk = switch (search) {
        case (?term) {
          q.question.toLower().contains(#text term) or q.answer.toLower().contains(#text term);
        };
        case null { true };
      };
      tabOk and sectionOk and areaOk and searchOk;
    }).map(func(q) = toView(accessGrants, q, caller, now)).toArray();
  };

  /// The caller's own pending-approval count: the questions they own that they
  /// have not approved and that are not Final. Drives the Needs my approval
  /// tab badge.
  public func getMyPendingApprovalCount(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
  ) : Nat {
    ignore requireSectionReader(accessGrants, demoState, caller);
    state.questions.values().filter(func(q) {
      isOwner(accessGrants, caller, q.area) and not hasApproved(q, caller) and not isFinal(q);
    }).size();
  };

  /// The progress summary: Final (Managing Partner marked) and Ready for final
  /// counts plus per-section Final progress. Answer text never counts as Final.
  public func getProgress(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
  ) : OQ.ProgressSummary {
    ignore requireSectionReader(accessGrants, demoState, caller);
    let all = state.questions.values().toArray();
    let total = all.size();
    let answered = all.filter(func(q) = isAnswered(q)).size();
    let final = all.filter(func(q) = isFinal(q)).size();
    let readyForFinal = all.filter(func(q) = isReadyForFinal(accessGrants, q)).size();
    let openSuggestions = all.foldLeft(0, func(acc, q) = acc + openSuggestionCount(q));

    // Group sections by title, preserving first-seen order.
    let titles = all.map(func(q) = q.sectionTitle);
    let seen = Map.empty<Text, Nat>();
    let sections = titles.filter(func(title) {
      if (seen.containsKey(title)) {
        false;
      } else {
        seen.add(title, 0);
        true;
      };
    }).map(func(title) {
      let inSection = all.filter(func(q) = q.sectionTitle == title);
      let sectionOrder = switch (inSection.find(func(q) = q.sectionTitle == title)) {
        case (?q) { q.sectionOrder };
        case null { 0 };
      };
      {
        sectionTitle = title;
        sectionOrder;
        total = inSection.size();
        answered = inSection.filter(func(q) = isAnswered(q)).size();
        final = inSection.filter(func(q) = isFinal(q)).size();
      };
    });
    {
      total;
      answered;
      final;
      readyForFinal;
      openSuggestions;
      sections;
    };
  };

  /// Save a question's answer; changing the text clears its approvals.
  public func saveAnswer(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
    answer : Text,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    if (not canEdit(accessGrants, demoState, caller, q.area)) {
      Runtime.trap("Access denied: only an owner or Admin may edit this answer");
    };
    let changed = q.answer != answer;
    let updated : OQ.OpeningQuestion = {
      q with
      answer;
      approvals = if (changed) { [] } else { q.approvals };
      updatedAt = Time.now();
      updatedBy = caller;
    };
    put(state, updated);
    if (changed) {
      recordHistory(state, counters, id, caller, #answerEdited, ?q.answer, ?answer);
    };
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.answerSaved", null, false, "Question " # id.toText() # " answer saved");
  };

  /// Tick the caller's own Approved box. Refused while the question is Final;
  /// the Managing Partner must reopen it first.
  public func approve(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    if (not isOwner(accessGrants, caller, q.area)) {
      Runtime.trap("Access denied: only a question owner may approve");
    };
    if (isFinal(q)) {
      Runtime.trap("This question is Final; reopen it to change approvals");
    };
    if (hasApproved(q, caller)) {
      return;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      approvals = q.approvals.concat([{ principal = caller; at = Time.now() }]);
      updatedAt = Time.now();
      updatedBy = caller;
    };
    put(state, updated);
    recordHistory(state, counters, id, caller, #approved, null, null);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.approved", null, false, "Question " # id.toText() # " approved");
  };

  /// Withdraw the caller's own approval. Only the caller's own approval can be
  /// removed, and only while the question is not Final. Removing it returns the
  /// question to the caller's Needs my approval tab and drops it out of Ready
  /// for final.
  public func withdrawApproval(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    if (isFinal(q)) {
      Runtime.trap("This question is Final; reopen it to change approvals");
    };
    if (not hasApproved(q, caller)) {
      return;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      approvals = q.approvals.filter(func(a) = a.principal != caller);
      updatedAt = Time.now();
      updatedBy = caller;
    };
    put(state, updated);
    recordHistory(state, counters, id, caller, #approvalWithdrawn, null, null);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.approvalWithdrawn", null, false, "Question " # id.toText() # " approval withdrawn");
  };

  /// Mark a question final (Managing Partner only, works anytime).
  public func markFinal(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireManagingPartner(accessGrants, demoState, caller);
    let q = requireQuestion(state, id);
    if (isFinal(q)) {
      return;
    };
    let now = Time.now();
    let updated : OQ.OpeningQuestion = {
      q with
      finalizedBy = ?caller;
      finalizedAt = ?now;
      updatedAt = now;
      updatedBy = caller;
    };
    put(state, updated);
    recordHistory(state, counters, id, caller, #markedFinal, null, null);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.markedFinal", null, false, "Question " # id.toText() # " marked final");
  };

  /// Reopen a final question (Managing Partner only). Clears the final mark and
  /// keeps the answer and discussion.
  public func reopen(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireManagingPartner(accessGrants, demoState, caller);
    let q = requireQuestion(state, id);
    if (not isFinal(q)) {
      return;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      finalizedBy = null;
      finalizedAt = null;
      updatedAt = Time.now();
      updatedBy = caller;
    };
    put(state, updated);
    recordHistory(state, counters, id, caller, #reopened, null, null);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.reopened", null, false, "Question " # id.toText() # " reopened");
  };

  /// Post a suggested change, opening a 48-hour discussion.
  public func postSuggestion(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
    proposedAnswer : Text,
    note : Text,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    let now = Time.now();
    let suggestionId = counters.nextSuggestionId;
    counters.nextSuggestionId := suggestionId + 1;
    let suggestion : OQ.Suggestion = {
      id = suggestionId;
      author = caller;
      proposedAnswer;
      note;
      createdAt = now;
      discussionEndsAt = now + discussionWindowNs;
      state = #open;
      decidedBy = null;
      decidedAt = null;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      suggestions = q.suggestions.concat([suggestion]);
      updatedAt = now;
      updatedBy = caller;
    };
    put(state, updated);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.suggestionPosted", null, false, "Question " # id.toText() # " suggestion posted");
  };

  /// Reply in a suggestion's discussion.
  public func replyToSuggestion(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
    suggestionId : OQ.SuggestionId,
    text : Text,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    if (not q.suggestions.any(func(s) = s.id == suggestionId)) {
      Runtime.trap("Suggestion not found");
    };
    let now = Time.now();
    let commentId = counters.nextCommentId;
    counters.nextCommentId := commentId + 1;
    let comment : OQ.Comment = {
      id = commentId;
      author = caller;
      text;
      createdAt = now;
      suggestionId = ?suggestionId;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      comments = q.comments.concat([comment]);
      updatedAt = now;
      updatedBy = caller;
    };
    put(state, updated);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.suggestionReply", null, false, "Question " # id.toText() # " suggestion reply");
  };

  /// Post a comment on a question.
  public func postComment(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
    text : Text,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    let q = requireQuestion(state, id);
    let now = Time.now();
    let commentId = counters.nextCommentId;
    counters.nextCommentId := commentId + 1;
    let comment : OQ.Comment = {
      id = commentId;
      author = caller;
      text;
      createdAt = now;
      suggestionId = null;
    };
    let updated : OQ.OpeningQuestion = {
      q with
      comments = q.comments.concat([comment]);
      updatedAt = now;
      updatedBy = caller;
    };
    put(state, updated);
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.commentPosted", null, false, "Question " # id.toText() # " comment posted");
  };

  /// Accept or decline a suggestion (Admin only).
  public func decideSuggestion(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    id : OQ.QuestionId,
    suggestionId : OQ.SuggestionId,
    accept : Bool,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireAdmin(accessGrants, demoState, caller);
    let q = requireQuestion(state, id);
    let now = Time.now();
    var found = false;
    let suggestions = q.suggestions.map(func(s) {
      if (s.id == suggestionId and s.state == #open) {
        found := true;
        {
          s with
          state = if (accept) { #accepted } else { #declined };
          decidedBy = ?caller;
          decidedAt = ?now;
        };
      } else {
        s;
      };
    });
    if (not found) {
      Runtime.trap("Suggestion not found or already decided");
    };
    let updated : OQ.OpeningQuestion = {
      q with
      suggestions;
      answer = if (accept) {
        switch (q.suggestions.find(func(s) = s.id == suggestionId)) {
          case (?s) { s.proposedAnswer };
          case null { q.answer };
        };
      } else { q.answer };
      approvals = if (accept) { [] } else { q.approvals };
      updatedAt = now;
      updatedBy = caller;
    };
    put(state, updated);
    if (accept) {
      let newAnswer = switch (q.suggestions.find(func(s) = s.id == suggestionId)) {
        case (?s) { ?s.proposedAnswer };
        case null { null };
      };
      recordHistory(state, counters, id, caller, #suggestionAccepted, ?q.answer, newAnswer);
    } else {
      recordHistory(state, counters, id, caller, #suggestionDeclined, null, null);
    };
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.suggestionDecided", null, false, "Question " # id.toText() # " suggestion " # (if accept { "accepted" } else { "declined" }));
  };

  /// Validate an import file and build its preview. `who` and `status` are
  /// ignored when present.
  func validateImport(file : OQ.ImportFile) : OQ.ImportValidation {
    if (file.kind != "openingQuestions") {
      return #err({ sectionTitle = ""; number = null; message = "Unrecognized file kind" });
    };
    if (file.sections.size() == 0) {
      return #err({ sectionTitle = ""; number = null; message = "The file has no sections" });
    };
    var questionCount = 0;
    var kitchenCount = 0;
    var serviceCount = 0;
    var bothCount = 0;
    var danCount = 0;
    var error : ?OQ.ImportError = null;
    for (section in file.sections.values()) {
      if (isBlank(section.title)) {
        error := ?{ sectionTitle = section.title; number = null; message = "Section title is required" };
      };
      for (q in section.questions.values()) {
        if (isBlank(q.question)) {
          error := ?{ sectionTitle = section.title; number = ?q.number; message = "Question text is required" };
        };
        questionCount += 1;
        switch (areaOfCategory(q.category)) {
          case (?#kitchen) { kitchenCount += 1 };
          case (?#service) { serviceCount += 1 };
          case (?#both) { bothCount += 1 };
          case (?#dan) { danCount += 1 };
          case (null) {
            error := ?{ sectionTitle = section.title; number = ?q.number; message = "Unknown category: " # q.category };
          };
        };
      };
    };
    switch (error) {
      case (?e) { #err(e) };
      case null {
        #ok({
          title = file.title;
          sectionTitles = file.sections.map(func(s) = s.title);
          questionCount;
          kitchenCount;
          serviceCount;
          bothCount;
          danCount;
        });
      };
    };
  };

  /// Map an import category label to a question area, or null when the label is
  /// not one of the known categories.
  func areaOfCategory(category : Text) : ?OQ.QuestionArea {
    switch (category.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })).toLower()) {
      case ("kitchen") { ?#kitchen };
      case ("service") { ?#service };
      case ("both") { ?#both };
      case ("dan") { ?#dan };
      case (_) { null };
    };
  };

  /// Import questions from a validated file (Admin only, only when none exist).
  public func importQuestions(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    file : OQ.ImportFile,
  ) : OQ.ImportValidation {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireAdmin(accessGrants, demoState, caller);
    if (state.questions.size() > 0) {
      return #err({ sectionTitle = ""; number = null; message = "Questions already exist; clear them before importing" });
    };
    switch (validateImport(file)) {
      case (#err(e)) { #err(e) };
      case (#ok(preview)) {
        let now = Time.now();
        var sectionOrder = 0;
        for (section in file.sections.values()) {
          var order = 0;
          for (q in section.questions.values()) {
            let id = counters.nextOpeningQuestionId;
            counters.nextOpeningQuestionId := id + 1;
            let question : OQ.OpeningQuestion = {
              id;
              sectionTitle = section.title;
              sectionOrder;
              number = q.number;
              order;
              question = q.question;
              area = areaOfCategory(q.category) ?? Runtime.trap("Unknown category: " # q.category);
              answer = q.answer;
              approvals = [];
              finalizedBy = null;
              finalizedAt = null;
              suggestions = [];
              comments = [];
              updatedAt = now;
              updatedBy = caller;
              isDemo = false;
            };
            state.questions.add(id, question);
            order += 1;
          };
          sectionOrder += 1;
        };
        ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.imported", null, false, "Imported " # preview.questionCount.toText() # " questions");
        #ok(preview);
      };
    };
  };

  /// Clear all questions (Admin only, `confirm` must be "CLEAR").
  public func clearAll(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    _counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    confirm : Text,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireAdmin(accessGrants, demoState, caller);
    if (confirm != "CLEAR") {
      Runtime.trap("Type CLEAR to confirm");
    };
    let count = state.questions.size();
    state.questions.clear();
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.cleared", null, false, "Cleared " # count.toText() # " questions");
  };

  /// The caller's Opening Questions alerts and counts.
  public func getAlerts(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    storeInfo : StoreInfo,
    caller : Principal,
  ) : OQ.AlertSummary {
    ignore requireSectionReader(accessGrants, demoState, caller);
    let now = nowOf(demoState, storeInfo);
    let all = state.questions.values().toArray();
    let needsMyApproval = all.filter(func(q) = isOwner(accessGrants, caller, q.area) and not hasApproved(q, caller) and not isFinal(q)).size();
    let newSuggestionsOrReplies = all.filter(func(q) {
      q.suggestions.any(func(s) = s.state == #open and s.author != caller)
    }).size();
    let decisionsDue = all.filter(func(q) = decisionDue(q, now)).size();
    let readyForFinal = if (Auth.isManagingPartner(accessGrants, demoState, caller)) {
      all.filter(func(q) = isReadyForFinal(accessGrants, q)).size();
    } else { 0 };
    {
      needsMyApproval;
      newSuggestionsOrReplies;
      decisionsDue;
      readyForFinal;
    };
  };

  /// Read the daily-email setting (Admin only).
  public func getEmailSettings(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
  ) : OQ.EmailSettings {
    ignore requireSectionReader(accessGrants, demoState, caller);
    Auth.requireAdmin(accessGrants, demoState, caller);
    state.emailSettings.value;
  };

  /// Update the daily-email setting (Admin only).
  public func updateEmailSettings(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    _counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    settings : OQ.EmailSettings,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireAdmin(accessGrants, demoState, caller);
    state.emailSettings.value := settings;
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.emailSettingsUpdated", null, false, "Daily email " # (if settings.enabled { "enabled" } else { "disabled" }));
  };

  /// The Managers scoreboard: one row per current question owner (Kitchen
  /// Managers, Service Managers and the Managing Partner), derived from the
  /// live ownership rules, sorted by most questions still needing approval
  /// first with a stable tiebreak. Readable only by the Managing Partner and
  /// Admins; every other role is refused.
  public func getManagerScoreboard(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
  ) : [OQ.ManagerScoreRow] {
    ignore requireSectionReader(accessGrants, demoState, caller);
    if (not Auth.isAdmin(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: only the Managing Partner or an Admin may read the Managers scoreboard");
    };
    let all = state.questions.values().toArray();
    let rows = accessGrants.values().filter(func(g) = isRealLeader(g) and ownsAnyArea(g.role)).map(func(g) {
      let owned = all.filter(func(q) = ownsArea(g.role, q.area));
      let approved = owned.filter(func(q) = hasApproved(q, g.principal));
      let pending = owned.filter(func(q) = not hasApproved(q, g.principal) and not isFinal(q));
      {
        principal = g.principal;
        displayName = displayName(g);
        role = g.role;
        ownedCount = owned.size();
        approvedCount = approved.size();
        pendingCount = pending.size();
      };
    }).toArray();
    rows.sort(func(a, b) {
      if (a.pendingCount > b.pendingCount) {
        #less;
      } else if (a.pendingCount < b.pendingCount) {
        #greater;
      } else if (a.displayName < b.displayName) {
        #less;
      } else if (a.displayName > b.displayName) {
        #greater;
      } else {
        Principal.compare(a.principal, b.principal);
      };
    });
  };

  /// Mark several questions final at once (Managing Partner only). Each question
  /// that is still ready for final is marked final with one History and one
  /// change-log entry, exactly as single Mark final does; a question that is
  /// already Final or no longer has every owner's approval is skipped.
  public func markFinalBatch(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    ids : [OQ.QuestionId],
  ) : OQ.BatchFinalResult {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    Auth.requireManagingPartner(accessGrants, demoState, caller);
    var marked = 0;
    var skipped = 0;
    for (id in ids.values()) {
      switch (state.questions.get(id)) {
        case (?q) {
          if (isReadyForFinal(accessGrants, q)) {
            let now = Time.now();
            let updated : OQ.OpeningQuestion = {
              q with
              finalizedBy = ?caller;
              finalizedAt = ?now;
              updatedAt = now;
              updatedBy = caller;
            };
            put(state, updated);
            recordHistory(state, counters, id, caller, #markedFinal, null, null);
            ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.markedFinal", null, false, "Question " # id.toText() # " marked final");
            marked += 1;
          } else {
            skipped += 1;
          };
        };
        case null { skipped += 1 };
      };
    };
    { markedCount = marked; skippedCount = skipped };
  };

  /// One question's history, newest first. Readable only by the Managing
  /// Partner and Admins; every other role is refused.
  public func getQuestionHistory(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
    id : OQ.QuestionId,
  ) : [OQ.QuestionHistoryEntry] {
    ignore requireSectionReader(accessGrants, demoState, caller);
    if (not Auth.isAdmin(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: only the Managing Partner or an Admin may read question history");
    };
    state.history.values().filter(func(e) = e.questionId == id).toArray().sort(func(a, b) {
      if (a.at > b.at) { #less } else if (a.at < b.at) { #greater } else if (a.id > b.id) { #less } else if (a.id < b.id) { #greater } else { #equal };
    });
  };

  /// Read the Finish-by date with the computed days left or days overdue for the
  /// caller, using the store-local calendar day.
  public func getFinishBy(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    storeInfo : StoreInfo,
    caller : Principal,
  ) : OQ.FinishByView {
    ignore requireSectionReader(accessGrants, demoState, caller);
    switch (state.finishBy.value.finishBy) {
      case null { { finishBy = null; daysLeft = 0; daysOverdue = 0 } };
      case (?day) {
        let now = nowOf(demoState, storeInfo);
        let today = Clock.localDayStart(now, storeInfo.value.timeZone);
        let target = Age.localMidnightOfDate(day, storeInfo.value.timeZone);
        let diffDays = (target - today) / dayNs;
        let daysLeft = if (diffDays > 0) { Int.abs(diffDays) } else { 0 };
        let daysOverdue = if (diffDays < 0) { Int.abs(diffDays) } else { 0 };
        { finishBy = ?day; daysLeft; daysOverdue };
      };
    };
  };

  /// Set or clear the Finish-by date (Managing Partner and Admins only).
  public func setFinishBy(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    finishBy : ?Common.DateOnly,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    if (not Auth.isAdmin(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: only the Managing Partner or an Admin may set the Finish-by date");
    };
    state.finishBy.value := { finishBy };
    let detail = switch (finishBy) {
      case (?day) { "Finish-by date set to " # day.toText() };
      case null { "Finish-by date cleared" };
    };
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.finishByUpdated", null, false, detail);
  };

  /// Send a nudge to one manager who still has questions needing approval
  /// (Managing Partner and Admins only). Refused when that manager was already
  /// nudged on the current store-local day.
  public func sendNudge(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    storeInfo : StoreInfo,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    logCounters : LogCounters,
    caller : Principal,
    manager : Principal,
  ) : () {
    ignore requireSectionReader(accessGrants, demoState, caller);
    requireRealWrite(demoState);
    if (not Auth.isAdmin(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: only the Managing Partner or an Admin may send a nudge");
    };
    if (not ownsAnyArea(switch (Auth.realRole(accessGrants, manager)) { case (?r) { r }; case null { #kiosk } })) {
      Runtime.trap("Access denied: that person does not own Opening Questions");
    };
    let pending = state.questions.values().filter(func(q) {
      ownsArea(switch (Auth.realRole(accessGrants, manager)) { case (?r) { r }; case null { #kiosk } }, q.area)
        and not hasApproved(q, manager)
        and not isFinal(q);
    }).size();
    if (pending == 0) {
      Runtime.trap("That manager has no questions needing approval");
    };
    let now = nowOf(demoState, storeInfo);
    let today = Clock.localDayStart(now, storeInfo.value.timeZone);
    switch (state.nudges.get(manager)) {
      case (?existing) {
        if (Clock.localDayStart(existing.sentAt, storeInfo.value.timeZone) == today) {
          Runtime.trap("That manager was already nudged today");
        };
      };
      case null {};
    };
    state.nudges.add(manager, {
      manager;
      sender = caller;
      day = today;
      pendingCount = pending;
      sentAt = now;
    });
    ignore ChangeLog.record(changeLog, logCounters, caller, "openingQuestion.nudgeSent", null, false, "Nudged " # principalName(accessGrants, manager) # " about " # pending.toText() # " questions");
  };

  /// The caller's own nudge alerts, newest first.
  public func getMyNudges(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    state : State,
    caller : Principal,
  ) : [OQ.NudgeAlert] {
    ignore requireSectionReader(accessGrants, demoState, caller);
    switch (state.nudges.get(caller)) {
      case null { [] };
      case (?n) {
        [{
          senderName = principalName(accessGrants, n.sender);
          pendingCount = n.pendingCount;
          sentAt = n.sentAt;
        }];
      };
    };
  };
};
