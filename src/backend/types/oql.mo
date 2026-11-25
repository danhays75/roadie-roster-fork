import Common "common";

/// Row shapes for the read-only OQL entities the AI assistant queries through
/// the Internet Computer MCP connector. Each type is a flat projection of a
/// stored record: only the columns the assistant may read, never phone, email,
/// address, photos, signatures or birth date. The `owner` column carries the
/// subject principal the entity's `canSee` rule is evaluated against; it is
/// derived from the caller's real role, never stored on the record.
///
/// Columns that may be absent on a stored record are projected to a plain
/// `Text`/`Nat` with an empty default (0 or ""), so the schema reports a real
/// type instead of `Null` and a value can always be shown.
module {
  /// One roadie row: identity, position, status, crew, orientation session,
  /// paperwork flags, uniform sizes, final sign-off outcome and archived state.
  public type RoadieRow = {
    id : Common.RoadieId;
    owner : Principal;
    name : Text;
    mainPositionId : Common.PositionId;
    secondPositionId : Common.PositionId;
    status : Text;
    crewId : Common.CrewId;
    orientationEventId : Common.EventId;
    paperworkDone : Bool;
    paperworkStep : Text;
    shirtSize : Text;
    hatSize : Text;
    finalOutcome : Text;
    archived : Bool;
    isDemo : Bool;
  };

  /// One position row: name, build-to opening, build-to after opening and the
  /// on-hand count.
  public type PositionRow = {
    id : Common.PositionId;
    owner : Principal;
    name : Text;
    openingBuildTo : Nat;
    afterOpeningBuildTo : Nat;
    onHand : Nat;
  };

  /// One pending sign-up row: id, name, position applied for and submitted
  /// time. No contact info or photos.
  public type PendingSignupRow = {
    id : Common.SignupId;
    owner : Principal;
    name : Text;
    positionAppliedFor : Text;
    submittedAt : Common.Timestamp;
    isDemo : Bool;
  };

  /// One orientation session row: the session and its date.
  public type OrientationSessionRow = {
    id : Common.EventId;
    owner : Principal;
    name : Text;
    start : Common.DateTime;
  };

  /// One attendance row: roadie, session and present or not.
  public type AttendanceRow = {
    id : Nat;
    owner : Principal;
    roadieId : Common.RoadieId;
    eventId : Common.EventId;
    present : Bool;
    isDemo : Bool;
  };

  /// One opening question row: id, section, area, question, answer, Final,
  /// ready for final and approvals.
  public type OpeningQuestionRow = {
    id : Nat;
    owner : Principal;
    sectionTitle : Text;
    area : Text;
    question : Text;
    answer : Text;
    final : Bool;
    readyForFinal : Bool;
    approvalCount : Nat;
  };

  /// One crew event row: event, start, place and cancelled.
  public type CrewEventRow = {
    id : Common.CrewEventId;
    owner : Principal;
    name : Text;
    start : Common.DateTime;
    place : Text;
    cancelled : Bool;
    isDemo : Bool;
  };

  /// One event answer row: roadie, answer and attendance.
  public type EventAnswerRow = {
    key : Text;
    owner : Principal;
    eventId : Common.CrewEventId;
    roadieId : Common.RoadieId;
    answer : Text;
    attendance : Text;
    isDemo : Bool;
  };

  /// One trainer note row: roadie, author name, did well, work on and created
  /// time.
  public type TrainerNoteRow = {
    id : Nat;
    owner : Principal;
    roadieId : Common.RoadieId;
    authorName : Text;
    didWell : Text;
    workOn : Text;
    createdAt : Common.Timestamp;
    isDemo : Bool;
  };

  /// One alert row: type, roadie, created time and acknowledged.
  public type AlertRow = {
    id : Common.AlertId;
    owner : Principal;
    kind : Text;
    roadieId : Common.RoadieId;
    createdAt : Common.Timestamp;
    acknowledged : Bool;
  };

  /// The caller's own access row: their principal, real role, whether they are
  /// registered and approved, and when their access ends. One row per caller.
  public type MyAccessRow = {
    principal : Principal;
    owner : Principal;
    role : Text;
    registered : Bool;
    approved : Bool;
    accessEndsAt : ?Common.Timestamp;
  };
};
