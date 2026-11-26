import type {
  CoverageCell,
  CoverageTotals,
  CoverageView,
  House,
  PositionCoverage,
  Shift,
  ShortShift,
  Weekday,
} from "@/backend";
import {
  House as HouseEnum,
  Shift as ShiftEnum,
  Weekday as WeekdayEnum,
} from "@/backend";

/**
 * The 14 shifts in the order the backend returns them: Wed AM through Tue PM.
 * Every per-position grid is rendered in this order so the Coverage tab and the
 * Dashboard card line up column for column.
 */
export const COVERAGE_SHIFTS: Array<{ day: Weekday; shift: Shift }> = [
  { day: WeekdayEnum.wed, shift: ShiftEnum.am },
  { day: WeekdayEnum.wed, shift: ShiftEnum.pm },
  { day: WeekdayEnum.thu, shift: ShiftEnum.am },
  { day: WeekdayEnum.thu, shift: ShiftEnum.pm },
  { day: WeekdayEnum.fri, shift: ShiftEnum.am },
  { day: WeekdayEnum.fri, shift: ShiftEnum.pm },
  { day: WeekdayEnum.sat, shift: ShiftEnum.am },
  { day: WeekdayEnum.sat, shift: ShiftEnum.pm },
  { day: WeekdayEnum.sun, shift: ShiftEnum.am },
  { day: WeekdayEnum.sun, shift: ShiftEnum.pm },
  { day: WeekdayEnum.mon, shift: ShiftEnum.am },
  { day: WeekdayEnum.mon, shift: ShiftEnum.pm },
  { day: WeekdayEnum.tue, shift: ShiftEnum.am },
  { day: WeekdayEnum.tue, shift: ShiftEnum.pm },
];

/** Short day labels, Wed–Tue order. */
export const COVERAGE_DAY_LABELS: Record<Weekday, string> = {
  [WeekdayEnum.wed]: "Wed",
  [WeekdayEnum.thu]: "Thu",
  [WeekdayEnum.fri]: "Fri",
  [WeekdayEnum.sat]: "Sat",
  [WeekdayEnum.sun]: "Sun",
  [WeekdayEnum.mon]: "Mon",
  [WeekdayEnum.tue]: "Tue",
};

/** Short shift labels. */
export const COVERAGE_SHIFT_LABELS: Record<Shift, string> = {
  [ShiftEnum.am]: "AM",
  [ShiftEnum.pm]: "PM",
};

/** A stable key for one day + shift cell, e.g. `"wed-am"`. */
export function coverageCellKey(day: Weekday, shift: Shift): string {
  return `${day}-${shift}`;
}

/** One rendered grid cell: the backend counts plus its column position. */
export interface CoverageGridCell {
  key: string;
  day: Weekday;
  shift: Shift;
  dayLabel: string;
  shiftLabel: string;
  needed: number;
  available: number;
  covered: number;
  short: boolean;
}

/** One rendered grid row: a position with its 14 cells in Wed–Tue order. */
export interface CoverageGridRow {
  positionId: string;
  positionName: string;
  house: House;
  hasGrid: boolean;
  cells: CoverageGridCell[];
  shiftsNeeded: number;
  shortShifts: number;
  shiftCapacity: number;
  stillToHire: number;
}

/** The formatted totals for one house (FOH or BOH). */
export interface CoverageTotalsView {
  shiftsNeeded: number;
  shortShifts: number;
  shiftCapacity: number;
  stillToHire: number;
}

/** One named short shift, formatted for display. */
export interface CoverageShortShiftView {
  key: string;
  day: Weekday;
  shift: Shift;
  dayLabel: string;
  shiftLabel: string;
  label: string;
  count: number;
}

/** The whole coverage view, formatted for the Coverage tab and Dashboard card. */
export interface CoverageSummary {
  rows: CoverageGridRow[];
  foh: CoverageTotalsView;
  boh: CoverageTotalsView;
  /** Every named short shift across all positions, Wed–Tue then AM/PM order. */
  shortShifts: CoverageShortShiftView[];
  /** The still-to-hire number across both houses. */
  stillToHire: number;
  /** Whether any position has a saved grid yet. */
  hasAnyGrid: boolean;
}

function toNumber(value: bigint | undefined): number {
  return value === undefined ? 0 : Number(value);
}

function formatTotals(totals: CoverageTotals | undefined): CoverageTotalsView {
  return {
    shiftsNeeded: toNumber(totals?.shiftsNeeded),
    shortShifts: toNumber(totals?.shortShifts),
    shiftCapacity: toNumber(totals?.shiftCapacity),
    stillToHire: toNumber(totals?.stillToHire),
  };
}

/** Index the backend cells by day + shift so a missing cell renders as zero. */
function cellIndex(cells: CoverageCell[]): Map<string, CoverageCell> {
  const map = new Map<string, CoverageCell>();
  for (const cell of cells) {
    map.set(coverageCellKey(cell.day, cell.shift), cell);
  }
  return map;
}

function formatRow(position: PositionCoverage): CoverageGridRow {
  const index = cellIndex(position.cells);
  const cells = COVERAGE_SHIFTS.map(({ day, shift }) => {
    const cell = index.get(coverageCellKey(day, shift));
    return {
      key: coverageCellKey(day, shift),
      day,
      shift,
      dayLabel: COVERAGE_DAY_LABELS[day],
      shiftLabel: COVERAGE_SHIFT_LABELS[shift],
      needed: toNumber(cell?.needed),
      available: toNumber(cell?.available),
      covered: toNumber(cell?.covered),
      short: cell?.short ?? false,
    };
  });
  return {
    positionId: position.positionId.toString(),
    positionName: position.positionName,
    house: position.house,
    hasGrid: position.hasGrid,
    cells,
    shiftsNeeded: toNumber(position.shiftsNeeded),
    shortShifts: toNumber(position.shortShifts),
    shiftCapacity: toNumber(position.shiftCapacity),
    stillToHire: toNumber(position.stillToHire),
  };
}

/** The sort order for a day + shift pair, so short shifts read Wed–Tue. */
function shiftOrder(day: Weekday, shift: Shift): number {
  const dayIndex = COVERAGE_SHIFTS.findIndex((entry) => entry.day === day);
  const shiftIndex = shift === ShiftEnum.am ? 0 : 1;
  return (dayIndex < 0 ? 99 : dayIndex) * 2 + shiftIndex;
}

function formatShortShift(short: ShortShift): CoverageShortShiftView {
  const dayLabel = COVERAGE_DAY_LABELS[short.day] ?? short.day;
  const shiftLabel = COVERAGE_SHIFT_LABELS[short.shift] ?? short.shift;
  return {
    key: coverageCellKey(short.day, short.shift),
    day: short.day,
    shift: short.shift,
    dayLabel,
    shiftLabel,
    label: `${dayLabel} ${shiftLabel}`,
    count: toNumber(short.count),
  };
}

/**
 * Format the backend coverage view into the shape the Coverage tab and the
 * Dashboard card render: per-position grids in Wed–Tue order, the FOH and BOH
 * totals, the named short-shift list and the still-to-hire number.
 */
export function formatCoverage(
  view: CoverageView | null | undefined,
): CoverageSummary {
  if (!view) {
    return {
      rows: [],
      foh: formatTotals(undefined),
      boh: formatTotals(undefined),
      shortShifts: [],
      stillToHire: 0,
      hasAnyGrid: false,
    };
  }

  const rows = view.positions.map(formatRow);
  const shortShifts = view.positions
    .flatMap((position) => position.shortShiftList.map(formatShortShift))
    .sort((a, b) => shiftOrder(a.day, a.shift) - shiftOrder(b.day, b.shift));
  const foh = formatTotals(view.foh);
  const boh = formatTotals(view.boh);

  return {
    rows,
    foh,
    boh,
    shortShifts,
    stillToHire: foh.stillToHire + boh.stillToHire,
    hasAnyGrid: rows.some((row) => row.hasGrid),
  };
}

/** The rows for one house, in backend order. */
export function coverageRowsForHouse(
  summary: CoverageSummary,
  house: House,
): CoverageGridRow[] {
  return summary.rows.filter((row) => row.house === house);
}

/** The totals for one house. */
export function coverageTotalsForHouse(
  summary: CoverageSummary,
  house: House,
): CoverageTotalsView {
  return house === HouseEnum.foh ? summary.foh : summary.boh;
}
