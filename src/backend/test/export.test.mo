import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Access "../types/access";
import Roadie "../types/roadie";
import Store "../types/store";
import Phase23 "../types/phase23";
import Export "../types/export";
import ExportLib "../lib/export";
import Fixtures "fixtures";

/// Tests for the four corrected Full export columns in `lib/export.mo`:
/// onboardingComplete (every enabled, applicable item ticked), policiesComplete
/// (that roadie's Policies & Procedures item), alcoholCert (that roadie's
/// Alcohol Certificate item) and foodHandlers (always blank). The Shareable
/// export is exercised too, to prove it still builds and never leaks the
/// contact set.
module {
  func admin() : Principal = Principal.fromText("aaaaa-aa");
  func storeManager() : Principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");

  func accessGrants() : Map.Map<Principal, Access.AccessGrant> = Fixtures.grants([
    Fixtures.grant(admin(), #admin),
    Fixtures.grant(storeManager(), #storeManager),
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

  func counters() : ExportLib.Counters = { var nextChangeLogId = 0 };

  func changeLog() : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry> = Map.empty();

  // The seeded paperwork order: Digital Paperwork, I-9 / W-4, Alcohol
  // Certificate, Policies & Procedures.
  func item(id : Nat, text : Text, requiresAlcoholCert : Bool) : Store.ChecklistItem = {
    id;
    text;
    requiresAlcoholCert;
    minorOnly = false;
    itemType = #checkbox;
    enabled = true;
    shortLabel = null;
  };

  func checklists() : Store.Checklists = {
    orientationUniform = [];
    paperwork = [
      item(1, "Digital Paperwork", false),
      item(2, "I-9 / W-4", false),
      item(3, "Alcohol Certificate", true),
      item(4, "Policies & Procedures", false),
    ];
  };

  // A position that needs an alcohol certificate.
  func alcoholPosition() : Store.Position {
    let p = Fixtures.position(1, "Bartender");
    { p with needsAlcoholCert = true };
  };

  // A position that does not need an alcohol certificate.
  func plainPosition() : Store.Position {
    Fixtures.position(2, "Server")
  };

  func positions(p : Store.Position) : Map.Map<Common.PositionId, Store.Position> {
    let m = Map.empty<Common.PositionId, Store.Position>();
    m.add(p.id, p);
    m;
  }

  func checkoff(roadieId : Common.RoadieId, checked : [Text]) : Phase23.OrientationCheckoff = {
    roadieId;
    uniformItems = [];
    uniformCounts = [];
    paperworkItems = checked;
    paperworkDates = [];
    paidDates = [];
    paySetup = #notSet;
    shirtsCount = 0;
    hatsCount = 0;
    updatedAt = 0;
    isDemo = false;
  };

  func checkoffs(entries : [Phase23.OrientationCheckoff]) : Map.Map<Common.RoadieId, Phase23.OrientationCheckoff> {
    let m = Map.empty<Common.RoadieId, Phase23.OrientationCheckoff>();
    for (c in entries.values()) {
      m.add(c.roadieId, c);
    };
    m;
  };

  // The single row of the single group in a Full export.
  func onlyRow(data : Export.ExportData) : Export.ExportRow {
    let (_, rows) = data.groups[0];
    rows[0];
  };

  func fullExport(
    roadie : Roadie.Roadie,
    position : Store.Position,
    checkoffOpt : ?Phase23.OrientationCheckoff,
  ) : Export.ExportData {
    ExportLib.buildFullExport(
      accessGrants(),
      demoOff(),
      Fixtures.roadies([roadie]),
      positions(position),
      checklists(),
      checkoffs(switch (checkoffOpt) { case (?c) { [c] }; case null { [] } }),
      changeLog(),
      counters(),
      admin(),
    );
  };

  // --- onboardingComplete: every enabled, applicable item ticked ---

  public func onboardingCompleteOnlyWhenAllTicked() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    // Only one of the four applicable items ticked: not complete.
    let partial = fullExport(r, plainPosition(), ?checkoff(1, ["1"]));
    // Every applicable item ticked: complete.
    let all = fullExport(r, plainPosition(), ?checkoff(1, ["1", "2", "4"]));
    not onlyRow(partial).onboardingComplete and onlyRow(all).onboardingComplete;
  };

  public func onboardingCompleteFalseWithNoCheckoff() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    let data = fullExport(r, plainPosition(), null);
    not onlyRow(data).onboardingComplete;
  };

  // --- policiesComplete: that roadie's Policies & Procedures item ---

  public func policiesCompleteFollowsOwnItem() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    // Policies ticked but onboarding not complete: policies true, onboarding false.
    let policiesOnly = fullExport(r, plainPosition(), ?checkoff(1, ["1", "2", "4"]));
    // Everything except policies ticked: policies false.
    let noPolicies = fullExport(r, plainPosition(), ?checkoff(1, ["1", "2"]));
    onlyRow(policiesOnly).policiesComplete
      and not onlyRow(noPolicies).policiesComplete
      and not onlyRow(noPolicies).onboardingComplete;
  };

  // --- alcoholCert: that roadie's Alcohol Certificate item, not the position ---

  public func alcoholCertFollowsOwnItemNotPosition() : Bool {
    let r = Fixtures.roadie(1, 1, #active, false);
    // Position needs alcohol cert, but the roadie's item is not ticked.
    let notTicked = fullExport(r, alcoholPosition(), ?checkoff(1, ["1", "2"]));
    // Roadie's alcohol item ticked.
    let ticked = fullExport(r, alcoholPosition(), ?checkoff(1, ["1", "2", "3"]));
    not onlyRow(notTicked).alcoholCert and onlyRow(ticked).alcoholCert;
  };

  public func alcoholCertFalseWhenPositionDoesNotNeedIt() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    // Plain position, alcohol item not applicable, never ticked.
    let data = fullExport(r, plainPosition(), ?checkoff(1, ["1", "2", "4"]));
    not onlyRow(data).alcoholCert;
  };

  // --- foodHandlers: always blank ---

  public func foodHandlersAlwaysBlank() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    let data = fullExport(r, plainPosition(), ?checkoff(1, ["1", "2", "4"]));
    not onlyRow(data).foodHandlers;
  };

  // --- Shareable export still builds and never leaks the contact set ---

  public func shareableExportStillBuilds() : Bool {
    let r = Fixtures.roadie(1, 2, #active, false);
    let data = ExportLib.buildShareableExport(
      accessGrants(),
      demoOff(),
      Fixtures.roadies([r]),
      positions(plainPosition()),
      checklists(),
      checkoffs([checkoff(1, ["1", "2", "4"])]),
      admin(),
    );
    let row = onlyRow(data);
    row.phone == null and row.email == null and row.availability.size() == 0;  };
};
