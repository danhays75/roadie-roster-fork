import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import StoreLib "../lib/store";
import Fixtures "fixtures";

/// Tests for the position coverage fields (weekday lunch par and the 14-shift
/// shifts-to-cover grid) saved through `lib/store.mo`. They drive the real
/// create/update paths with an Admin grant and demo mode off, so the
/// `requireRealSettingsAdmin` guard passes and the validation runs. A bad
/// shifts-to-cover list traps; a good one is stored and read back.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");

  func accessGrants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
    Fixtures.grant(admin(), #admin),
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

  func counters() : StoreLib.Counters = {
    var nextPositionId = 0;
    var nextEventId = 0;
    var nextBuildToAdjustmentId = 0;
    var nextChangeLogId = 0;
  };

  func changeLog() : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry> = Map.empty();

  func positions() : Map.Map<Common.PositionId, Store.Position> = Map.empty();

  // A position with the given coverage fields.
  func positionWith(weekdayLunchPar : Nat, shiftsToCover : [Nat]) : Store.Position {
    let p = Fixtures.position(0, "Server");
    { p with weekdayLunchPar; shiftsToCover };
  };

  // 14 zeros.
  func fourteen() : [Nat] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // Create a position with a good 14-entry grid and read it back.
  func createStoresCoverage() : Bool {
    let ps = positions();
    let id = StoreLib.createPosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), positionWith(3, fourteen()));
    switch (ps.get(id)) {
      case (?p) { p.weekdayLunchPar == 3 and p.shiftsToCover.size() == 14 };
      case null { false };
    };
  };

  // Create refuses a grid that is not exactly 14 entries.
  func createRefusesShortGrid() : Bool {
    let ps = positions();
    try {
      ignore StoreLib.createPosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), positionWith(0, [1, 2, 3]));
      false;
    } catch (_) {
      ps.size() == 0;
    };
  };

  // Update refuses a grid that is not exactly 14 entries and leaves the stored
  // position unchanged.
  func updateRefusesBadGrid() : Bool {
    let ps = positions();
    let id = StoreLib.createPosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), positionWith(2, fourteen()));
    let bad = { positionWith(9, [0, 0]) with id };
    let refused = try {
      StoreLib.updatePosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), bad);
      false;
    } catch (_) {
      true;
    };
    switch (ps.get(id)) {
      case (?p) { refused and p.weekdayLunchPar == 2 and p.shiftsToCover.size() == 14 };
      case null { false };
    };
  };

  // Update stores a good grid and the weekday lunch par.
  func updateStoresCoverage() : Bool {
    let ps = positions();
    let id = StoreLib.createPosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), positionWith(0, fourteen()));
    let grid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    StoreLib.updatePosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), { positionWith(7, grid) with id });
    switch (ps.get(id)) {
      case (?p) { p.weekdayLunchPar == 7 and p.shiftsToCover == grid };
      case null { false };
    };
  };

  // listPositions returns both coverage fields.
  func listReturnsCoverage() : Bool {
    let ps = positions();
    let id = StoreLib.createPosition(accessGrants(), demoOff(), ps, changeLog(), counters(), admin(), positionWith(4, fourteen()));
    let listed = StoreLib.listPositions(accessGrants(), demoOff(), ps, admin());
    switch (listed.find(func(p) = p.id == id)) {
      case (?p) { p.weekdayLunchPar == 4 and p.shiftsToCover.size() == 14 };
      case null { false };
    };
  };

  createStoresCoverage();
  createRefusesShortGrid();
  updateRefusesBadGrid();
  updateStoresCoverage();
  listReturnsCoverage();
  true;
};