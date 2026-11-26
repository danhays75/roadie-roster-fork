import type {
  CoverageView,
  DateOnly,
  ExportData,
  ExportRow,
  OrientationCheckoff,
  Position,
  Roadie,
  Shift,
  Weekday,
} from "@/backend";
import {
  House as HouseEnum,
  PaySetup as PaySetupEnum,
  Shift as ShiftEnum,
  Weekday as WeekdayEnum,
} from "@/backend";
import { COVERAGE_SHIFTS, formatCoverage } from "@/lib/coverage";
import { dateOnlyToDate } from "@/lib/format";
import ExcelJS from "exceljs";

/**
 * The People Matrix workbook: the Full export data plus the coverage result,
 * laid out as the store's working spreadsheet. Sheet order and names are fixed
 * by the store's template, so they are declared here rather than derived.
 */

/** The sheet that carries the recruiting-locations headers only. */
const RECRUITING_SHEET = "Recruiting Locations";
const OVERVIEW_SHEET = "Staff Pars and Overview";
const COVERAGE_SHEET = "Shift Coverage";

/** The recruiting-locations headers, written with no rows beneath them. */
const RECRUITING_HEADERS = ["Location", "Address", "Contact", "Phone", "Notes"];

/** The 7 check-in columns: the week-start Wednesdays ending this week. */
const CHECK_IN_WEEKS = 7;

/** The 14 availability columns, Wed AM through Tue PM. */
const AVAILABILITY_COLUMNS = COVERAGE_SHIFTS;

/** Short day labels for the Wed–Tue availability columns. */
const WEEKDAY_LABELS: Record<Weekday, string> = {
  [WeekdayEnum.wed]: "Wed",
  [WeekdayEnum.thu]: "Thu",
  [WeekdayEnum.fri]: "Fri",
  [WeekdayEnum.sat]: "Sat",
  [WeekdayEnum.sun]: "Sun",
  [WeekdayEnum.mon]: "Mon",
  [WeekdayEnum.tue]: "Tue",
};

/** Short shift labels. */
const SHIFT_LABELS: Record<Shift, string> = {
  [ShiftEnum.am]: "AM",
  [ShiftEnum.pm]: "PM",
};

/** One position block inside a sheet: its title and the export groups it stacks. */
interface PositionBlock {
  title: string;
  groups: string[];
}

/** One position sheet: its name and the blocks stacked into it, in order. */
interface PositionSheet {
  sheet: string;
  blocks: PositionBlock[];
}

/**
 * The position sheets in workbook order. A combined sheet stacks one block per
 * position in the store's order; a single-position sheet has one block.
 */
const POSITION_SHEETS: PositionSheet[] = [
  {
    sheet: "Servers",
    blocks: [{ title: "Servers", groups: ["Servers", "Server"] }],
  },
  {
    sheet: "Bartenders",
    blocks: [{ title: "Bartenders", groups: ["Bartenders", "Bartender"] }],
  },
  {
    sheet: "Hosts and TOGO",
    blocks: [
      { title: "Hosts", groups: ["Hosts"] },
      { title: "To-go", groups: ["TOGO", "To-go", "To Go"] },
    ],
  },
  { sheet: "SA", blocks: [{ title: "SA", groups: ["SA"] }] },
  { sheet: "Expo", blocks: [{ title: "Expo", groups: ["Expo"] }] },
  { sheet: "Meat", blocks: [{ title: "Meat cutter", groups: ["Meat"] }] },
  { sheet: "Cold", blocks: [{ title: "Cold prep", groups: ["Cold"] }] },
  { sheet: "DMO Prep", blocks: [{ title: "DMO prep", groups: ["DMO Prep"] }] },
  { sheet: "Hot Prep", blocks: [{ title: "Hot prep", groups: ["Hot Prep"] }] },
  {
    sheet: "Bake and Pizza",
    blocks: [
      { title: "Bake", groups: ["Bake"] },
      { title: "Pizza", groups: ["Pizza"] },
    ],
  },
  {
    sheet: "Point and Fry-Salad",
    blocks: [
      { title: "Point/Build", groups: ["Point", "Point/Build"] },
      { title: "Fry/Salad", groups: ["Fry-Salad", "Fry/Salad"] },
    ],
  },
  {
    sheet: "Broil and Sear",
    blocks: [
      { title: "Broil/Saute", groups: ["Broil", "Broil/Saute"] },
      { title: "Sear", groups: ["Sear"] },
    ],
  },
  {
    sheet: "Dish and Silverware",
    blocks: [
      { title: "Dish", groups: ["Dish"] },
      { title: "Silverware roller", groups: ["Silverware"] },
    ],
  },
];

/** The FOH overview block, in the store's order. */
const FOH_OVERVIEW = [
  "Servers",
  "Bartenders",
  "Hosts",
  "To-go",
  "Server assistants",
];

/** The BOH overview block, in the store's order. */
const BOH_OVERVIEW = [
  "Expo",
  "Meat cutter",
  "Hot prep",
  "Cold prep",
  "DMO prep",
  "Bake",
  "Sear",
  "Point/Build",
  "Fry/Salad",
  "Pizza",
  "Broil/Saute",
  "Dish",
  "Silverware roller",
];

/** The overview columns, in the store's order. */
const OVERVIEW_HEADERS = [
  "Position",
  "Total par (opening build-to)",
  "Hired",
  "Wkdy par",
  "Wkdy Lunch",
  "Need",
];

/** The coverage rows inside each position block. */
const COVERAGE_ROWS = ["Needed", "Available", "Covered", "Short"];

/** The extra data the People Matrix needs beyond the Full export. */
export interface PeopleMatrixExtras {
  /** Every roadie in the active partition, for check-ins and pay setup. */
  roadies: Roadie[];
  /** Positions, for the weekday lunch par. */
  positions: Position[];
  /** Orientation check-offs keyed by roadie id, for pay setup and paid dates. */
  checkoffs: Map<string, OrientationCheckoff>;
  /** Paperwork item ids for the onboarding, P&P and alcohol paid dates. */
  paidItemIds: { onboarding: string; policies: string; alcohol: string };
}

/** The roadie's display name, matching how the export names them. */
function roadieName(roadie: Roadie): string {
  return roadie.profile.preferredName?.trim() || roadie.profile.name.trim();
}

/** Index roadies by their display name for matching export rows. */
function roadiesByName(roadies: Roadie[]): Map<string, Roadie> {
  const map = new Map<string, Roadie>();
  for (const roadie of roadies) {
    map.set(normalize(roadieName(roadie)), roadie);
  }
  return map;
}

/** Normalize a group or position name for matching. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** The export rows for one block, stacking its groups in the declared order. */
function rowsForGroups(data: ExportData, groups: string[]): ExportRow[] {
  const byName = new Map<string, ExportRow[]>();
  for (const [groupName, rows] of data.groups) {
    byName.set(normalize(groupName), rows);
  }
  const rows: ExportRow[] = [];
  for (const group of groups) {
    const match = byName.get(normalize(group));
    if (match) rows.push(...match);
  }
  return rows;
}

/** A real Excel date for a date-only value, or null when absent. */
function excelDate(dateOnly: DateOnly | undefined): Date | null {
  if (dateOnly === undefined) return null;
  return dateOnlyToDate(dateOnly);
}

/** A real Excel date for a nanosecond timestamp, or null when absent. */
function excelTimestamp(timestamp: bigint | undefined): Date | null {
  if (timestamp === undefined) return null;
  const date = new Date(Number(timestamp / 1_000_000n));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Y` for yes, blank otherwise. */
function yesMark(value: boolean): string {
  return value ? "Y" : "";
}

/** The UTC calendar day of a date, as a day number since the epoch. */
function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );
}

/** The Wednesday that starts the week containing `date` (UTC). */
function weekStartWednesday(date: Date): Date {
  const day = date.getUTCDay();
  const offset = (day - 3 + 7) % 7;
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - offset,
    ),
  );
}

/** The 7 week-start Wednesdays ending this week, oldest first. */
function checkInWeekStarts(now: Date): Date[] {
  const thisWeek = weekStartWednesday(now);
  const weeks: Date[] = [];
  for (let index = CHECK_IN_WEEKS - 1; index >= 0; index -= 1) {
    weeks.push(
      new Date(
        Date.UTC(
          thisWeek.getUTCFullYear(),
          thisWeek.getUTCMonth(),
          thisWeek.getUTCDate() - index * 7,
        ),
      ),
    );
  }
  return weeks;
}

/** The check-in date inside one week for a roadie, or null when none. */
function checkInInWeek(roadie: Roadie, weekStart: Date): Date | null {
  const start = utcDayNumber(weekStart);
  for (const checkIn of roadie.checkIns) {
    const date = excelTimestamp(checkIn.at);
    if (!date) continue;
    const day = utcDayNumber(date);
    if (day >= start && day < start + 7) return date;
  }
  return null;
}

/** Whether a roadie is available for one day + shift. */
function isAvailable(row: ExportRow, day: Weekday, shift: Shift): boolean {
  return row.availabilityByDay.some(
    ([slotDay, shifts]) => slotDay === day && shifts.includes(shift),
  );
}

/** Split a full name into first and last at the last space. */
function splitName(name: string): [string, string] {
  const trimmed = name.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace <= 0) return [trimmed, ""];
  return [trimmed.slice(0, lastSpace), trimmed.slice(lastSpace + 1)];
}

/** The paid date for one paperwork item, or null. */
function paidDate(
  checkoff: OrientationCheckoff | undefined,
  itemId: string,
): Date | null {
  if (!checkoff) return null;
  const entry = checkoff.paidDates.find(([id]) => id === itemId);
  return entry ? excelDate(entry[1] ?? undefined) : null;
}

/** The date one paperwork item was ticked, or null. */
function tickedDate(
  checkoff: OrientationCheckoff | undefined,
  itemId: string,
): Date | null {
  if (!checkoff) return null;
  const entry = checkoff.paperworkDates.find((item) => item.itemId === itemId);
  return entry ? excelDate(entry.date) : null;
}

/** The pay setup choice for a roadie, from the orientation check-off. */
function paySetupOf(checkoff: OrientationCheckoff | undefined): PaySetupEnum {
  return checkoff?.paySetup ?? PaySetupEnum.notSet;
}

/** The block columns for one position, in the store's order. */
function blockHeaders(
  isServer: boolean,
  isAlcohol: boolean,
  weekStarts: Date[],
): string[] {
  const headers: string[] = ["#"];
  if (isServer) headers.push("First Name", "Last Name");
  else headers.push("Name");
  headers.push(
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
  );
  if (isAlcohol)
    headers.push("Alcohol certification complete", "Alcohol cert. time paid");
  headers.push("Food handlers");
  for (const week of weekStarts) {
    headers.push(
      week.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    );
  }
  for (const { day, shift } of AVAILABILITY_COLUMNS) {
    headers.push(`${WEEKDAY_LABELS[day]} ${SHIFT_LABELS[shift]}`);
  }
  if (isServer) headers.push("How many hours or shifts do they want?");
  return headers;
}

/** One roadie's row inside a position block. */
function blockRow(
  row: ExportRow,
  index: number,
  roadie: Roadie | undefined,
  checkoff: OrientationCheckoff | undefined,
  isServer: boolean,
  isAlcohol: boolean,
  weekStarts: Date[],
  paidItemIds: PeopleMatrixExtras["paidItemIds"],
): Array<string | number | Date | null> {
  const cells: Array<string | number | Date | null> = [index + 1];
  if (isServer) {
    const [first, last] = splitName(row.name);
    cells.push(first, last);
  } else {
    cells.push(row.name);
  }
  const paySetup = paySetupOf(checkoff);
  cells.push(
    excelDate(row.dateHired),
    yesMark(row.weekdayLunch ?? false),
    row.shirtSize ?? "",
    row.phone ?? "",
    tickedDate(checkoff, paidItemIds.onboarding),
    paidDate(checkoff, paidItemIds.onboarding),
    yesMark(paySetup === PaySetupEnum.directDeposit),
    yesMark(paySetup === PaySetupEnum.payCard),
    tickedDate(checkoff, paidItemIds.policies),
    paidDate(checkoff, paidItemIds.policies),
  );
  if (isAlcohol) {
    cells.push(
      yesMark(row.alcoholCert),
      paidDate(checkoff, paidItemIds.alcohol),
    );
  }
  // Food handlers stays blank everywhere by store policy.
  cells.push("");
  for (const week of weekStarts) {
    cells.push(roadie ? checkInInWeek(roadie, week) : null);
  }
  for (const { day, shift } of AVAILABILITY_COLUMNS) {
    cells.push(yesMark(isAvailable(row, day, shift)));
  }
  if (isServer) {
    const wanted = roadie?.profile.shiftsWantedPerWeek;
    cells.push(wanted === undefined ? "" : Number(wanted));
  }
  return cells;
}

/** Write one position block: a title row, a header row, then its roadies. */
function addBlock(
  sheet: ExcelJS.Worksheet,
  title: string,
  rows: ExportRow[],
  extras: PeopleMatrixExtras,
  isServer: boolean,
  isAlcohol: boolean,
  weekStarts: Date[],
): void {
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 12 };
  const headerRow = sheet.addRow(blockHeaders(isServer, isAlcohol, weekStarts));
  headerRow.font = { bold: true };
  const roadieByName = roadiesByName(extras.roadies);
  rows.forEach((row, index) => {
    const roadie = roadieByName.get(normalize(row.name));
    const checkoff = roadie
      ? extras.checkoffs.get(roadie.id.toString())
      : undefined;
    sheet.addRow(
      blockRow(
        row,
        index,
        roadie,
        checkoff,
        isServer,
        isAlcohol,
        weekStarts,
        extras.paidItemIds,
      ),
    );
  });
  // A blank spacer row keeps stacked blocks visually separated.
  sheet.addRow([]);
}

/** Build the "Recruiting Locations" sheet: headers only. */
function addRecruitingSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet(RECRUITING_SHEET);
  sheet.addRow(RECRUITING_HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** The overview rows for one named block, matched against the export overview. */
function overviewRows(
  data: ExportData,
  names: string[],
): Array<{
  name: string;
  totalPar: number;
  hired: number;
  weekdayLunch: number;
}> {
  const byName = new Map<string, { totalPar: number; hired: number }>();
  for (const row of data.overview) {
    byName.set(normalize(row.positionName), {
      totalPar: Number(row.totalPar),
      hired: Number(row.hired),
    });
  }
  return names.map((name) => {
    const match = byName.get(normalize(name));
    return {
      name,
      totalPar: match?.totalPar ?? 0,
      hired: match?.hired ?? 0,
      weekdayLunch: 0,
    };
  });
}

/** Build the "Staff Pars and Overview" sheet with FOH, BOH and Total blocks. */
function addOverviewSheet(
  workbook: ExcelJS.Workbook,
  data: ExportData,
  extras: PeopleMatrixExtras,
): void {
  const sheet = workbook.addWorksheet(OVERVIEW_SHEET);
  sheet.addRow(OVERVIEW_HEADERS);
  sheet.getRow(1).font = { bold: true };

  const lunchByPosition = new Map<string, number>();
  for (const position of extras.positions) {
    lunchByPosition.set(
      normalize(position.name),
      Number(position.weekdayLunchPar),
    );
  }
  const lunchHiredByPosition = new Map<string, number>();
  for (const row of data.overview) {
    lunchHiredByPosition.set(normalize(row.positionName), 0);
  }
  for (const [positionName, rows] of data.groups) {
    for (const row of rows) {
      if (!row.weekdayLunch) continue;
      const key = normalize(positionName);
      lunchHiredByPosition.set(key, (lunchHiredByPosition.get(key) ?? 0) + 1);
    }
  }

  const writeBlock = (
    label: string,
    names: string[],
    totalPar: number,
    hired: number,
    weekdayLunch: number,
  ) => {
    const titleRow = sheet.addRow([label]);
    titleRow.font = { bold: true, size: 12 };
    for (const row of overviewRows(data, names)) {
      const wkdyPar = lunchByPosition.get(normalize(row.name)) ?? 0;
      const wkdyLunch = lunchHiredByPosition.get(normalize(row.name)) ?? 0;
      sheet.addRow([
        row.name,
        row.totalPar,
        row.hired,
        wkdyPar,
        wkdyLunch,
        row.hired - row.totalPar,
      ]);
    }
    const totalRow = sheet.addRow([
      `Total ${label}`,
      totalPar,
      hired,
      names.reduce(
        (sum, name) => sum + (lunchByPosition.get(normalize(name)) ?? 0),
        0,
      ),
      weekdayLunch,
      hired - totalPar,
    ]);
    totalRow.font = { bold: true };
    sheet.addRow([]);
  };

  const fohLunch = FOH_OVERVIEW.reduce(
    (sum, name) => sum + (lunchHiredByPosition.get(normalize(name)) ?? 0),
    0,
  );
  const bohLunch = BOH_OVERVIEW.reduce(
    (sum, name) => sum + (lunchHiredByPosition.get(normalize(name)) ?? 0),
    0,
  );
  writeBlock(
    "FOH",
    FOH_OVERVIEW,
    Number(data.fohTotalPar),
    Number(data.fohTotal),
    fohLunch,
  );
  writeBlock(
    "BOH",
    BOH_OVERVIEW,
    Number(data.bohTotalPar),
    Number(data.bohTotal),
    bohLunch,
  );
  const grand = sheet.addRow([
    "Total",
    Number(data.grandTotalPar),
    Number(data.grandTotal),
    FOH_OVERVIEW.concat(BOH_OVERVIEW).reduce(
      (sum, name) => sum + (lunchByPosition.get(normalize(name)) ?? 0),
      0,
    ),
    fohLunch + bohLunch,
    Number(data.grandNeed),
  ]);
  grand.font = { bold: true };

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** Build one position sheet, stacking a block per position in order. */
function addPositionSheet(
  workbook: ExcelJS.Workbook,
  entry: PositionSheet,
  data: ExportData,
  extras: PeopleMatrixExtras,
  weekStarts: Date[],
): void {
  const sheet = workbook.addWorksheet(entry.sheet);
  const isServer = entry.sheet === "Servers";
  const isAlcohol = entry.sheet === "Servers" || entry.sheet === "Bartenders";
  for (const block of entry.blocks) {
    const rows = rowsForGroups(data, block.groups);
    addBlock(sheet, block.title, rows, extras, isServer, isAlcohol, weekStarts);
  }
}

/** Build the final "Shift Coverage" sheet: one block per position. */
function addCoverageSheet(
  workbook: ExcelJS.Workbook,
  coverage: CoverageView | null | undefined,
): void {
  const sheet = workbook.addWorksheet(COVERAGE_SHEET);
  const summary = formatCoverage(coverage);

  const shiftHeaders = AVAILABILITY_COLUMNS.map(
    ({ day, shift }) => `${WEEKDAY_LABELS[day]} ${SHIFT_LABELS[shift]}`,
  );

  for (const row of summary.rows) {
    const titleRow = sheet.addRow([row.positionName]);
    titleRow.font = { bold: true, size: 12 };
    const headerRow = sheet.addRow(["", ...shiftHeaders, "Weekly total"]);
    headerRow.font = { bold: true };

    const needed = row.cells.map((cell) => cell.needed);
    const available = row.cells.map((cell) => cell.available);
    const covered = row.cells.map((cell) => cell.covered);
    const short: number[] = row.cells.map((cell) => (cell.short ? 1 : 0));

    sheet.addRow([
      COVERAGE_ROWS[0],
      ...needed,
      needed.reduce((sum, value) => sum + value, 0),
    ]);
    sheet.addRow([
      COVERAGE_ROWS[1],
      ...available,
      available.reduce((sum, value) => sum + value, 0),
    ]);
    sheet.addRow([
      COVERAGE_ROWS[2],
      ...covered,
      covered.reduce((sum, value) => sum + value, 0),
    ]);
    sheet.addRow([
      COVERAGE_ROWS[3],
      ...short,
      short.reduce((sum, value) => sum + value, 0),
    ]);
    const stillRow = sheet.addRow(["Still to hire", row.stillToHire]);
    stillRow.font = { bold: true };
    sheet.addRow([]);
  }

  sheet.views = [{ state: "frozen", xSplit: 1 }];
}

/**
 * Build the People Matrix workbook from the Full export data plus the coverage
 * result. Sheets appear in the store's fixed order: Recruiting Locations,
 * Staff Pars and Overview, the position sheets, then Shift Coverage.
 */
export function buildPeopleMatrixWorkbook(
  data: ExportData,
  coverage: CoverageView | null | undefined,
  extras: PeopleMatrixExtras,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Roadie";
  workbook.created = new Date();
  const weekStarts = checkInWeekStarts(new Date());
  addRecruitingSheet(workbook);
  addOverviewSheet(workbook, data, extras);
  for (const entry of POSITION_SHEETS) {
    addPositionSheet(workbook, entry, data, extras, weekStarts);
  }
  addCoverageSheet(workbook, coverage);
  return workbook;
}

/** Serialize the People Matrix workbook to an .xlsx Blob. */
export async function peopleMatrixToBlob(
  data: ExportData,
  coverage: CoverageView | null | undefined,
  extras: PeopleMatrixExtras,
): Promise<Blob> {
  const workbook = buildPeopleMatrixWorkbook(data, coverage, extras);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Whether the current device is an iPhone or iPad (incl. iPadOS desktop UA). */
function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

/**
 * Build the People Matrix workbook and trigger a browser download, preferring
 * the Web Share sheet on iPhone and iPad so the user picks where it goes.
 */
export async function downloadPeopleMatrix(
  data: ExportData,
  coverage: CoverageView | null | undefined,
  extras: PeopleMatrixExtras,
  filename: string,
): Promise<void> {
  const blob = await peopleMatrixToBlob(data, coverage, extras);

  if (isIosDevice()) {
    const file = new File([blob], filename, { type: blob.type });
    const canShare =
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });
    if (canShare) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch {
        // The user dismissed the share sheet; fall through to the download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (isIosDevice()) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    URL.revokeObjectURL(url);
  }
}

/**
 * The weekday lunch par and shifts-to-cover grid a position carries, read as
 * plain numbers for the Admin position editor.
 */
export interface PositionCoverageSettings {
  weekdayLunchPar: number;
  shiftsToCover: number[];
}

/** Read a position's coverage settings for the Admin editor. */
export function positionCoverageSettings(
  position: Position,
): PositionCoverageSettings {
  return {
    weekdayLunchPar: Number(position.weekdayLunchPar),
    shiftsToCover: position.shiftsToCover.map((value) => Number(value)),
  };
}
