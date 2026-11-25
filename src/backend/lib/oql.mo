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
import OpeningQuestionsLib "openingquestions";

/// Read-only OQL row builders and per-entity visibility rules. Every rule
/// resolves the caller's REAL, non-expired role from the app's access grants
/// (never a demo role), so a demo impersonation can never widen real data.
/// Kiosk, Integration, unregistered, expired and anonymous callers get no rows.
///
/// Each entity builds its rows WITHOUT a caller (the `*Row` builders), and the
/// role check runs in the entity's `ownedByWith` rule against the real query
/// subject (the `canSee*` helpers). The `owner` column is the row's identity
/// (the roadie id for the roadie entity, the caller for the rest), so a row the
/// rule refuses never reaches the caller.
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

  /// The role the caller acts as for a read: their impersonated demo role while
  /// demo mode is on, otherwise their real, non-expired role. Null when
  /// unregistered, expired or anonymous. This mirrors the app's existing
  /// queries, which consult the demo role while demo mode is on.
  func actingRole(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : ?Common.Role {
    Auth.effectiveRole(accessGrants, demoState, caller);
  };

  /// The principal a read acts as: the impersonated demo leader while demo mode
  /// is on, otherwise the caller. Used for crew-leader matching.
  func actingPrincipal(
    demoState : Common.DemoState,
    caller : Principal,
  ) : Principal {
    Auth.actingPrincipal(demoState, caller);
  };

  /// The trainer stations for the caller's acting grant (empty for every other
  /// role). While demo mode is on, the chosen demo trainer's stations.
  func actingTrainerStations(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : [Common.PositionId] {
    if (Auth.demoActive(demoState)) {
      return Auth.demoTrainerStationsFor(demoState, caller);
    };
    switch (accessGrants.get(caller)) {
      case (?grant) { grant.trainerPositionIds };
      case null { [] };
    };
  };

  /// True when the caller's acting role is one of the roster-wide manager roles.
  public func canSeeManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) { isManagerReader(role) };
      case null { false };
    };
  };

  /// True when the caller's acting role may read the roster (not Kiosk or
  /// Integration).
  public func canSeeRoster(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) { isRosterReader(role) };
      case null { false };
    };
  };

  /// True when the caller's acting role may read Opening Questions.
  public func canSeeOpeningQuestions(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) { Auth.roleCanReadOpeningQuestions(role) };
      case null { false };
    };
  };

  /// True when the caller's acting role may review sign-ups (Admin, Managing
  /// Partner, Store Manager, Kitchen Manager, Service Manager).
  public func canSeeSignups(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) { Auth.roleHasFourAreaAccess(role) };
      case null { false };
    };
  };

  /// True when the caller's acting role may read attendance and alerts (Admin,
  /// Managing Partner, Store Manager).
  public func canSeeAttendance(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) { Auth.roleHasAdminRights(role) or role == #storeManager };
      case null { false };
    };
  };

  /// True when the caller's acting role may read orientation sessions (Admin,
  /// Managing Partner, Store Manager, Training Manager, Visiting Manager).
  public func canSeeOrientation(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) {
        Auth.roleHasAdminRights(role)
          or role == #storeManager
          or role == #trainingManager
          or role == #visitingManager;
      };
      case null { false };
    };
  };

  /// True when a roadie is visible to the caller's acting role: a manager
  /// reader sees every roadie; a Trainer sees only roadies whose main or second
  /// position is one of their stations (a Trainer with no stations sees none);
  /// every other roster reader sees every roadie.
  public func canSeeRoadie(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (isManagerReader(role)) {
          return true;
        };
        if (role == #trainer) {
          let stations = actingTrainerStations(accessGrants, demoState, caller);
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
  /// crewed roadie. Crew leadership is matched on the acting principal, so a
  /// demo crew leader sees their demo crew.
  public func canSeeEventAnswer(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not isRosterReader(role)) {
          return false;
        };
        let acting = actingPrincipal(demoState, caller);
        let leadsOwnCrew = crews.values().any(func(c) = c.leaderPrincipal == ?acting);
        if (not leadsOwnCrew) {
          return true;
        };
        switch (roadie.crewId) {
          case (?cid) {
            switch (crews.get(cid)) {
              case (?c) { c.leaderPrincipal == ?acting };
              case null { false };
            };
          };
          case null { false };
        };
      };
      case null { false };
    };
  };

  /// True when the caller may read one crew event: a crew leader sees only
  /// events that have at least one active, non-archived roadie in their own
  /// crew; every other roster reader sees every event. Crew leadership is
  /// matched on the acting principal, so a demo crew leader sees their demo
  /// crew. This mirrors the `listCrewEvents` rule.
  public func canSeeCrewEvent(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    caller : Principal,
  ) : Bool {
    switch (actingRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not isRosterReader(role)) {
          return false;
        };
        let acting = actingPrincipal(demoState, caller);
        let demo = Auth.demoActive(demoState);
        switch (crews.values().find(func(c) = c.isDemo == demo and c.leaderPrincipal == ?acting)) {
          case (?c) {
            roadies.values().any(func(r) =
              r.isDemo == demo and r.crewId == ?c.id and r.status != #archived
            );
          };
          case null { true };
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

  /// The role label for a role.
  func roleText(role : Common.Role) : Text {
    switch (role) {
      case (#admin) "admin";
      case (#managingPartner) "managingPartner";
      case (#kitchenManager) "kitchenManager";
      case (#serviceManager) "serviceManager";
      case (#storeManager) "storeManager";
      case (#trainingManager) "trainingManager";
      case (#leadership) "leadership";
      case (#visitingManager) "visitingManager";
      case (#trainer) "trainer";
      case (#kiosk) "kiosk";
      case (#integration) "integration";
    };
  };

  /// Build one roadie row without a role check. The `owner` column is the
  /// roadie id, so the entity's rule can look the roadie up and check the
  /// caller's real role against it.
  public func roadieRow(
    finalSignOffs : Map.Map<Common.RoadieId, Phase23.FinalSignOff>,
    roadie : Roadie.Roadie,
  ) : OqlTypes.RoadieRow {
    {
      id = roadie.id;
      owner = Principal.fromText(roadie.id.toText());
      name = displayName(roadie);
      mainPositionId = roadie.mainPositionId;
      secondPositionId = roadie.secondPositionId ?? 0;
      status = statusText(roadie.status);
      crewId = roadie.crewId ?? 0;
      orientationEventId = roadie.orientationEventId ?? 0;
      paperworkDone = roadie.status != #hired and roadie.status != #archived;
      paperworkStep = roadie.paperworkStep ?? "";
      shirtSize = roadie.profile.shirtSize ?? "";
      hatSize = roadie.profile.hatSize ?? "";
      finalOutcome = finalOutcome(finalSignOffs, roadie.id) ?? "";
      archived = roadie.status == #archived;
      isDemo = roadie.isDemo;
    };
  };

  /// Build one position row with its on-hand count (pending + active roadies
  /// whose main position is this one, archived excluded), without a role check.
  public func positionRow(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    position : Store.Position,
  ) : OqlTypes.PositionRow {
    let onHand = roadies.values()
      .filter(func(r) = r.isDemo == demo and r.status != #archived and r.mainPositionId == position.id)
      .size();
    {
      id = position.id;
      owner = Principal.fromText(position.id.toText());
      name = position.name;
      openingBuildTo = position.openingBuildTo;
      afterOpeningBuildTo = position.afterOpeningBuildTo;
      onHand;
    };
  };

  /// Build one pending sign-up row without a role check.
  public func pendingSignupRow(signup : Signup.SignupSubmission) : OqlTypes.PendingSignupRow {
    {
      id = signup.id;
      owner = Principal.fromText(signup.id.toText());
      name = signup.profile.name;
      positionAppliedFor = signup.profile.positionAppliedFor ?? "";
      submittedAt = signup.submittedAt;
      isDemo = signup.isDemo;
    };
  };

  /// Build one orientation session row without a role check.
  public func orientationSessionRow(event : Store.ScheduleEvent) : OqlTypes.OrientationSessionRow {
    {
      id = event.id;
      owner = Principal.fromText(event.id.toText());
      name = event.name;
      start = event.start;
    };
  };

  /// Build one attendance row without a role check.
  public func attendanceRow(id : Nat, record : Phase23.AttendanceRecord) : OqlTypes.AttendanceRow {
    {
      id;
      owner = Principal.fromText(id.toText());
      roadieId = record.roadieId;
      eventId = record.eventId ?? 0;
      present = record.state == #present;
      isDemo = record.isDemo;
    };
  };

  /// Build one opening question row without a role check. `readyForFinal` uses
  /// the Opening Questions domain rule: not final and every live owner approved.
  public func openingQuestionRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    question : OpeningQuestions.OpeningQuestion,
  ) : OqlTypes.OpeningQuestionRow {
    {
      id = question.id;
      owner = Principal.fromText(question.id.toText());
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
      readyForFinal = OpeningQuestionsLib.isReadyForFinal(accessGrants, question);
      approvalCount = question.approvals.size();
    };
  };

  /// Build one crew event row without a role check.
  public func crewEventRow(event : CrewEvents.CrewEvent) : OqlTypes.CrewEventRow {
    {
      id = event.id;
      owner = Principal.fromText(event.id.toText());
      name = event.name;
      start = event.start;
      place = event.place;
      cancelled = event.cancelled;
      isDemo = event.isDemo;
    };
  };

  /// Build one event answer row without a role check, or null when the invite's
  /// roadie is not stored.
  public func eventAnswerRow(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    key : Text,
    invite : CrewEvents.EventInvite,
  ) : ?OqlTypes.EventAnswerRow {
    switch (roadies.get(invite.roadieId)) {
      case (?_) {};
      case null { return null };
    };
    ?{
      key;
      owner = Principal.fromText(invite.roadieId.toText());
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

  /// Build one trainer note row without a role check, or null when the note's
  /// roadie is not stored.
  public func trainerNoteRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    note : Phase23.TrainerNote,
  ) : ?OqlTypes.TrainerNoteRow {
    switch (roadies.get(note.roadieId)) {
      case (?_) {};
      case null { return null };
    };
    ?{
      id = note.id;
      owner = Principal.fromText(note.roadieId.toText());
      roadieId = note.roadieId;
      authorName = principalName(accessGrants, note.author);
      didWell = note.didWell;
      workOn = note.workOn;
      createdAt = note.createdAt;
      isDemo = note.isDemo;
    };
  };

  /// Build one alert row without a role check.
  public func alertRow(alert : Phase23.Alert) : OqlTypes.AlertRow {
    {
      id = alert.id;
      owner = Principal.fromText(alert.id.toText());
      kind = "alert";
      roadieId = 0;
      createdAt = alert.createdAt;
      acknowledged = alert.acknowledged;
    };
  };

  /// Build the caller's own access row, or null for an anonymous caller. The
  /// role is the caller's REAL, non-expired role from the access grants (never
  /// a demo role); `registered` is true when a grant exists, `approved` when
  /// that grant is still in force, and `accessEndsAt` is the grant's end date.
  public func myAccessRow(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : ?OqlTypes.MyAccessRow {
    if (caller.isAnonymous()) {
      return null;
    };
    let grant = accessGrants.get(caller);
    let role = realRole(accessGrants, caller);
    ?{
      principal = caller;
      owner = caller;
      role = switch (role) {
        case (?r) { roleText(r) };
        case null { "none" };
      };
      registered = grant != null;
      approved = role != null;
      accessEndsAt = switch (grant) {
        case (?g) { g.accessEndsAt };
        case null { null };
      };
    };
  };
};
