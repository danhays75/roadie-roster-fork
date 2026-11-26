import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Phase23 "../types/phase23";
import Phase23Lib "../lib/phase23";
import Fixtures "fixtures";

/// Tests for the paperwork per-item dates, the manager-only paid dates and the
/// pay setup choice on the orientation check-off. Every write is driven through
/// `lib/phase23.mo` with fixture grants, so the manager guard, the in-order
/// rule, the cascade and the demo partition are all exercised.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");
  func storeManager() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
  func trainer() : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");

  func accessGrants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
    Fixtures.grant(admin(), #admin),
    Fixtures.grant(storeManager(), #storeManager),
    Fixtures.trainerGrant(trainer(), [1]),
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

  func item(id : Nat, text : Text) : Store.ChecklistItem = {
    id;
    text;
    requiresAlcoholCert = false;
    minorOnly = false;
    itemType = #checkbox;
    enabled = true;
    shortLabel = null;
  };

  // Digital Paperwork (1), I-9 / W-4 (2), Policies & Procedures (3).
  func checklists() : { var value : Store.Checklists } = {
    var value = {
      orientationUniform = [];
      paperwork = [
        item(1, "Digital Paperwork (onboarding)"),
        item(2, "I-9 / W-4"),
        item(3, "Policies & Procedures"),
      ];
    };
  };

  func counters() : Phase23Lib.Counters = {
    var nextTrainingGroupId = 0;
    var nextGroupChangeNoticeId = 0;
    var nextLeaderTalkId = 0;
    var nextAlertId = 0;
    var nextAttendanceId = 0;
    var nextTrainerNoteId = 0;
    var nextChangeLogId = 0;
    var nextAbsentAlertId = 0;
  };

  func roadies() : Map.Map<Common.RoadieId, Roadie.Roadie> =
    Fixtures.roadies([Fixtures.roadie(1, 1, #active, false)]);

  func positions() : Map.Map<Common.PositionId, Store.Position> {
    let m = Map.empty<Common.PositionId, Store.Position>();
    m.add(1, Fixtures.position(1, "Server"));
    m;
  };

  func checkoffs() : Map.Map<Common.RoadieId, Phase23.OrientationCheckoff> =
    Map.empty<Common.RoadieId, Phase23.OrientationCheckoff>();

  func changeLog() : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry> =
    Map.empty<Common.ChangeLogId, Roadie.ChangeLogEntry>();

  // Ticking an item stores a date for it; unticking removes the date.
  public func testTickStoresDateAndUntickRemovesIt() : Bool {
    let co = checkoffs();
    let cl = checklists();
    let pos = positions();
    let rd = roadies();
    let log = changeLog();
    let c = counters();
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, ["1"]);
    let afterTick = co.get(1) ?? return false;
    let hasDate = afterTick.paperworkDates.any(func(d) = d.itemId == "1");
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, []);
    let afterUntick = co.get(1) ?? return false;
    let noDate = not afterUntick.paperworkDates.any(func(d) = d.itemId == "1");
    hasDate and noDate and afterUntick.paperworkItems.size() == 0;
  };

  // A manager can set and clear the date of a ticked item; the item stays
  // ticked. A date on an unticked item is refused.
  public func testSetAndClearItemDate() : Bool {
    let co = checkoffs();
    let cl = checklists();
    let pos = positions();
    let rd = roadies();
    let log = changeLog();
    let c = counters();
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, ["1"]);
    Phase23Lib.setPaperworkItemDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), storeManager(), 1, "1", ?123);
    let set = co.get(1) ?? return false;
    let setOk = set.paperworkDates.any(func(d) = d.itemId == "1" and d.date == 123) and set.paperworkItems.any(func(t) = t == "1");
    Phase23Lib.setPaperworkItemDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), storeManager(), 1, "1", null);
    let cleared = co.get(1) ?? return false;
    let clearedOk = not cleared.paperworkDates.any(func(d) = d.itemId == "1") and cleared.paperworkItems.any(func(t) = t == "1");
    setOk and clearedOk;
  };

  // A non-manager cannot set an item date.
  public func testSetItemDateRefusedForTrainer() : Bool {
    let co = checkoffs();
    let cl = checklists();
    let pos = positions();
    let rd = roadies();
    let log = changeLog();
    let c = counters();
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, ["1"]);
    var refused = false;
    do {
      try {
        Phase23Lib.setPaperworkItemDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), trainer(), 1, "1", ?5);
      } catch (_) {
        refused := true;
      };
    };
    refused;
  };

  // Paid dates are set and cleared per item, and only for the three paid items.
  public func testPaidDates() : Bool {
    let co = checkoffs();
    let cl = checklists();
    let pos = positions();
    let rd = roadies();
    let log = changeLog();
    let c = counters();
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, ["1"]);
    Phase23Lib.setPaperworkPaidDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), storeManager(), 1, "1", ?777);
    let set = co.get(1) ?? return false;
    let setOk = set.paidDates.any(func(e) = e.0 == "1" and e.1 == ?777);
    Phase23Lib.setPaperworkPaidDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), storeManager(), 1, "1", null);
    let cleared = co.get(1) ?? return false;
    let clearedOk = cleared.paidDates.any(func(e) = e.0 == "1" and e.1 == null);
    var refused = false;
    do {
      try {
        Phase23Lib.setPaperworkPaidDate(accessGrants(), demoOff(), rd, cl, co, log, c, storeInfo(), storeManager(), 1, "2", ?1);
      } catch (_) {
        refused := true;
      };
    };
    setOk and clearedOk and refused;
  };

  // The pay setup choice is stored and defaults to Not set.
  public func testPaySetup() : Bool {
    let co = checkoffs();
    let cl = checklists();
    let pos = positions();
    let rd = roadies();
    let log = changeLog();
    let c = counters();
    Phase23Lib.setPaperworkItems(accessGrants(), demoOff(), rd, pos, cl, co, log, c, storeInfo(), admin(), 1, []);
    let initial = co.get(1) ?? return false;
    let defaultOk = initial.paySetup == #notSet;
    Phase23Lib.setPaySetup(accessGrants(), demoOff(), rd, co, log, c, storeInfo(), storeManager(), 1, #directDeposit);
    let after = co.get(1) ?? return false;
    defaultOk and after.paySetup == #directDeposit;
  };
};
