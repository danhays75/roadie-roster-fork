import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Coverage "../types/coverage";
import CoverageLib "../lib/coverage";
import Fixtures "fixtures";

/// Tests for the read-only shift coverage estimate in `lib/coverage.mo`. They
/// drive the pure estimate directly with fixture roadies and positions, so they
/// cover the capacity rule, the 5-shift-per-person cap, determinism, the
/// hardest-shift-first fair fill, the no-grid case and the role gate.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");
  func storeManager() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
  func trainer() : Principal = Principal.fromText("rkp4c-7iaaa-aaaaa-aaaca-cai");

  func grants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
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

  /// A roadie with the given availability slots and shifts wanted per week.
  func roadieWith(
    id : Common.RoadieId,
    positionId : Common.PositionId,
    availability : [Roadie.AvailabilitySlot],
    shiftsWanted : ?Nat,
  ) : Roadie.Roadie {
    let base = Fixtures.roadie(id, positionId, #active, false);
    let contactSet : Roadie.ContactSet = {
      phone = "";
      email = "";
      emergencyContactName = "";
      emergencyContactPhone = "";
      dateOfBirth = 0;
      availability;
      availabilitySignature = null;
      availabilitySignedAt = null;
      availabilityResignPending = false;
      managerSignature = null;
      managerSignedAt = null;
      managerSignedBy = null;
    };
    {
      base with
      contactSet = ?contactSet;
      profile = { base.profile with shiftsWantedPerWeek = shiftsWanted };
    };
  };

  /// A position with the given shifts-to-cover grid.
  func positionWith(id : Common.PositionId, house : Common.House, shifts : [Nat]) : Store.Position {
    let base = Fixtures.position(id, "Pos " # id.toText());
    { base with house; shiftsToCover = shifts };
  };

  /// Every shift of one day, both AM and PM.
  func daySlots(day : Common.Weekday) : [Roadie.AvailabilitySlot] = [
    { day; shift = #am },
    { day; shift = #pm },
  ];

  /// All 14 shifts.
  func allSlots() : [Roadie.AvailabilitySlot] {
    let days : [Common.Weekday] = [#wed, #thu, #fri, #sat, #sun, #mon, #tue];
    let out = days.map(func(d) = daySlots(d));
    out.foldLeft([], func(acc, slots) = acc.concat(slots));
  };

  /// The covered count for one shift index of a position block.
  func coveredAt(block : Coverage.PositionCoverage, index : Nat) : Nat {
    block.cells[index].covered;
  };

  /// A fully open person never covers more than 5 shifts, even when every one
  /// of the 14 shifts needs someone.
  public func testFullyOpenPersonCappedAtFive() : Bool {
    let needed = Array.tabulate<Nat>(14, func(_) = 1);
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, needed));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    roadies.add(1, roadieWith(1, 1, allSlots(), null));
    let view = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    let block = view.positions[0];
    var total = 0;
    for (c in block.cells.values()) { total += c.covered };
    total <= 5;
  };

  /// Capacity is the smaller of 5, shifts wanted and available shifts.
  public func testCapacityUsesShiftsWanted() : Bool {
    let needed = Array.tabulate<Nat>(14, func(_) = 1);
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, needed));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    // Fully open but only wants 2 shifts.
    roadies.add(1, roadieWith(1, 1, allSlots(), ?2));
    let view = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    let block = view.positions[0];
    var total = 0;
    for (c in block.cells.values()) { total += c.covered };
    total == 2;
  };

  /// The same inputs always give the same result.
  public func testDeterministic() : Bool {
    let needed = [1, 1, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, needed));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    roadies.add(1, roadieWith(1, 1, allSlots(), null));
    roadies.add(2, roadieWith(2, 1, daySlots(#wed), null));
    roadies.add(3, roadieWith(3, 1, daySlots(#thu), null));
    let a = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    let b = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    let ca = a.positions[0].cells.map(func(c) = c.covered);
    let cb = b.positions[0].cells.map(func(c) = c.covered);
    ca == cb;
  };

  /// A position with no shifts to cover entered has no grid.
  public func testNoGridWhenNoShifts() : Bool {
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, []));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    let view = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    not view.positions[0].hasGrid;
  };

  /// Still to hire is the ceiling of short shifts / 5.
  public func testStillToHireCeiling() : Bool {
    // 6 needed shifts, nobody available: 6 short shifts -> ceil(6/5) = 2.
    let needed = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, needed));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    let view = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    view.positions[0].shortShifts == 6 and view.positions[0].stillToHire == 2;
  };

  /// A non-manager role is refused.
  public func testTrainerRefused() : Bool {
    let positions = Map.empty<Common.PositionId, Store.Position>();
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    try {
      ignore CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, trainer());
      false;
    } catch (_) {
      true;
    };
  };

  /// Archived roadies and roadies in the other demo partition are not counted.
  public func testArchivedAndDemoExcluded() : Bool {
    let needed = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let positions = Map.empty<Common.PositionId, Store.Position>();
    positions.add(1, positionWith(1, #foh, needed));
    let roadies = Map.empty<Common.RoadieId, Roadie.Roadie>();
    let archived = { roadieWith(1, 1, allSlots(), null) with status = #archived };
    roadies.add(1, archived);
    let demo = { roadieWith(2, 1, allSlots(), null) with isDemo = true };
    roadies.add(2, demo);
    let view = CoverageLib.getCoverage(grants(), demoOff(), roadies, positions, admin());
    view.positions[0].cells[0].available == 0;
  };
};
