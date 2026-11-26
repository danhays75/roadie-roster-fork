import Common "common";

module {
  /// One shift cell of a position's coverage grid: how many people of the
  /// position must work the shift (Needed), how many active, non-archived
  /// roadies are available for it (Available), and the fair-fill estimate of
  /// how many of those are actually assigned (Covered). `short` is true when
  /// Covered < Needed.
  public type CoverageCell = {
    day : Common.Weekday;
    shift : Common.Shift;
    needed : Nat;
    available : Nat;
    covered : Nat;
    short : Bool;
  };

  /// One named short shift: a shift whose Needed exceeds its Covered estimate,
  /// with the number of people still missing.
  public type ShortShift = {
    day : Common.Weekday;
    shift : Common.Shift;
    count : Nat;
  };

  /// The coverage view for one position. `hasGrid` is false when the position
  /// has no shifts-to-cover entered (every one of its 14 values is 0); the
  /// frontend then shows "Set shifts to cover in Admin > Positions" instead of
  /// a grid. `cells` is always the 14 shifts in Wed AM … Tue PM order.
  /// `shiftsNeeded` is the sum of the grid, `shiftCapacity` the sum of every
  /// counted person's capacity, `shortShifts` the number of needed cells not
  /// covered, and `stillToHire` the ceiling of shortShifts / 5.
  public type PositionCoverage = {
    positionId : Common.PositionId;
    positionName : Text;
    house : Common.House;
    hasGrid : Bool;
    cells : [CoverageCell];
    shiftsNeeded : Nat;
    shiftCapacity : Nat;
    shortShifts : Nat;
    stillToHire : Nat;
    shortShiftList : [ShortShift];
  };

  /// The FOH or BOH totals of shifts needed, capacity, short shifts and
  /// still-to-hire across the positions in that house.
  public type CoverageTotals = {
    shiftsNeeded : Nat;
    shiftCapacity : Nat;
    shortShifts : Nat;
    stillToHire : Nat;
  };

  /// The whole read-only coverage view: one block per position, plus the FOH
  /// and BOH totals. Never changes pars or build-to numbers.
  public type CoverageView = {
    positions : [PositionCoverage];
    foh : CoverageTotals;
    boh : CoverageTotals;
  };
};
