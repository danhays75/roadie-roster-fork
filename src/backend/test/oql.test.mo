import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Signup "../types/signup";
import Phase23 "../types/phase23";
import OpeningQuestions "../types/openingquestions";
import CrewEvents "../types/crewevents";
import OqlTypes "../types/oql";
import OqlLib "../lib/oql";
import Fixtures "fixtures";

/// Tests for the read-only OQL row builders and visibility rules in
/// `lib/oql.mo`. The row builders build every row without a role check; the
/// `canSee*` rules decide which rows a caller may read. These tests drive both
/// directly with fixture grants and records, so they cover every role's visible
/// rows, the Trainer station limit, the crew-leader limit, demo partitioning,
/// and that Kiosk, Integration, expired and anonymous callers get nothing.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");
  func managingPartner() : Principal = Principal.fromText("2vxsx-fae");
  func storeManager() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
  func trainingManager() : Principal = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");
  func kitchenManager() : Principal = Principal.fromText("renrk-eyaaa-aaaaa-aaada-cai");
  func serviceManager() : Principal = Principal.fromText("r7inp-6aaaa-aaaaa-aaabq-cai");
  func trainer() : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");
  func trainerNoStations() : Principal = Principal.fromText("rno2w-sqaaa-aaaaa-aaacq-cai");
  func crewLeader() : Principal = Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai");
  func otherRoadieRole() : Principal = Principal.fromText("renrk-eyaaa-aaaaa-aaada-cai");
  func kiosk() : Principal = Principal.fromText("r7inp-6aaaa-aaaaa-aaabq-cai");
  func integration() : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");
  func expired() : Principal = Principal.fromText("rno2w-sqaaa-aaaaa-aaacq-cai");
  func unregistered() : Principal = Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai");
  func anonymous() : Principal = Principal.fromText("2vxsx-fae");

  // A grant map with one caller per role. The Trainer has station 1 only.
  func accessGrants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
    Fixtures.grant(admin(), #admin),
    Fixtures.grant(managingPartner(), #managingPartner),
    Fixtures.grant(storeManager(), #storeManager),
    Fixtures.grant(trainingManager(), #trainingManager),
    Fixtures.grant(kitchenManager(), #kitchenManager),
    Fixtures.grant(serviceManager(), #serviceManager),
    Fixtures.trainerGrant(trainer(), [1]),
    Fixtures.trainerGrant(trainerNoStations(), []),
    Fixtures.grant(crewLeader(), #leadership),
    Fixtures.grant(otherRoadieRole(), #leadership),
    Fixtures.grant(kiosk(), #kiosk),
    Fixtures.grant(integration(), #integration),
    Fixtures.expiredGrant(expired(), #admin),
  ]);

  // Demo mode off: the visibility rules fall back to the caller's real role.
  func demoOff() : Common.DemoState = {
    var enabled = false;
    var turnedOnAt = null;
    var autoOffAt = null;
    var pretendDate = null;
    var demoRoles = Map.empty<Principal, Common.DemoRoleEntry>();
    var demoTrainerAs = Map.empty<Principal, Principal>();
    var demoManagerAs = Map.empty<Principal, Principal>();
  };

  // Demo mode on, with `caller` impersonating `role`. The caller needs no real
  // grant: demo mode lets any signed-in caller act as the chosen demo role.
  func demoOn(caller : Principal, role : Common.DemoRole) : Common.DemoState = {
    var enabled = true;
    var turnedOnAt = null;
    var autoOffAt = null;
    var pretendDate = null;
    var demoRoles = Fixtures.demoRoles([(caller, role)]);
    var demoTrainerAs = Map.empty<Principal, Principal>();
    var demoManagerAs = Map.empty<Principal, Principal>();
  };

  // Demo mode on, with `caller` impersonating a Trainer whose demo stations are
  // `stations`.
  func demoOnTrainer(caller : Principal, stations : [Common.PositionId]) : Common.DemoState = {
    var enabled = true;
    var turnedOnAt = null;
    var autoOffAt = null;
    var pretendDate = null;
    var demoRoles = Fixtures.demoRolesWithStations([(caller, #trainer)], stations);
    var demoTrainerAs = Map.empty<Principal, Principal>();
    var demoManagerAs = Map.empty<Principal, Principal>();
  };

  // Roadies: id 1 at station 1 (the Trainer's station), id 2 at station 2.
  func roadie1() : Roadie.Roadie = Fixtures.roadie(1, 1, #active, false);
  func roadie2() : Roadie.Roadie = Fixtures.roadie(2, 2, #active, false);
  func roadieMap() : Map.Map<Common.RoadieId, Roadie.Roadie> = Fixtures.roadies([roadie1(), roadie2()]);

  // Crew 10 led by crewLeader(), holding roadie1; roadie2 is in crew 11.
  func crewMap() : Map.Map<Common.CrewId, Roadie.Crew> = Fixtures.crews([Fixtures.crew(10, crewLeader()), Fixtures.crew(11, otherRoadieRole())]);
  func crewRoadie1() : Roadie.Roadie = Fixtures.roadieInCrew(1, 1, 10, false);
  func crewRoadie2() : Roadie.Roadie = Fixtures.roadieInCrew(2, 2, 11, false);
  func crewRoadieMap() : Map.Map<Common.RoadieId, Roadie.Roadie> = Fixtures.roadies([crewRoadie1(), crewRoadie2()]);

  func finalSignOffs() : Map.Map<Common.RoadieId, Phase23.FinalSignOff> = Map.empty<Common.RoadieId, Phase23.FinalSignOff>();

  // --- Roadies ---

  public func testRoadieManagerSeesAll() : Bool {
    OqlLib.canSeeRoadie(accessGrants(), demoOff(), admin(), roadie1())
      and OqlLib.canSeeRoadie(accessGrants(), demoOff(), admin(), roadie2())
      and OqlLib.canSeeRoadie(accessGrants(), demoOff(), managingPartner(), roadie1())
      and OqlLib.canSeeRoadie(accessGrants(), demoOff(), managingPartner(), roadie2());
  };

  public func testRoadieRowBuiltWithoutCaller() : Bool {
    let row = OqlLib.roadieRow(finalSignOffs(), roadie1());
    row.id == 1 and row.name == "Roadie 1" and not row.isDemo;
  };

  public func testRoadieTrainerStationLimit() : Bool {
    OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainer(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainer(), roadie2());
  };

  public func testRoadieTrainerNoStationsSeesNone() : Bool {
    not OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainerNoStations(), roadie1());
  };

  public func testRoadieRefusedRolesSeeNothing() : Bool {
    not OqlLib.canSeeRoadie(accessGrants(), demoOff(), kiosk(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), integration(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), expired(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), unregistered(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), anonymous(), roadie1());
  };

  // --- Positions ---

  public func testPositionManagerRolesSee() : Bool {
    OqlLib.canSeeManager(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeManager(accessGrants(), demoOff(), managingPartner())
      and OqlLib.canSeeManager(accessGrants(), demoOff(), storeManager())
      and OqlLib.canSeeManager(accessGrants(), demoOff(), trainingManager())
      and OqlLib.canSeeManager(accessGrants(), demoOff(), kitchenManager())
      and OqlLib.canSeeManager(accessGrants(), demoOff(), serviceManager());
  };

  public func testPositionNonManagerRefused() : Bool {
    not OqlLib.canSeeManager(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeManager(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeManager(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeManager(accessGrants(), demoOff(), expired())
      and not OqlLib.canSeeManager(accessGrants(), demoOff(), anonymous());
  };

  public func testPositionOnHandCountsMainPositionOnly() : Bool {
    let p = Fixtures.position(1, "Server");
    OqlLib.positionRow(roadieMap(), false, p).onHand == 1;
  };

  // --- Pending sign-ups ---

  public func testPendingSignupManagerSees() : Bool {
    OqlLib.canSeeSignups(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeSignups(accessGrants(), demoOff(), storeManager())
      and OqlLib.canSeeSignups(accessGrants(), demoOff(), kitchenManager())
      and OqlLib.canSeeSignups(accessGrants(), demoOff(), serviceManager());
  };

  public func testPendingSignupRefusedRoles() : Bool {
    not OqlLib.canSeeSignups(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeSignups(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeSignups(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeSignups(accessGrants(), demoOff(), expired())
      and not OqlLib.canSeeSignups(accessGrants(), demoOff(), anonymous());
  };

  // --- Orientation sessions and attendance ---

  public func testOrientationSessionManagerSees() : Bool {
    OqlLib.canSeeOrientation(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeOrientation(accessGrants(), demoOff(), trainingManager())
      and not OqlLib.canSeeOrientation(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeOrientation(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeOrientation(accessGrants(), demoOff(), anonymous());
  };

  public func testAttendanceManagerSees() : Bool {
    OqlLib.canSeeAttendance(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeAttendance(accessGrants(), demoOff(), storeManager())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), expired());
  };

  // --- Opening questions ---

  public func testOpeningQuestionReaders() : Bool {
    OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), managingPartner())
      and OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), storeManager())
      and OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), trainingManager())
      and OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), kitchenManager())
      and OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), serviceManager());
  };

  public func testOpeningQuestionRefusedRoles() : Bool {
    not OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), expired())
      and not OqlLib.canSeeOpeningQuestions(accessGrants(), demoOff(), anonymous());
  };

  // A question with no approvals is never ready for final.
  public func testOpeningQuestionReadyForFinalNeedsAllOwners() : Bool {
    let q = Fixtures.openingQuestion(1);
    not OqlLib.openingQuestionRow(accessGrants(), q).readyForFinal;
  };

  // A question whose only live owner (the Kitchen Manager) has approved is
  // ready for final; the same question is not ready once it is Final.
  public func testOpeningQuestionReadyForFinalWhenOwnerApproved() : Bool {
    let q = Fixtures.openingQuestionApprovedBy(1, kitchenManager());
    let ready = OqlLib.openingQuestionRow(accessGrants(), q).readyForFinal;
    let finalQ = { q with finalizedBy = ?managingPartner(); finalizedAt = ?0 };
    ready and not OqlLib.openingQuestionRow(accessGrants(), finalQ).readyForFinal;
  };

  // --- Crew events and answers ---

  public func testCrewEventRosterReaders() : Bool {
    OqlLib.canSeeRoster(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeRoster(accessGrants(), demoOff(), trainer())
      and OqlLib.canSeeRoster(accessGrants(), demoOff(), crewLeader())
      and not OqlLib.canSeeRoster(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeRoster(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeRoster(accessGrants(), demoOff(), expired())
      and not OqlLib.canSeeRoster(accessGrants(), demoOff(), anonymous());
  };

  // A crew leader sees a crew event only while their own crew has an active
  // roadie; every other roster reader sees every event.
  public func testCrewEventCrewLeaderLimit() : Bool {
    let withCrew = OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), crewRoadieMap(), crewLeader());
    let noCrew = OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), roadieMap(), crewLeader());
    let adminSees = OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), roadieMap(), admin());
    withCrew and not noCrew and adminSees;
  };

  public func testCrewEventRefusedRoles() : Bool {
    not OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), crewRoadieMap(), kiosk())
      and not OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), crewRoadieMap(), integration())
      and not OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), crewRoadieMap(), expired())
      and not OqlLib.canSeeCrewEvent(accessGrants(), demoOff(), crewMap(), crewRoadieMap(), anonymous());
  };

  public func testEventAnswerCrewLeaderLimit() : Bool {
    OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), crewLeader(), crewRoadie1())
      and not OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), crewLeader(), crewRoadie2());
  };

  public func testEventAnswerNonLeaderSeesAll() : Bool {
    OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), admin(), crewRoadie1())
      and OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), admin(), crewRoadie2());
  };

  public func testEventAnswerRefusedRoles() : Bool {
    not OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), kiosk(), crewRoadie1())
      and not OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), integration(), crewRoadie1())
      and not OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), expired(), crewRoadie1())
      and not OqlLib.canSeeEventAnswer(accessGrants(), demoOff(), crewMap(), anonymous(), crewRoadie1());
  };

  // --- Trainer notes ---

  public func testTrainerNoteReaders() : Bool {
    OqlLib.canSeeRoadie(accessGrants(), demoOff(), admin(), roadie1())
      and OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainer(), roadie1());
  };

  public func testTrainerNoteStationLimit() : Bool {
    OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainer(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), trainer(), roadie2());
  };

  public func testTrainerNoteRefusedRoles() : Bool {
    not OqlLib.canSeeRoadie(accessGrants(), demoOff(), kiosk(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), integration(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), expired(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demoOff(), anonymous(), roadie1());
  };

  // --- Alerts ---

  public func testAlertManagerSees() : Bool {
    OqlLib.canSeeAttendance(accessGrants(), demoOff(), admin())
      and OqlLib.canSeeAttendance(accessGrants(), demoOff(), storeManager())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), trainer())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), kiosk())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), integration())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), expired())
      and not OqlLib.canSeeAttendance(accessGrants(), demoOff(), anonymous());
  };

  // --- Demo partitioning ---

  public func testDemoPartitionOnHand() : Bool {
    let real = Fixtures.roadie(1, 1, #active, false);
    let demo = Fixtures.roadie(2, 1, #active, true);
    let mixed = Fixtures.roadies([real, demo]);
    let p = Fixtures.position(1, "Server");
    let realCount = OqlLib.positionRow(mixed, false, p).onHand;
    let demoCount = OqlLib.positionRow(mixed, true, p).onHand;
    realCount == 1 and demoCount == 1;
  };

  public func testDemoPartitionCarriedOnRows() : Bool {
    let demoRoadie = Fixtures.roadie(9, 1, #active, true);
    let demoSignup = Fixtures.signup(9, true);
    let demoEvent = Fixtures.crewEvent(9, true);
    let demoNote = Fixtures.trainerNote(9, 9, true);
    let demoAttendance = Fixtures.attendance(9, 9, #present, true);
    let demoInvite = Fixtures.invite(9, 9, true);
    let demoRoadieMap = Fixtures.roadies([demoRoadie]);
    OqlLib.roadieRow(finalSignOffs(), demoRoadie).isDemo
      and OqlLib.pendingSignupRow(demoSignup).isDemo
      and OqlLib.crewEventRow(demoEvent).isDemo
      and (switch (OqlLib.trainerNoteRow(accessGrants(), demoRoadieMap, demoNote)) { case (?n) n.isDemo; case null false })
      and OqlLib.attendanceRow(9, demoAttendance).isDemo
      and (switch (OqlLib.eventAnswerRow(demoRoadieMap, "k9", demoInvite)) { case (?a) a.isDemo; case null false });
  };

  // --- Demo mode: the chosen demo role is honoured, never a real role ---

  // A signed-in caller with no real grant acts as the chosen demo role.
  public func testDemoRoleGrantsManagerVisibility() : Bool {
    let demo = demoOn(unregistered(), #admin);
    OqlLib.canSeeManager(accessGrants(), demo, unregistered())
      and OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie1())
      and OqlLib.canSeeAttendance(accessGrants(), demo, unregistered());
  };

  // A demo Trainer sees only roadies in the chosen demo stations.
  public func testDemoTrainerStationLimit() : Bool {
    let demo = demoOnTrainer(unregistered(), [1]);
    OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie2());
  };

  // A demo Trainer with no stations sees no roadies.
  public func testDemoTrainerNoStationsSeesNone() : Bool {
    let demo = demoOnTrainer(unregistered(), []);
    not OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie1())
      and not OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie2());
  };

  // Demo mode never widens a refused role: a demo Kiosk still sees nothing.
  public func testDemoKioskSeesNothing() : Bool {
    let demo = demoOn(unregistered(), #kiosk);
    not OqlLib.canSeeManager(accessGrants(), demo, unregistered())
      and not OqlLib.canSeeRoadie(accessGrants(), demo, unregistered(), roadie1())
      and not OqlLib.canSeeRoster(accessGrants(), demo, unregistered());
  };

  // An anonymous caller sees nothing even while demo mode is on.
  public func testDemoAnonymousSeesNothing() : Bool {
    let demo = demoOn(anonymous(), #admin);
    not OqlLib.canSeeManager(accessGrants(), demo, anonymous())
      and not OqlLib.canSeeRoadie(accessGrants(), demo, anonymous(), roadie1());
  };
};
