/**
 * Tests for the People Matrix workbook built by `buildPeopleMatrixWorkbook`.
 *
 * The frontend has no test runner installed, so this file is a self-contained
 * Node script: it builds the workbook from a small fixture and asserts the
 * sheet order and names, the Staff Pars blocks and columns, the position block
 * columns, real Excel dates, the Y and blank marks, and the final Shift
 * Coverage sheet. Run it with `node src/lib/peopleMatrix.test.ts` from
 * `src/frontend`; it exits non-zero on the first failed assertion.
 */
import assert from "node:assert/strict";
import type {
  CoverageView,
  ExportData,
  ExportRow,
  OrientationCheckoff,
  Position,
  Roadie,
} from "@/backend";
import {
  House as HouseEnum,
  PaySetup as PaySetupEnum,
  RoadieStatus,
  RosterState,
  Shift as ShiftEnum,
  Weekday as WeekdayEnum,
} from "@/backend";
import { buildPeopleMatrixWorkbook } from "@/lib/peopleMatrix";
import type { CellValue } from "exceljs";

/** A date-only value (nanoseconds since the epoch) for a UTC calendar day. */
function dateOnly(year: number, month: number, day: number): bigint {
  return BigInt(Date.UTC(year, month - 1, day)) * 1_000_000n;
}

/** A timestamp (nanoseconds since the epoch) for a UTC instant. */
function timestamp(year: number, month: number, day: number): bigint {
  return BigInt(Date.UTC(year, month - 1, day)) * 1_000_000n;
}

/** The paid-item ids the workbook reads for the onboarding, P&P and alcohol dates. */
const PAID_ITEM_IDS = {
  onboarding: "onboarding",
  policies: "policies",
  alcohol: "alcohol",
};

/** One export row for a roadie, with the fields the workbook reads. */
function exportRow(
  overrides: Partial<ExportRow> & { name: string },
): ExportRow {
  return {
    availabilityByDay: [
      [WeekdayEnum.wed, [ShiftEnum.am]],
      [WeekdayEnum.thu, [ShiftEnum.pm]],
    ],
    availability: [ShiftEnum.am, ShiftEnum.pm],
    onboardingComplete: true,
    foodHandlers: false,
    policiesComplete: true,
    alcoholCert: false,
    ...overrides,
  };
}

/** A roadie record for the extras, keyed by display name. */
function roadie(
  id: bigint,
  name: string,
  overrides: Partial<Roadie> = {},
): Roadie {
  return {
    id,
    status: RoadieStatus.active,
    mainPositionId: 1n,
    isDemo: false,
    rosterState: RosterState.active,
    isMinor: false,
    checkIns: [],
    hiredAt: timestamp(2026, 1, 1),
    profile: { name },
    ...overrides,
  };
}

/** A position record for the weekday lunch par. */
function position(id: bigint, name: string, weekdayLunchPar: bigint): Position {
  return {
    id,
    openingBuildTo: 0n,
    defaultHats: 0n,
    defaultShirts: 0n,
    house: HouseEnum.foh,
    afterOpeningBuildTo: 0n,
    weekdayLunchPar,
    minimumAge: 16n,
    code: name.slice(0, 3).toUpperCase(),
    name,
    shirtQty: 0n,
    shirtType: "",
    shiftsToCover: [],
    hatType: "",
    hatQty: 0n,
    needsAlcoholCert: false,
  };
}

/** An orientation check-off carrying the paid and ticked dates the workbook reads. */
function checkoff(roadieId: bigint): OrientationCheckoff {
  return {
    hatsCount: 0n,
    roadieId,
    paySetup: PaySetupEnum.directDeposit,
    uniformCounts: [],
    paperworkItems: [PAID_ITEM_IDS.onboarding, PAID_ITEM_IDS.policies],
    isDemo: false,
    paperworkDates: [
      { itemId: PAID_ITEM_IDS.onboarding, date: dateOnly(2026, 2, 3) },
      { itemId: PAID_ITEM_IDS.policies, date: dateOnly(2026, 2, 10) },
    ],
    paidDates: [
      [PAID_ITEM_IDS.onboarding, dateOnly(2026, 2, 5)],
      [PAID_ITEM_IDS.policies, dateOnly(2026, 2, 12)],
      [PAID_ITEM_IDS.alcohol, dateOnly(2026, 2, 20)],
    ],
    updatedAt: timestamp(2026, 2, 20),
    uniformItems: [],
    shirtsCount: 0n,
  };
}

/** The fixture export data: one server and one host, with overview totals. */
function fixtureExport(): ExportData {
  const server = exportRow({
    name: "Alex Rivera",
    dateHired: dateOnly(2026, 1, 15),
    weekdayLunch: true,
    shirtSize: "M",
    phone: "555-0100",
    alcoholCert: true,
  });
  const host = exportRow({
    name: "Sam Lee",
    dateHired: dateOnly(2026, 1, 20),
    weekdayLunch: false,
    shirtSize: "S",
  });
  return {
    fohNeed: 2n,
    fohTotal: 2n,
    groups: [
      ["Servers", [server]],
      ["Hosts", [host]],
    ],
    bohTotal: 0n,
    overview: [
      { hired: 1n, need: 0n, positionName: "Servers", totalPar: 1n },
      { hired: 1n, need: 0n, positionName: "Hosts", totalPar: 1n },
    ],
    bohNeed: 0n,
    grandTotal: 2n,
    grandTotalPar: 2n,
    bohTotalPar: 0n,
    fohTotalPar: 2n,
    grandNeed: 0n,
  };
}

/** The fixture coverage view: one Servers position with a short Wed AM shift. */
function fixtureCoverage(): CoverageView {
  return {
    boh: {
      shiftsNeeded: 0n,
      shortShifts: 0n,
      shiftCapacity: 0n,
      stillToHire: 0n,
    },
    foh: {
      shiftsNeeded: 1n,
      shortShifts: 1n,
      shiftCapacity: 1n,
      stillToHire: 1n,
    },
    positions: [
      {
        shiftsNeeded: 1n,
        hasGrid: true,
        shortShifts: 1n,
        house: HouseEnum.foh,
        cells: [
          {
            day: WeekdayEnum.wed,
            needed: 2n,
            available: 1n,
            shift: ShiftEnum.am,
            short: true,
            covered: 1n,
          },
        ],
        shortShiftList: [
          { day: WeekdayEnum.wed, count: 1n, shift: ShiftEnum.am },
        ],
        positionName: "Servers",
        positionId: 1n,
        shiftCapacity: 1n,
        stillToHire: 1n,
      },
    ],
  };
}

/** The fixture extras: the roadies, positions and check-offs the workbook reads. */
function fixtureExtras() {
  const alex = roadie(1n, "Alex Rivera", {
    profile: { name: "Alex Rivera", shiftsWantedPerWeek: 4n },
    checkIns: [{ at: timestamp(2026, 3, 4) }],
  });
  const sam = roadie(2n, "Sam Lee");
  return {
    roadies: [alex, sam],
    positions: [position(1n, "Servers", 3n), position(2n, "Hosts", 0n)],
    checkoffs: new Map<string, OrientationCheckoff>([
      ["1", checkoff(1n)],
      ["2", checkoff(2n)],
    ]),
    paidItemIds: PAID_ITEM_IDS,
  };
}

/** The cell values of one worksheet row, as a plain array. */
function rowValues(
  sheet: import("exceljs").Worksheet,
  rowNumber: number,
): unknown[] {
  const row = sheet.getRow(rowNumber);
  const values: unknown[] = [];
  for (let column = 1; column <= row.cellCount; column += 1) {
    values.push(row.getCell(column).value);
  }
  return values;
}

/** The index of a header label in a header row, or -1 when absent. */
function headerIndex(headers: unknown[], label: string): number {
  return headers.findIndex((value) => value === label);
}

function run(): void {
  const workbook = buildPeopleMatrixWorkbook(
    fixtureExport(),
    fixtureCoverage(),
    fixtureExtras(),
  );

  // Sheet order and names: Recruiting Locations, Staff Pars and Overview, the
  // position sheets in their fixed order, then Shift Coverage last.
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  assert.deepEqual(sheetNames.slice(0, 2), [
    "Recruiting Locations",
    "Staff Pars and Overview",
  ]);
  assert.equal(sheetNames[sheetNames.length - 1], "Shift Coverage");
  assert.deepEqual(sheetNames.slice(2, -1), [
    "Servers",
    "Bartenders",
    "Hosts and TOGO",
    "SA",
    "Expo",
    "Meat",
    "Cold",
    "DMO Prep",
    "Hot Prep",
    "Bake and Pizza",
    "Point and Fry-Salad",
    "Broil and Sear",
    "Dish and Silverware",
  ]);

  // The Recruiting Locations sheet carries its headers only.
  const recruiting = workbook.getWorksheet("Recruiting Locations");
  assert.ok(recruiting);
  assert.deepEqual(rowValues(recruiting, 1), [
    "Location",
    "Address",
    "Contact",
    "Phone",
    "Notes",
  ]);
  assert.equal(recruiting.rowCount, 1);

  // The Staff Pars and Overview sheet: the overview columns, then the FOH,
  // BOH and Total blocks with their per-position rows and bold total rows.
  const overview = workbook.getWorksheet("Staff Pars and Overview");
  assert.ok(overview);
  assert.deepEqual(rowValues(overview, 1), [
    "Position",
    "Total par (opening build-to)",
    "Hired",
    "Wkdy par",
    "Wkdy Lunch",
    "Need",
  ]);
  const overviewText = overview
    .getSheetValues()
    .flat()
    .filter((value): value is string => typeof value === "string");
  assert.ok(overviewText.includes("FOH"));
  assert.ok(overviewText.includes("BOH"));
  assert.ok(overviewText.includes("Total FOH"));
  assert.ok(overviewText.includes("Total BOH"));
  assert.ok(overviewText.includes("Total"));
  // The Servers row reads its par, hired and weekday lunch par from the fixture.
  const serversRow = overview
    .getSheetValues()
    .find(
      (row): row is CellValue[] =>
        Array.isArray(row) && (row as CellValue[])[1] === "Servers",
    );
  assert.ok(serversRow);
  assert.equal(serversRow[2], 1); // total par
  assert.equal(serversRow[3], 1); // hired
  assert.equal(serversRow[4], 3); // weekday lunch par from the position
  assert.equal(serversRow[5], 1); // weekday lunch hired
  assert.equal(serversRow[6], 0); // need = hired - total par

  // The Servers position block: the server columns, a real Excel date for the
  // hire date, Y marks for the weekday lunch and alcohol cert, and the paid
  // and ticked dates as real Excel dates.
  const servers = workbook.getWorksheet("Servers");
  assert.ok(servers);
  assert.equal(rowValues(servers, 1)[0], "Servers");
  const serverHeaders = rowValues(servers, 2);
  assert.deepEqual(serverHeaders.slice(0, 3), ["#", "First Name", "Last Name"]);
  for (const label of [
    "Date hired",
    "Wkdy Lunch (Y)",
    "Shirt size",
    "Phone",
    "Onboarding date complete",
    "Onboarding pay",
    "Direct deposit (Y)",
    "Pay card (Y)",
    "P&P date",
    "P&P pay",
    "Alcohol certification complete",
    "Alcohol cert. time paid",
    "Food handlers",
    "How many hours or shifts do they want?",
  ]) {
    assert.ok(headerIndex(serverHeaders, label) >= 0, `missing ${label}`);
  }
  // The 14 availability columns run Wed AM through Tue PM.
  assert.equal(headerIndex(serverHeaders, "Wed AM"), 3 + 13 + 7);
  assert.equal(headerIndex(serverHeaders, "Tue PM"), 3 + 13 + 7 + 13);

  const serverRow = rowValues(servers, 3);
  assert.equal(serverRow[0], 1);
  assert.equal(serverRow[1], "Alex");
  assert.equal(serverRow[2], "Rivera");
  const hiredCell = servers
    .getRow(3)
    .getCell(headerIndex(serverHeaders, "Date hired") + 1);
  assert.ok(hiredCell.value instanceof Date, "hire date is a real Excel date");
  assert.equal(
    (hiredCell.value as Date).toISOString().slice(0, 10),
    "2026-01-15",
  );
  assert.equal(serverRow[headerIndex(serverHeaders, "Wkdy Lunch (Y)")], "Y");
  assert.equal(serverRow[headerIndex(serverHeaders, "Shirt size")], "M");
  assert.equal(serverRow[headerIndex(serverHeaders, "Phone")], "555-0100");
  assert.equal(
    serverRow[headerIndex(serverHeaders, "Direct deposit (Y)")],
    "Y",
  );
  assert.equal(serverRow[headerIndex(serverHeaders, "Pay card (Y)")], "");
  assert.equal(
    serverRow[headerIndex(serverHeaders, "Alcohol certification complete")],
    "Y",
  );
  assert.equal(serverRow[headerIndex(serverHeaders, "Food handlers")], "");
  assert.equal(
    serverRow[
      headerIndex(serverHeaders, "How many hours or shifts do they want?")
    ],
    4,
  );
  const onboardingCell = servers
    .getRow(3)
    .getCell(headerIndex(serverHeaders, "Onboarding date complete") + 1);
  assert.ok(onboardingCell.value instanceof Date);
  assert.equal(
    (onboardingCell.value as Date).toISOString().slice(0, 10),
    "2026-02-03",
  );
  const onboardingPayCell = servers
    .getRow(3)
    .getCell(headerIndex(serverHeaders, "Onboarding pay") + 1);
  assert.ok(onboardingPayCell.value instanceof Date);
  assert.equal(
    (onboardingPayCell.value as Date).toISOString().slice(0, 10),
    "2026-02-05",
  );
  // The availability marks: Wed AM and Thu PM are Y, Wed PM is blank.
  assert.equal(serverRow[headerIndex(serverHeaders, "Wed AM")], "Y");
  assert.equal(serverRow[headerIndex(serverHeaders, "Wed PM")], "");
  assert.equal(serverRow[headerIndex(serverHeaders, "Thu PM")], "Y");

  // The Hosts block inside "Hosts and TOGO" uses the single Name column and no
  // alcohol columns, and the host's weekday lunch mark is blank.
  const hostsSheet = workbook.getWorksheet("Hosts and TOGO");
  assert.ok(hostsSheet);
  assert.equal(rowValues(hostsSheet, 1)[0], "Hosts");
  const hostHeaders = rowValues(hostsSheet, 2);
  assert.deepEqual(hostHeaders.slice(0, 2), ["#", "Name"]);
  assert.equal(headerIndex(hostHeaders, "First Name"), -1);
  assert.equal(headerIndex(hostHeaders, "Alcohol certification complete"), -1);
  const hostRow = rowValues(hostsSheet, 3);
  assert.equal(hostRow[1], "Sam Lee");
  assert.equal(hostRow[headerIndex(hostHeaders, "Wkdy Lunch (Y)")], "");

  // The final Shift Coverage sheet: one block per position with the 14 shift
  // columns, the Needed/Available/Covered/Short rows and the still-to-hire row.
  const coverage = workbook.getWorksheet("Shift Coverage");
  assert.ok(coverage);
  assert.equal(rowValues(coverage, 1)[0], "Servers");
  const coverageHeaders = rowValues(coverage, 2);
  assert.equal(coverageHeaders[0], "");
  assert.equal(coverageHeaders[1], "Wed AM");
  assert.equal(coverageHeaders[14], "Tue PM");
  assert.equal(coverageHeaders[15], "Weekly total");
  assert.equal(rowValues(coverage, 3)[0], "Needed");
  assert.equal(rowValues(coverage, 3)[1], 2);
  assert.equal(rowValues(coverage, 4)[0], "Available");
  assert.equal(rowValues(coverage, 4)[1], 1);
  assert.equal(rowValues(coverage, 5)[0], "Covered");
  assert.equal(rowValues(coverage, 5)[1], 1);
  assert.equal(rowValues(coverage, 6)[0], "Short");
  assert.equal(rowValues(coverage, 6)[1], 1);
  assert.equal(rowValues(coverage, 7)[0], "Still to hire");
  assert.equal(rowValues(coverage, 7)[1], 1);

  console.log("peopleMatrix.test.ts: all assertions passed");
}

run();
