import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Phase23 "../types/phase23";
import RoadieLib "../lib/roadie";
import Fixtures "fixtures";

/// Tests for the weekly check-in write: the permission rules (managers may
/// check in any roadie, a crew leader only their own crew, archived and the
/// other demo partition refused) and the one-entry-per-week behaviour.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");
  func storeManager() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
  func trainer() : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");
  func leader() : Principal = Principal.fromText("2vxsx-fae");
  func otherLeader() : Principal = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai");

  func accessGrants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
    Fixtures.grant(admin(), #admin),
    Fixtures.grant(storeManager(), #storeManager),
    Fixtures.trainerGrant(trainer(), [1]),
    Fixtures.grant(leader(), #trainingManager),
    Fixtures.grant(otherLeader(), #trainingManager),
  ]);

  func demoOff() : Common.DemoState = {
    var enabled = false;
    var turnedOnAt = null;
    var autoOffAt = null;
    var pretendDate = null;
    var demoRoles = Map.empty<Principal, Common.DemoRoleEntry>();
    var demoTrainerAs = Map.empty<Principal, Principal>();
    var demoManagerAs = Map.empty<Principal, Principal>();
  };

  func storeInfo() : Store.StoreInfo = {
    appName = "Roadie Roster";
    storeNumber = "975";
    locationName = "Test";
    address = "1 Main St";
    storePhone = "5550000000";
    openingDate = 0;
    timeZone = "America/Chicago";
    amShiftStart = 600;
    amShiftEnd = 900;
    pmShiftStart = 960;
    pmShiftEnd = 1260;
    leaderTalkName = "Leader Talk";
    trainingGroupSize = 4;
    leaderTalkSize = 8;
    logo = null;
    secondaryLogo = null;
  };

  func counters() : RoadieLib.Counters = {
    var nextCrewId = 0;
    var nextChangeLogId = 0;
    var nextGroupChangeNoticeId = 0;
  };

  // Roadie 1 is in crew 10 (led by `leader`); roadie 2 is in no crew.
  func roadies() : Map.Map<Common.RoadieId, Roadie.Roadie> =
    Fixtures.roadies([
      Fixtures.roadieInCrew(1, 1, 10, false),
      Fixtures.roadie(2, 1, #active, false),
    ]);

  func crews() : Map.Map<Common.CrewId, Roadie.Crew> =
    Fixtures.crews([Fixtures.crew(10, leader())]);

  func weeklyCheckIns() : Map.Map<Common.RoadieId, [Phase23.WeeklyCheckIn]> =
    Map.empty<Common.RoadieId, [Phase23.WeeklyCheckIn]>();

  func changeLog() : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry> =
    Map.empty<Common.ChangeLogId, Roadie.ChangeLogEntry>();

  // A manager may check in any roadie and the entry is stored.
  public func testManagerChecksInAnyRoadie() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, storeManager(), 2);
    let stored = wc.get(2) ?? return false;
    stored.size() == 1 and log.size() == 1;
  };

  // A crew leader may check in a roadie in their own crew.
  public func testCrewLeaderChecksInOwnCrew() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, leader(), 1);
    switch (wc.get(1)) {
      case (?stored) { stored.size() == 1 };
      case null { false };
    };
  };

  // A crew leader may not check in a roadie outside their crew.
  public func testCrewLeaderRefusedOutsideCrew() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    try {
      RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, leader(), 2);
      false;
    } catch (_) {
      true;
    };
  };

  // A trainer who leads no crew may not check anyone in.
  public func testTrainerRefused() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    try {
      RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, trainer(), 1);
      false;
    } catch (_) {
      true;
    };
  };

  // An archived roadie is refused even for a manager.
  public func testArchivedRefused() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    let rd = Fixtures.roadies([Fixtures.roadie(3, 1, #archived, false)]);
    try {
      RoadieLib.checkInRoadie(accessGrants(), demoOff(), rd, crews(), wc, storeInfo(), log, c, admin(), 3);
      false;
    } catch (_) {
      true;
    };
  };

  // A second check-in in the same week replaces that week's entry, so the list
  // never grows past one entry per week.
  public func testOneEntryPerWeek() : Bool {
    let wc = weeklyCheckIns();
    let log = changeLog();
    let c = counters();
    RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, admin(), 1);
    let first = wc.get(1) ?? return false;
    RoadieLib.checkInRoadie(accessGrants(), demoOff(), roadies(), crews(), wc, storeInfo(), log, c, admin(), 1);
    let second = wc.get(1) ?? return false;
    first.size() == 1 and second.size() == 1;
  };
};
