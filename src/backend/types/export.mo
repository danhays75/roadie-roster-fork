import Common "common";

module {
  /// One row of a position-group export tab. The Full export fills the whole
  /// contact set (phone, email, emergency contact, date of birth, availability
  /// by day and shift); the Shareable export leaves those fields null/empty.
  public type ExportRow = {
    dateHired : ?Common.DateOnly;
    shirtSize : ?Text;
    weekdayLunch : ?Bool;
    name : Text;
    favoriteTeam : ?Text;
    favoriteSnack : ?Text;
    favoriteDrink : ?Text;
    favoriteColor : ?Text;
    phone : ?Common.Phone;
    email : ?Common.Email;
    emergencyContactName : ?Text;
    emergencyContactPhone : ?Common.Phone;
    dateOfBirth : ?Common.DateOnly;
    availabilityByDay : [(Common.Weekday, [Common.Shift])];
    onboardingComplete : Bool;
    policiesComplete : Bool;
    alcoholCert : Bool;
    foodHandlers : Bool;
    availability : [Common.Shift];
  };

  /// One row of the Staff Pars and Overview tab.
  public type OverviewRow = {
    positionName : Text;
    totalPar : Nat;
    hired : Nat;
    need : Nat;
  };

  /// The full export payload. `fohTotal`/`bohTotal`/`grandTotal` are hired
  /// counts; the matching `*TotalPar` and `*Need` fields fill the Total Par and
  /// Need cells of the FOH, BOH and Grand total rows on the overview sheet.
  public type ExportData = {
    overview : [OverviewRow];
    fohTotal : Nat;
    bohTotal : Nat;
    grandTotal : Nat;
    fohTotalPar : Nat;
    fohNeed : Nat;
    bohTotalPar : Nat;
    bohNeed : Nat;
    grandTotalPar : Nat;
    grandNeed : Nat;
    groups : [(Text, [ExportRow])];
  };

  // --- People Matrix download ---

  /// One position block row of the People Matrix download: the roadie's
  /// per-column values. `firstName`/`lastName` are split at the last space for
  /// the Servers sheet; every other sheet uses `name`. Dates are real Excel
  /// dates; `Y` flags are true/false and render as "Y" or blank. `foodHandlers`
  /// is always false (not used at #975) so the column stays blank.
  public type PeopleMatrixRow = {
    number : Nat;
    dateHired : ?Common.DateOnly;
    weekdayLunch : Bool;
    shirtSize : ?Text;
    name : Text;
    firstName : Text;
    lastName : Text;
    phone : ?Common.Phone;
    onboardingDateComplete : ?Common.DateOnly;
    onboardingPay : ?Common.DateOnly;
    directDeposit : Bool;
    payCard : Bool;
    policiesDate : ?Common.DateOnly;
    policiesPay : ?Common.DateOnly;
    alcoholCertComplete : Bool;
    alcoholCertPaid : ?Common.DateOnly;
    foodHandlers : Bool;
    /// The check-in date in each of the 7 weeks ending this week (Wednesdays),
    /// oldest first; null when no check-in that week.
    weeklyCheckIns : [?Common.DateOnly];
    /// 14 availability flags in Wed AM … Tue PM order.
    availability : [Bool];
    /// Shifts wanted per week (Servers only); null when unset.
    shiftsWantedPerWeek : ?Nat;
  };

  /// One position block of the People Matrix download: the position name, the
  /// combined-sheet block label, and its rows.
  public type PeopleMatrixBlock = {
    positionName : Text;
    blockLabel : Text;
    rows : [PeopleMatrixRow];
  };

  /// One Staff Pars and Overview row of the People Matrix download.
  public type StaffParsRow = {
    positionName : Text;
    totalPar : Nat;
    hired : Nat;
    weekdayPar : Nat;
    weekdayLunch : Nat;
    need : Int;
  };

  /// One shift-coverage cell of the Shift Coverage sheet: the 14 shifts as
  /// columns, with Needed, Available, Covered and Short per shift.
  public type ShiftCoverageBlock = {
    positionName : Text;
    needed : [Nat];
    available : [Nat];
    covered : [Nat];
    short : [Nat];
    shiftsNeededPerWeek : Nat;
    shiftCapacity : Nat;
    shortShifts : Nat;
    stillToHire : Nat;
  };

  /// The People Matrix download payload: the sheet order, the Staff Pars rows,
  /// the position blocks and the Shift Coverage blocks.
  public type PeopleMatrixData = {
    staffPars : [StaffParsRow];
    blocks : [PeopleMatrixBlock];
    coverage : [ShiftCoverageBlock];
  };
};
