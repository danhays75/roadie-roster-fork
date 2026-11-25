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

/// Tests for the read-only OQL row builders in `lib/oql.mo`. Each builder
/// returns `?Row`: null when the caller's REAL, non-expired role may not see
/// that row. These tests drive the builders directly with fixture grants and
/// records, so they cover every role's visible rows, the Trainer station limit,
/// the crew-leader limit, demo partitioning, and that Kiosk, Integration,
/// expired and anonymous callers get nothing.
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
    let a = OqlLib.roadieRow(accessGrants(), finalSignOffs(), admin(), roadie1());
    let b = OqlLib.roadieRow(accessGrants(), finalSignOffs(), admin(), roadie2());
    a == null and b == null;
  };

  public func testRoadieTrainerStationLimit() : Bool {
    let inStation = OqlLib.roadieRow(accessGrants(), finalSignOffs(), trainer(), roadie1());
    let outOfStation = OqlLib.roadieRow(accessGrants(), finalSignOffs(), trainer(), roadie2());
    inStation != null and outOfStation == null;
  };

  public func testRoadieTrainerNoStationsSeesNone() : Bool {
    OqlLib.roadieRow(accessGrants(), finalSignOffs(), trainerNoStations(), roadie1()) == null;
  };

  public func testRoadieRefusedRolesSeeNothing() : Bool {
    OqlLib.roadieRow(accessGrants(), finalSignOffs(), kiosk(), roadie1()) == null
      and OqlLib.roadieRow(accessGrants(), finalSignOffs(), integration(), roadie1()) == null
      and OqlLib.roadieRow(accessGrants(), finalSignOffs(), expired(), roadie1()) == null
      and OqlLib.roadieRow(accessGrants(), finalSignOffs(), unregistered(), roadie1()) == null
      and OqlLib.roadieRow(accessGrants(), finalSignOffs(), anonymous(), roadie1()) == null;
  };

  // --- Positions ---

  public func testPositionManagerRolesSee() : Bool {
    let p = Fixtures.position(1, "Server");
    OqlLib.positionRow(accessGrants(), roadieMap(), false, admin(), p) != null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, managingPartner(), p) != null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, storeManager(), p) != null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, trainingManager(), p) != null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, kitchenManager(), p) != null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, serviceManager(), p) != null;
  };

  public func testPositionNonManagerRefused() : Bool {
    let p = Fixtures.position(1, "Server");
    OqlLib.positionRow(accessGrants(), roadieMap(), false, trainer(), p) == null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, kiosk(), p) == null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, integration(), p) == null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, expired(), p) == null
      and OqlLib.positionRow(accessGrants(), roadieMap(), false, anonymous(), p) == null;
  };

  public func testPositionOnHandCountsMainPositionOnly() : Bool {
    let p = Fixtures.position(1, "Server");
    switch (OqlLib.positionRow(accessGrants(), roadieMap(), false, admin(), p)) {
      case (?row) { row.onHand == 1 };
      case null { false };
    };
  };

  // --- Pending sign-ups ---

  public func testPendingSignupManagerSees() : Bool {
    let s = Fixtures.signup(1, false);
    OqlLib.pendingSignupRow(accessGrants(), admin(), s) != null
      and OqlLib.pendingSignupRow(accessGrants(), storeManager(), s) != null
      and OqlLib.pendingSignupRow(accessGrants(), kitchenManager(), s) != null
      and OqlLib.pendingSignupRow(accessGrants(), serviceManager(), s) != null;
  };

  public func testPendingSignupRefusedRoles() : Bool {
    let s = Fixtures.signup(1, false);
    OqlLib.pendingSignupRow(accessGrants(), trainer(), s) == null
      and OqlLib.pendingSignupRow(accessGrants(), kiosk(), s) == null
      and OqlLib.pendingSignupRow(accessGrants(), integration(), s) == null
      and OqlLib.pendingSignupRow(accessGrants(), expired(), s) == null
      and OqlLib.pendingSignupRow(accessGrants(), anonymous(), s) == null;
  };

  // --- Orientation sessions and attendance ---

  public func testOrientationSessionManagerSees() : Bool {
    let e = Fixtures.orientationEvent(1);
    OqlLib.orientationSessionRow(accessGrants(), admin(), e) != null
      and OqlLib.orientationSessionRow(accessGrants(), trainingManager(), e) != null
      and OqlLib.orientationSessionRow(accessGrants(), trainer(), e) == null
      and OqlLib.orientationSessionRow(accessGrants(), kiosk(), e) == null
      and OqlLib.orientationSessionRow(accessGrants(), anonymous(), e) == null;
  };

  public func testAttendanceManagerSees() : Bool {
    let a = Fixtures.attendance(1, 1, #present, false);
    OqlLib.attendanceRow(accessGrants(), admin(), 1, a) != null
      and OqlLib.attendanceRow(accessGrants(), storeManager(), 1, a) != null
      and OqlLib.attendanceRow(accessGrants(), trainer(), 1, a) == null
      and OqlLib.attendanceRow(accessGrants(), integration(), 1, a) == null
      and OqlLib.attendanceRow(accessGrants(), expired(), 1, a) == null;
  };

  // --- Opening questions ---

  public func testOpeningQuestionReaders() : Bool {
    let q = Fixtures.openingQuestion(1);
    OqlLib.openingQuestionRow(accessGrants(), admin(), q) != null
      and OqlLib.openingQuestionRow(accessGrants(), managingPartner(), q) != null
      and OqlLib.openingQuestionRow(accessGrants(), storeManager(), q) != null
      and OqlLib.openingQuestionRow(accessGrants(), trainingManager(), q) != null
      and OqlLib.openingQuestionRow(accessGrants(), kitchenManager(), q) != null
      and OqlLib.openingQuestionRow(accessGrants(), serviceManager(), q) != null;
  };

  public func testOpeningQuestionRefusedRoles() : Bool {
    let q = Fixtures.openingQuestion(1);
    OqlLib.openingQuestionRow(accessGrants(), trainer(), q) == null
      and OqlLib.openingQuestionRow(accessGrants(), kiosk(), q) == null
      and OqlLib.openingQuestionRow(accessGrants(), integration(), q) == null
      and OqlLib.openingQuestionRow(accessGrants(), expired(), q) == null
      and OqlLib.openingQuestionRow(accessGrants(), anonymous(), q) == null;
  };

  // --- Crew events and answers ---

  public func testCrewEventRosterReaders() : Bool {
    let e = Fixtures.crewEvent(1, false);
    OqlLib.crewEventRow(accessGrants(), admin(), e) != null
      and OqlLib.crewEventRow(accessGrants(), trainer(), e) != null
      and OqlLib.crewEventRow(accessGrants(), crewLeader(), e) != null
      and OqlLib.crewEventRow(accessGrants(), kiosk(), e) == null
      and OqlLib.crewEventRow(accessGrants(), integration(), e) == null
      and OqlLib.crewEventRow(accessGrants(), expired(), e) == null
      and OqlLib.crewEventRow(accessGrants(), anonymous(), e) == null;
  };

  public func testEventAnswerCrewLeaderLimit() : Bool {
    let ownCrew = OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), crewLeader(), "k1", Fixtures.invite(1, 1, false));
    let otherCrew = OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), crewLeader(), "k2", Fixtures.invite(1, 2, false));
    ownCrew != null and otherCrew == null;
  };

  public func testEventAnswerNonLeaderSeesAll() : Bool {
    let a = OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), admin(), "k1", Fixtures.invite(1, 1, false));
    let b = OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), admin(), "k2", Fixtures.invite(1, 2, false));
    a != null and b != null;
  };

  public func testEventAnswerRefusedRoles() : Bool {
    OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), kiosk(), "k1", Fixtures.invite(1, 1, false)) == null
      and OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), integration(), "k1", Fixtures.invite(1, 1, false)) == null
      and OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), expired(), "k1", Fixtures.invite(1, 1, false)) == null
      and OqlLib.eventAnswerRow(accessGrants(), crewMap(), crewRoadieMap(), anonymous(), "k1", Fixtures.invite(1, 1, false)) == null;
  };

  // --- Trainer notes ---

  public func testTrainerNoteReaders() : Bool {
    let n = Fixtures.trainerNote(1, 1, false);
    OqlLib.trainerNoteRow(accessGrants(), roadieMap(), admin(), n) != null
      and OqlLib.trainerNoteRow(accessGrants(), roadieMap(), trainer(), n) != null;
  };

  public func testTrainerNoteStationLimit() : Bool {
    let inStation = Fixtures.trainerNote(1, 1, false);
    let outOfStation = Fixtures.trainerNote(2, 2, false);
    OqlLib.trainerNoteRow(accessGrants(), roadieMap(), trainer(), inStation) != null
      and OqlLib.trainerNoteRow(accessGrants(), roadieMap(), trainer(), outOfStation) == null;
  };

  public func testTrainerNoteRefusedRoles() : Bool {
    let n = Fixtures.trainerNote(1, 1, false);
    OqlLib.trainerNoteRow(accessGrants(), roadieMap(), kiosk(), n) == null
      and OqlLib.trainerNoteRow(accessGrants(), roadieMap(), integration(), n) == null
      and OqlLib.trainerNoteRow(accessGrants(), roadieMap(), expired(), n) == null
      and OqlLib.trainerNoteRow(accessGrants(), roadieMap(), anonymous(), n) == null;
  };

  // --- Alerts ---

  public func testAlertManagerSees() : Bool {
    let a = Fixtures.alert(1);
    OqlLib.alertRow(accessGrants(), admin(), a) != null
      and OqlLib.alertRow(accessGrants(), storeManager(), a) != null
      and OqlLib.alertRow(accessGrants(), trainer(), a) == null
      and OqlLib.alertRow(accessGrants(), kiosk(), a) == null
      and OqlLib.alertRow(accessGrants(), integration(), a) == null
      and OqlLib.alertRow(accessGrants(), expired(), a) == null
      and OqlLib.alertRow(accessGrants(), anonymous(), a) == null;
  };

  // --- Demo partitioning ---

  public func testDemoPartitionOnHand() : Bool {
    let real = Fixtures.roadie(1, 1, #active, false);
    let demo = Fixtures.roadie(2, 1, #active, true);
    let mixed = Fixtures.roadies([real, demo]);
    let p = Fixtures.position(1, "Server");
    let realCount = switch (OqlLib.positionRow(accessGrants(), mixed, false, admin(), p)) {
      case (?row) { row.onHand };
      case null { 99 };
    };
    let demoCount = switch (OqlLib.positionRow(accessGrants(), mixed, true, admin(), p)) {
      case (?row) { row.onHand };
      case null { 99 };
    };
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
    switch (OqlLib.roadieRow(accessGrants(), finalSignOffs(), admin(), demoRoadie)) {
      case (?r) {
        r.isDemo
          and (switch (OqlLib.pendingSignupRow(accessGrants(), admin(), demoSignup)) { case (?s) s.isDemo; case null false })
          and (switch (OqlLib.crewEventRow(accessGrants(), admin(), demoEvent)) { case (?e) e.isDemo; case null false })
          and (switch (OqlLib.trainerNoteRow(accessGrants(), demoRoadieMap, admin(), demoNote)) { case (?n) n.isDemo; case null false })
          and (switch (OqlLib.attendanceRow(accessGrants(), admin(), 9, demoAttendance)) { case (?a) a.isDemo; case null false })
          and (switch (OqlLib.eventAnswerRow(accessGrants(), crewMap(), demoRoadieMap, admin(), "k9", demoInvite)) { case (?a) a.isDemo; case null false });
      };
      case null { false };
    };
  };
};
