import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Signup "../types/signup";
import Phase23 "../types/phase23";
import OpeningQuestions "../types/openingquestions";
import CrewEvents "../types/crewevents";

/// Shared fixtures for the read-only OQL entity tests. Every helper builds a
/// minimal stored record so a test can drive one row builder in `lib/oql.mo`
/// and assert which callers see it. Nothing here touches actor state.
module {
  /// A principal that is never a real caller in these tests.
  public func nobody() : Principal = Principal.fromText("aaaaa-aa");

  /// A principal that is never a real caller in these tests.
  public func other() : Principal = Principal.fromText("2vxsx-fae");

  /// The approver recorded on a real (non-demo) grant. It must not be the
  /// system actor (`aaaaa-aa`), which marks a grant as a seeded demo leader.
  public func approver() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");

  /// A grant for `p` with `role`, no end date, no trainer stations.
  public func grant(p : Principal, role : Common.Role) : Access.AccessGrant {
    {
      principal = p;
      role;
      approvedAt = 0;
      approvedBy = approver();
      accessEndsAt = null;
      trainerPositionIds = [];
      linkedRoadieId = null;
      staffProfile = null;
    };
  };

  /// A grant for `p` with `role` that ended one day ago.
  public func expiredGrant(p : Principal, role : Common.Role) : Access.AccessGrant {
    {
      principal = p;
      role;
      approvedAt = 0;
      approvedBy = approver();
      accessEndsAt = ?(Time.now() - 86_400_000_000_000);
      trainerPositionIds = [];
      linkedRoadieId = null;
      staffProfile = null;
    };
  };

  /// A grant for a Trainer with the given stations.
  public func trainerGrant(p : Principal, stations : [Common.PositionId]) : Access.AccessGrant {
    {
      principal = p;
      role = #trainer;
      approvedAt = 0;
      approvedBy = approver();
      accessEndsAt = null;
      trainerPositionIds = stations;
      linkedRoadieId = null;
      staffProfile = null;
    };
  };

  /// A grant map holding exactly the given grants.
  public func grants(entries : [Access.AccessGrant]) : Map.Map<Principal, Access.AccessGrant> {
    let m = Map.empty<Principal, Access.AccessGrant>();
    for (g in entries.values()) {
      m.add(g.principal, g);
    };
    m;
  };

  /// A demo-role map holding one caller's chosen demo role, with no stations.
  public func demoRoles(entries : [(Principal, Common.DemoRole)]) : Map.Map<Principal, Common.DemoRoleEntry> {
    let m = Map.empty<Principal, Common.DemoRoleEntry>();
    for ((p, role) in entries.values()) {
      m.add(p, { role; stations = [] });
    };
    m;
  };

  /// A demo-role map holding one caller's chosen demo role and demo stations.
  public func demoRolesWithStations(
    entries : [(Principal, Common.DemoRole)],
    stations : [Common.PositionId],
  ) : Map.Map<Principal, Common.DemoRoleEntry> {
    let m = Map.empty<Principal, Common.DemoRoleEntry>();
    for ((p, role) in entries.values()) {
      m.add(p, { role; stations });
    };
    m;
  };

  /// A minimal roadie with the given id, main position, status and demo flag.
  public func roadie(
    id : Common.RoadieId,
    mainPositionId : Common.PositionId,
    status : Roadie.RoadieStatus,
    isDemo : Bool,
  ) : Roadie.Roadie {
    {
      id;
      profile = {
        name = "Roadie " # id.toText();
        preferredName = null;
        hometown = null;
        hobbies = null;
        favoriteMovie = null;
        favoriteSnack = null;
        favoriteTeam = null;
        favoriteDrink = null;
        favoriteColor = null;
        funFact = null;
        goalHere = null;
        positionAppliedFor = null;
        shirtSize = ?"M";
        hatSize = ?"S";
        shiftsWantedPerWeek = null;
        weekdayLunch = null;
      };
      photo = null;
      demoPhotoUrl = null;
      mainPositionId;
      secondPositionId = null;
      crossTrainedPositionId = null;
      crewId = null;
      orientationEventId = null;
      startDate = null;
      status;
      corporateEmployeeId = null;
      contactSet = null;
      isMinor = false;
      birthdayMonthDay = null;
      archivedReason = null;
      archivedAt = null;
      hiredAt = 0;
      hireDate = null;
      signedBy = null;
      rosterState = #active;
      isDemo;
      stage = null;
      paperworkStep = null;
    };
  };

  /// A roadie in the given crew.
  public func roadieInCrew(
    id : Common.RoadieId,
    mainPositionId : Common.PositionId,
    crewId : Common.CrewId,
    isDemo : Bool,
  ) : Roadie.Roadie {
    let r = roadie(id, mainPositionId, #active, isDemo);
    { r with crewId = ?crewId };
  };

  /// A crew led by `leader`.
  public func crew(id : Common.CrewId, leader : Principal) : Roadie.Crew {
    { id; name = "Crew " # id.toText(); leaderPrincipal = ?leader; isDemo = false };
  };

  /// A crew map holding exactly the given crews.
  public func crews(entries : [Roadie.Crew]) : Map.Map<Common.CrewId, Roadie.Crew> {
    let m = Map.empty<Common.CrewId, Roadie.Crew>();
    for (c in entries.values()) {
      m.add(c.id, c);
    };
    m;
  };

  /// A roadie map holding exactly the given roadies.
  public func roadies(entries : [Roadie.Roadie]) : Map.Map<Common.RoadieId, Roadie.Roadie> {
    let m = Map.empty<Common.RoadieId, Roadie.Roadie>();
    for (r in entries.values()) {
      m.add(r.id, r);
    };
    m;
  };

  /// A position with the given id and name.
  public func position(id : Common.PositionId, name : Text) : Store.Position {
    {
      id;
      name;
      house = #foh;
      code = "P" # id.toText();
      openingBuildTo = 4;
      afterOpeningBuildTo = 6;
      needsAlcoholCert = false;
      minimumAge = 16;
      defaultShirts = 2;
      defaultHats = 1;
      shirtType = "Tee";
      shirtQty = 2;
      hatType = "Cap";
      hatQty = 1;
    };
  };

  /// An orientation schedule event.
  public func orientationEvent(id : Common.EventId) : Store.ScheduleEvent {
    { id; kind = #orientation; name = "Orientation"; start = 1_000; end = null };
  };

  /// A pending kiosk sign-up.
  public func signup(id : Common.SignupId, isDemo : Bool) : Signup.SignupSubmission {
    {
      id;
      submittedAt = 500;
      profile = {
        name = "Applicant " # id.toText();
        preferredName = null;
        hometown = null;
        hobbies = null;
        favoriteMovie = null;
        favoriteSnack = null;
        favoriteTeam = null;
        favoriteDrink = null;
        favoriteColor = null;
        funFact = null;
        goalHere = null;
        positionAppliedFor = ?"Server";
        shirtSize = null;
        hatSize = null;
        shiftsWantedPerWeek = null;
        weekdayLunch = null;
      };
      photo = null;
      demoPhotoUrl = null;
      signature = null;
      contactSet = {
        phone = "555-0100";
        email = "a@example.com";
        emergencyContactName = "EC";
        emergencyContactPhone = "555-0101";
        dateOfBirth = 0;
        availability = [];
        availabilitySignature = null;
        availabilitySignedAt = null;
        availabilityResignPending = false;
        managerSignature = null;
        managerSignedAt = null;
        managerSignedBy = null;
      };
      status = #pending;
      isDemo;
    };
  };

  /// An attendance record for `roadieId` at `eventId`.
  public func attendance(
    roadieId : Common.RoadieId,
    eventId : Common.EventId,
    state : Phase23.AttendanceState,
    isDemo : Bool,
  ) : Phase23.AttendanceRecord {
    {
      roadieId;
      eventId = ?eventId;
      shift = null;
      state;
      recordedAt = 0;
      recordedBy = nobody();
      isDemo;
    };
  };

  /// An opening question with one approval.
  public func openingQuestion(id : Nat) : OpeningQuestions.OpeningQuestion {
    {
      id;
      sectionTitle = "Section";
      sectionOrder = 0;
      number = id;
      order = id;
      question = "Question " # id.toText();
      area = #kitchen;
      answer = "Answer";
      approvals = [{ principal = nobody(); at = 0 }];
      finalizedBy = null;
      finalizedAt = null;
      suggestions = [];
      comments = [];
      updatedAt = 0;
      updatedBy = nobody();
      isDemo = false;
    };
  };

  /// An opening question in the Kitchen area approved by `approver`, so the
  /// Kitchen Manager is its only live owner and has approved it.
  public func openingQuestionApprovedBy(id : Nat, approver : Principal) : OpeningQuestions.OpeningQuestion {
    let q = openingQuestion(id);
    { q with approvals = [{ principal = approver; at = 0 }] };
  };

  /// A crew event.
  public func crewEvent(id : Common.CrewEventId, isDemo : Bool) : CrewEvents.CrewEvent {
    { id; name = "Event " # id.toText(); start = 1_000; place = "Store"; note = null; cancelled = false; isDemo };
  };

  /// An event invite for `roadieId` at `eventId`.
  public func invite(
    eventId : Common.CrewEventId,
    roadieId : Common.RoadieId,
    isDemo : Bool,
  ) : CrewEvents.EventInvite {
    {
      eventId;
      roadieId;
      answer = #going;
      reason = null;
      followUpNote = null;
      attendance = #notMarked;
      updatedBy = nobody();
      updatedAt = 0;
      isDemo;
    };
  };

  /// A trainer note for `roadieId`.
  public func trainerNote(id : Nat, roadieId : Common.RoadieId, isDemo : Bool) : Phase23.TrainerNote {
    {
      id;
      author = nobody();
      roadieId;
      shift = #am;
      day = 0;
      didWell = "Great";
      workOn = "More";
      createdAt = 0;
      isDemo;
    };
  };

  /// An alert.
  public func alert(id : Common.AlertId) : Phase23.Alert {
    { id; message = "Alert"; createdAt = 0; acknowledged = false };
  };
};
