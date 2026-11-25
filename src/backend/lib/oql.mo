import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Store "../types/store";
import Roadie "../types/roadie";
import Signup "../types/signup";
import Access "../types/access";
import Phase23 "../types/phase23";
import OpeningQuestions "../types/openingquestions";
import CrewEvents "../types/crewevents";
import OqlTypes "../types/oql";
import Auth "auth";

/// Read-only OQL row builders and per-entity visibility rules. Every rule
/// resolves the caller's REAL, non-expired role from the app's access grants
/// (never a demo role), so a demo impersonation can never widen real data.
/// Kiosk, Integration, unregistered, expired and anonymous callers get no rows.
///
/// Each builder returns `?Row`: null when the caller may not see that row. The
/// entity's `canSee` rule is then a plain equality between the row's `owner`
/// column and the query subject, so a row the builder withheld (null) never
/// reaches the caller. The `owner` column is always the caller the rule was
/// evaluated against.
module {
  /// The roles that may read the roster-wide manager tables: Admin, Managing
  /// Partner, Store Manager, Training Manager, Kitchen Manager, Service
  /// Manager.
  func isManagerReader(role : Common.Role) : Bool {
    Auth.roleHasAdminRights(role)
      or role == #storeManager
      or role == #trainingManager
      or role == #kitchenManager
      or role == #serviceManager;
  };

  /// The roles that may read the roster at all (any role except Kiosk and
  /// Integration).
  func isRosterReader(role : Common.Role) : Bool {
    role != #kiosk and role != #integration;
  };

  /// The caller's real, non-expired role, or null when unregistered, expired
  /// or anonymous.
  func realRole(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : ?Common.Role {
    Auth.realRole(accessGrants, caller);
  };

  /// True when the caller's real role is one of the roster-wide manager roles.
  public func canSeeManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) { isManagerReader(role) };
      case null { false };
    };
  };

  /// True when the caller's real role may read the roster (not Kiosk or
  /// Integration).
  public func canSeeRoster(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) { isRosterReader(role) };
      case null { false };
    };
  };

  /// True when the caller's real role may read Opening Questions.
  public func canSeeOpeningQuestions(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) { Auth.roleCanReadOpeningQuestions(role) };
      case null { false };
    };
  };

  /// The trainer stations for a caller's real grant (empty for every other
  /// role).
  func realTrainerStations(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : [Common.PositionId] {
    switch (accessGrants.get(caller)) {
      case (?grant) { grant.trainerPositionIds };
      case null { [] };
    };
  };

  /// True when a roadie is visible to the caller's real role: a manager reader
  /// sees every roadie; a Trainer sees only roadies whose main or second
  /// position is one of their stations (a Trainer with no stations sees none);
  /// every other roster reader sees every roadie.
  public func canSeeRoadie(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) {
        if (isManagerReader(role)) {
          return true;
        };
        if (role == #trainer) {
          let stations = realTrainerStations(accessGrants, caller);
          return stations.any(func(pid) =
            pid == roadie.mainPositionId or roadie.secondPositionId == ?pid
          );
        };
        isRosterReader(role);
      };
      case null { false };
    };
  };

  /// True when the caller may read one roadie's event answer: a crew leader
  /// sees only roadies in their own crew; every other roster reader sees every
  /// crewed roadie.
  public func canSeeEventAnswer(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) {
        if (not isRosterReader(role)) {
          return false;
        };
        let leadsOwnCrew = crews.values().any(func(c) = c.leaderPrincipal == ?caller);
        if (not leadsOwnCrew) {
          return true;
        };
        switch (roadie.crewId) {
          case (?cid) {
            switch (crews.get(cid)) {
              case (?c) { c.leaderPrincipal == ?caller };
              case null { false };
            };
          };
          case null { false };
        };
      };
      case null { false };
    };
  };

  /// The display name for a roadie (preferred name when set).
  func displayName(roadie : Roadie.Roadie) : Text {
    switch (roadie.profile.preferredName) {
      case (?p) { if (p.size() > 0) { p } else { roadie.profile.name } };
      case null { roadie.profile.name };
    };
  };

  /// The display name for a principal from their access grant's staff profile.
  func principalName(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    p : Principal,
  ) : Text {
    switch (accessGrants.get(p)) {
      case (?grant) {
        switch (grant.staffProfile) {
          case (?sp) {
            switch (sp.preferredName) {
              case (?pn) { if (pn.size() > 0) { pn } else { sp.fullName } };
              case null { sp.fullName };
            };
          };
          case null { p.toText() };
        };
      };
      case null { p.toText() };
    };
  };

  /// The status label for a roadie.
  func statusText(status : Roadie.RoadieStatus) : Text {
    switch (status) {
      case (#hired) "hired";
      case (#paperworkDone) "paperworkDone";
      case (#oriented) "oriented";
      case (#inTraining) "inTraining";
      case (#certified) "certified";
      case (#needsMoreTime) "needsMoreTime";
      case (#active) "active";
      case (#archived) "archived";
    };
  };

  /// The final sign-off outcome label for a roadie, or null when none.
  func finalOutcome(
    finalSignOffs : Map.Map<Common.RoadieId, Phase23.FinalSignOff>,
    roadieId : Common.RoadieId,
  ) : ?Text {
    switch (finalSignOffs.get(roadieId)) {
      case (?s) {
        switch (s.outcome) {
          case (#certified) { ?"certified" };
          case (#needsMoreTime(_)) { ?"needsMoreTime" };
        };
      };
      case null { null };
    };
  };

  /// Build one roadie row for `caller`, or null when the caller may not see it.
  public func roadieRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    finalSignOffs : Map.Map<Common.RoadieId, Phase23.FinalSignOff>,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : ?OqlTypes.RoadieRow {
    if (not canSeeRoadie(accessGrants, caller, roadie)) {
      return null;
    };
    ?{
      id = roadie.id;
      owner = caller;
      name = displayName(roadie);
      mainPositionId = roadie.mainPositionId;
      secondPositionId = roadie.secondPositionId;
      status = statusText(roadie.status);
      crewId = roadie.crewId;
      orientationEventId = roadie.orientationEventId;
      paperworkDone = roadie.status != #hired and roadie.status != #archived;
      paperworkStep = roadie.paperworkStep;
      shirtSize = roadie.profile.shirtSize;
      hatSize = roadie.profile.hatSize;
      finalOutcome = finalOutcome(finalSignOffs, roadie.id);
      archived = roadie.status == #archived;
      isDemo = roadie.isDemo;
    };
  };

  /// Build one position row with its on-hand count (pending + active roadies
  /// whose main position is this one, archived excluded), or null when the
  /// caller may not read it.
  public func positionRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    caller : Principal,
    position : Store.Position,
  ) : ?OqlTypes.PositionRow {
    if (not canSeeManager(accessGrants, caller)) {
      return null;
    };
    let onHand = roadies.values()
      .filter(func(r) = r.isDemo == demo and r.status != #archived and r.mainPositionId == position.id)
      .size();
    ?{
      id = position.id;
      owner = caller;
      name = position.name;
      openingBuildTo = position.openingBuildTo;
      afterOpeningBuildTo = position.afterOpeningBuildTo;
      onHand;
    };
  };

  /// Build one pending sign-up row, or null when the caller may not read it.
  public func pendingSignupRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    signup : Signup.SignupSubmission,
  ) : ?OqlTypes.PendingSignupRow {
    if (not canSeeManager(accessGrants, caller)) {
      return null;
    };
    ?{
      id = signup.id;
      owner = caller;
      name = signup.profile.name;
      positionAppliedFor = signup.profile.positionAppliedFor;
      submittedAt = signup.submittedAt;
      isDemo = signup.isDemo;
    };
  };

  /// Build one orientation session row, or null when the caller may not read
  /// it.
  public func orientationSessionRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    event : Store.ScheduleEvent,
  ) : ?OqlTypes.OrientationSessionRow {
    if (not canSeeManager(accessGrants, caller)) {
      return null;
    };
    ?{
      id = event.id;
      owner = caller;
      name = event.name;
      start = event.start;
    };
  };

  /// Build one attendance row, or null when the caller may not read it.
  public func attendanceRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    id : Nat,
    record : Phase23.AttendanceRecord,
  ) : ?OqlTypes.AttendanceRow {
    if (not canSeeManager(accessGrants, caller)) {
      return null;
    };
    ?{
      id;
      owner = caller;
      roadieId = record.roadieId;
      eventId = record.eventId;
      present = record.state == #present;
      isDemo = record.isDemo;
    };
  };

  /// Build one opening question row, or null when the caller may not read it.
  public func openingQuestionRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    question : OpeningQuestions.OpeningQuestion,
  ) : ?OqlTypes.OpeningQuestionRow {
    if (not canSeeOpeningQuestions(accessGrants, caller)) {
      return null;
    };
    ?{
      id = question.id;
      owner = caller;
      sectionTitle = question.sectionTitle;
      area = switch (question.area) {
        case (#kitchen) "kitchen";
        case (#service) "service";
        case (#both) "both";
        case (#dan) "dan";
      };
      question = question.question;
      answer = question.answer;
      final = question.finalizedBy != null;
      readyForFinal = question.finalizedBy == null and question.approvals.size() > 0;
      approvalCount = question.approvals.size();
    };
  };

  /// Build one crew event row, or null when the caller may not read it.
  public func crewEventRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    event : CrewEvents.CrewEvent,
  ) : ?OqlTypes.CrewEventRow {
    if (not canSeeRoster(accessGrants, caller)) {
      return null;
    };
    ?{
      id = event.id;
      owner = caller;
      name = event.name;
      start = event.start;
      place = event.place;
      cancelled = event.cancelled;
      isDemo = event.isDemo;
    };
  };

  /// Build one event answer row, or null when the caller may not read it.
  public func eventAnswerRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    caller : Principal,
    key : Text,
    invite : CrewEvents.EventInvite,
  ) : ?OqlTypes.EventAnswerRow {
    let roadie = switch (roadies.get(invite.roadieId)) {
      case (?r) { r };
      case null { return null };
    };
    if (not canSeeEventAnswer(accessGrants, crews, caller, roadie)) {
      return null;
    };
    ?{
      key;
      owner = caller;
      eventId = invite.eventId;
      roadieId = invite.roadieId;
      answer = switch (invite.answer) {
        case (#going) "going";
        case (#cantGo) "cantGo";
        case (#noAnswer) "noAnswer";
      };
      attendance = switch (invite.attendance) {
        case (#yes) "yes";
        case (#no) "no";
        case (#notMarked) "notMarked";
      };
      isDemo = invite.isDemo;
    };
  };

  /// Build one trainer note row, or null when the caller may not read it.
  public func trainerNoteRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    caller : Principal,
    note : Phase23.TrainerNote,
  ) : ?OqlTypes.TrainerNoteRow {
    let roadie = switch (roadies.get(note.roadieId)) {
      case (?r) { r };
      case null { return null };
    };
    if (not canSeeRoadie(accessGrants, caller, roadie)) {
      return null;
    };
    ?{
      id = note.id;
      owner = caller;
      roadieId = note.roadieId;
      authorName = principalName(accessGrants, note.author);
      didWell = note.didWell;
      workOn = note.workOn;
      createdAt = note.createdAt;
      isDemo = note.isDemo;
    };
  };

  /// Build one alert row, or null when the caller may not read it.
  public func alertRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
    alert : Phase23.Alert,
  ) : ?OqlTypes.AlertRow {
    if (not canSeeManager(accessGrants, caller)) {
      return null;
    };
    ?{
      id = alert.id;
      owner = caller;
      kind = "alert";
      roadieId = null;
      createdAt = alert.createdAt;
      acknowledged = alert.acknowledged;
    };
  };
};
