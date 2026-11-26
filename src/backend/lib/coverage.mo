import Array "mo:core/Array";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import VarArray "mo:core/VarArray";
import Common "../types/common";
import Store "../types/store";
import Roadie "../types/roadie";
import Access "../types/access";
import Coverage "../types/coverage";
import Auth "auth";

/// Read-only shift coverage estimate. Counts active, non-archived roadies
/// (pending and active roster states) by their MAIN position only, using their
/// signed availability and shifts wanted per week. A person's capacity is the
/// smaller of 5, their shifts wanted per week when set, and the number of
/// shifts they are available for. Covered is a deterministic fair fill: the
/// hardest shifts (fewest available people per person needed) are filled first,
/// assigning people available that shift who still have capacity, preferring
/// people with the fewest available shifts, each person used at most their
/// capacity, with stable ordering by roadie id. This never changes pars or
/// build-to numbers.
module {
  /// The 14 shifts in Wed AM through Tue PM order.
  let days : [Common.Weekday] = [#wed, #thu, #fri, #sat, #sun, #mon, #tue];

  /// The per-person cap on shifts covered in a week.
  let weeklyCap : Nat = 5;

  /// A counted person: their roadie id, capacity, and the 14 shift indices they
  /// are available for.
  type Person = {
    id : Common.RoadieId;
    capacity : Nat;
    available : [Bool];
  };

  /// `a - b`, clamped at zero, without a trapping Nat subtraction.
  func saturatingSub(a : Nat, b : Nat) : Nat {
    if (a <= b) { 0 } else { a - b };
  };

  /// The index (0..13) of a day/shift pair in Wed AM … Tue PM order.
  func shiftIndex(day : Common.Weekday, shift : Common.Shift) : Nat {
    let d = switch (day) {
      case (#wed) { 0 };
      case (#thu) { 1 };
      case (#fri) { 2 };
      case (#sat) { 3 };
      case (#sun) { 4 };
      case (#mon) { 5 };
      case (#tue) { 6 };
    };
    let s = switch (shift) {
      case (#am) { 0 };
      case (#pm) { 1 };
    };
    d * 2 + s;
  };

  /// The day and shift for a shift index (0..13).
  func shiftAt(index : Nat) : (Common.Weekday, Common.Shift) {
    let day = days[index / 2];
    let shift = if (index % 2 == 0) { #am } else { #pm };
    (day, shift);
  };

  /// The 14 shifts-to-cover values of a position, padded to exactly 14 with 0
  /// so a short or empty array never traps.
  func shiftsToCover(p : Store.Position) : [Nat] {
    Array.tabulate(14, func(i) = if (i < p.shiftsToCover.size()) { p.shiftsToCover[i] } else { 0 });
  };

  /// Build the counted people for one position: active, non-archived roadies in
  /// the active demo partition whose MAIN position is `positionId`, each with
  /// their capacity and availability mask.
  func peopleFor(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    positionId : Common.PositionId,
  ) : [Person] {
    let out = List.empty<Person>();
    for (r in roadies.values()) {
      if (r.isDemo == demo
        and r.status != #archived
        and r.mainPositionId == positionId
        and (r.rosterState == #pending or r.rosterState == #active)) {
        let mask : [var Bool] = [var false, false, false, false, false, false, false, false, false, false, false, false, false, false];
        var availableCount = 0;
        switch (r.contactSet) {
          case (?cs) {
            for (slot in cs.availability.values()) {
              let idx = shiftIndex(slot.day, slot.shift);
              if (not mask[idx]) {
                mask[idx] := true;
                availableCount += 1;
              };
            };
          };
          case null {};
        };
        let wanted = switch (r.profile.shiftsWantedPerWeek) {
          case (?w) { w };
          case null { weeklyCap };
        };
        let capacity = Nat.min(Nat.min(weeklyCap, wanted), availableCount);
        out.add({ id = r.id; capacity; available = mask.toArray() });
      };
    };
    out.toArray();
  };

  /// The fair-fill Covered estimate for one position's 14 shifts. Returns the
  /// covered count per shift index.
  func fairFill(needed : [Nat], people : [Person]) : [Nat] {
    let covered : [var Nat] = [var 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // Remaining capacity per person, indexed the same as `people`.
    let remaining : [var Nat] = people.map(func(p) = p.capacity).toVarArray();
    // Available count per shift.
    let available = Array.tabulate(14, func(i) =
      people.filter(func(p) = p.available[i]).size()
    );
    // The shift indices that need people, hardest first: fewest available per
    // person needed, then by shift index for a stable order.
    let order = List.empty<Nat>();
    for (i in Nat.range(0, 14)) {
      if (needed[i] > 0) { order.add(i) };
    };
    let ordered = order.toArray().sort(func(a, b) {
      let ra = available[a] * needed[b];
      let rb = available[b] * needed[a];
      if (ra < rb) { #less } else if (ra > rb) { #greater } else if (a < b) { #less } else if (a > b) { #greater } else { #equal };
    });
    for (i in ordered.values()) {
      // Candidates available for this shift with capacity left, preferring the
      // fewest available shifts, then the lowest roadie id.
      let candidates = List.empty<Nat>();
      for (j in Nat.range(0, people.size())) {
        if (people[j].available[i] and remaining[j] > 0) { candidates.add(j) };
      };
      let ranked = candidates.toArray().sort(func(a, b) {
        let ca = people[a].capacity;
        let cb = people[b].capacity;
        if (ca < cb) { #less } else if (ca > cb) { #greater } else if (people[a].id < people[b].id) { #less } else if (people[a].id > people[b].id) { #greater } else { #equal };
      });
      var filled = 0;
      for (j in ranked.values()) {
        if (filled >= needed[i]) { break };
        if (remaining[j] > 0) {
          remaining[j] -= 1;
          filled += 1;
        };
      };
      covered[i] := filled;
    };
    covered.toArray();
  };

  /// Build the coverage block for one position.
  public func positionCoverage(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    p : Store.Position,
  ) : Coverage.PositionCoverage {
    let needed = shiftsToCover(p);
    let hasGrid = needed.any(func(n) = n > 0);
    let people = peopleFor(roadies, demo, p.id);
    let covered = fairFill(needed, people);
    let available = Array.tabulate(14, func(i) =
      people.filter(func(person) = person.available[i]).size()
    );
    let cells = Array.tabulate(14, func(i) {
      let (day, shift) = shiftAt(i);
      {
        day;
        shift;
        needed = needed[i];
        available = available[i];
        covered = covered[i];
        short = covered[i] < needed[i];
      };
    });
    var shiftsNeeded = 0;
    var shortShifts = 0;
    let shortList = List.empty<Coverage.ShortShift>();
    for (i in Nat.range(0, 14)) {
      shiftsNeeded += needed[i];
      let missing = saturatingSub(needed[i], covered[i]);
      shortShifts += missing;
      if (missing > 0) {
        let (day, shift) = shiftAt(i);
        shortList.add({ day; shift; count = missing });
      };
    };
    let shiftCapacity = people.foldLeft(0, func(acc, person) = acc + person.capacity);
    {
      positionId = p.id;
      positionName = p.name;
      house = p.house;
      hasGrid;
      cells;
      shiftsNeeded;
      shiftCapacity;
      shortShifts;
      stillToHire = (shortShifts + 4) / 5;
      shortShiftList = shortList.toArray();
    };
  };

  /// Sum the totals for one house across the position blocks. `shiftsNeeded`,
  /// `shiftCapacity` and `shortShifts` are plain sums. `stillToHire` is the sum
  /// of each position's own stillToHire, because people cannot cover another
  /// position's shifts.
  func totalsFor(blocks : [Coverage.PositionCoverage], house : Common.House) : Coverage.CoverageTotals {
    var shiftsNeeded = 0;
    var shiftCapacity = 0;
    var shortShifts = 0;
    var stillToHire = 0;
    for (b in blocks.values()) {
      if (b.house == house) {
        shiftsNeeded += b.shiftsNeeded;
        shiftCapacity += b.shiftCapacity;
        shortShifts += b.shortShifts;
        stillToHire += b.stillToHire;
      };
    };
    { shiftsNeeded; shiftCapacity; shortShifts; stillToHire };
  };

  /// True when a role may read the coverage view: Admin, Managing Partner,
  /// Store Manager, Training Manager, Kitchen Manager or Service Manager.
  public func roleCanReadCoverage(role : Common.Role) : Bool {
    Auth.roleHasAdminRights(role)
      or role == #storeManager
      or role == #trainingManager
      or role == #kitchenManager
      or role == #serviceManager;
  };

  /// Read the coverage view for the six manager roles; every other role is
  /// refused. Counts only active, non-archived roadies in the pending and
  /// active roster states, by their main position only, respecting the demo
  /// partition. Read-only: never changes pars or build-to numbers.
  public func getCoverage(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    positions : Map.Map<Common.PositionId, Store.Position>,
    caller : Principal,
  ) : Coverage.CoverageView {
    let role = Auth.requireRegistered(accessGrants, demoState, caller);
    if (not roleCanReadCoverage(role)) {
      Runtime.trap("Access denied: coverage is readable only by manager roles");
    };
    let demo = Auth.demoActive(demoState);
    let blocks = positions.values()
      .map(func(p) = positionCoverage(roadies, demo, p))
      .toArray();
    {
      positions = blocks;
      foh = totalsFor(blocks, #foh);
      boh = totalsFor(blocks, #boh);
    };
  };
};
