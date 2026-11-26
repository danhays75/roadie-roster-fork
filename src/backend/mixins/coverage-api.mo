import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Store "../types/store";
import Roadie "../types/roadie";
import Access "../types/access";
import Coverage "../types/coverage";
import CoverageLib "../lib/coverage";

mixin (
  accessGrants : Map.Map<Principal, Access.AccessGrant>,
  demoState : Common.DemoState,
  roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
  positions : Map.Map<Common.PositionId, Store.Position>,
) {
  /// Read the read-only shift coverage view: per position, the 14 shifts in
  /// Wed AM … Tue PM order with Needed, Available and Covered counts, plus the
  /// weekly totals, short shifts, still-to-hire and named short shifts, and the
  /// FOH and BOH totals. Manager roles only (Admin, Managing Partner, Store
  /// Manager, Training Manager, Kitchen Manager, Service Manager).
  public query ({ caller }) func getCoverage() : async Coverage.CoverageView {
    CoverageLib.getCoverage(accessGrants, demoState, roadies, positions, caller);
  };
};
