import Common "common";

module {
  /// A crew event: a pre-opening get-together for the whole crew (for example a
  /// barbecue). `start` is the event's date and time as a UTC nanosecond
  /// timestamp. `note` is an optional free-text note. `cancelled` marks a
  /// cancelled event; a cancelled event takes no new answers but keeps every
  /// answer, reason, follow-up and attendance already recorded. `isDemo` marks a
  /// demo event. No events are built in and none are seeded.
  public type CrewEvent = {
    id : Common.CrewEventId;
    name : Text;
    start : Common.DateTime;
    place : Text;
    note : ?Text;
    cancelled : Bool;
    isDemo : Bool;
  };

  /// A roadie's answer to a crew event.
  public type EventAnswer = {
    #going;
    #cantGo;
    #noAnswer;
  };

  /// A roadie's attendance at a crew event, marked only once the event's start
  /// has passed.
  public type EventAttendance = {
    #yes;
    #no;
    #notMarked;
  };

  /// One invite per event and roadie: the roadie's answer (default no answer),
  /// the reason (required when the answer is can't go, at most 1,000
  /// characters), the follow-up note (at most 1,000 characters), the attendance
  /// mark, who last updated it and when, and the demo partition flag.
  public type EventInvite = {
    eventId : Common.CrewEventId;
    roadieId : Common.RoadieId;
    answer : EventAnswer;
    reason : ?Text;
    followUpNote : ?Text;
    attendance : EventAttendance;
    updatedBy : Principal;
    updatedAt : Common.Timestamp;
    isDemo : Bool;
  };

  /// One event in the events list, with the going / can't go / no answer counts
  /// for the viewer's crew (or for every roadie when no crew is selected).
  public type CrewEventSummary = {
    id : Common.CrewEventId;
    name : Text;
    start : Common.DateTime;
    place : Text;
    note : ?Text;
    cancelled : Bool;
    goingCount : Nat;
    cantGoCount : Nat;
    noAnswerCount : Nat;
    isDemo : Bool;
  };

  /// One roadie row on an event's crew list: name, photo, the roadie's answer,
  /// reason, follow-up note, attendance and whether the follow-up is due (a
  /// can't-go answer whose follow-up note is still empty 48 hours after it was
  /// recorded).
  public type EventCrewRow = {
    roadieId : Common.RoadieId;
    name : Text;
    photo : ?Common.PhotoRef;
    demoPhotoUrl : ?Text;
    answer : EventAnswer;
    reason : ?Text;
    followUpNote : ?Text;
    attendance : EventAttendance;
    followUpDue : Bool;
    updatedBy : ?Principal;
    updatedAt : ?Common.Timestamp;
  };

  /// The event's crew list for one crew: the event header plus one row per
  /// active, non-archived roadie in the crew.
  public type EventCrewView = {
    eventId : Common.CrewEventId;
    name : Text;
    start : Common.DateTime;
    place : Text;
    note : ?Text;
    cancelled : Bool;
    crewId : Common.CrewId;
    crewName : Text;
    roadies : [EventCrewRow];
  };

  /// One at-risk roadie: a roadie with 2 or more can't-go answers or attended-no
  /// marks across non-cancelled events, flagged "Orientation no-show risk".
  public type AtRiskRoadie = {
    roadieId : Common.RoadieId;
    name : Text;
    photo : ?Common.PhotoRef;
    demoPhotoUrl : ?Text;
    atRiskEvents : Nat;
  };

  /// The next upcoming non-cancelled event for the Today card, with the going /
  /// can't go / no answer counts for the viewer's crew.
  public type UpcomingEventView = {
    id : Common.CrewEventId;
    name : Text;
    start : Common.DateTime;
    place : Text;
    goingCount : Nat;
    cantGoCount : Nat;
    noAnswerCount : Nat;
  };
};
