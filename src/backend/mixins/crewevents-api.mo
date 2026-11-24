import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Common "../types/common";
import Store "../types/store";
import Roadie "../types/roadie";
import Access "../types/access";
import CrewEvents "../types/crewevents";
import CrewEventsLib "../lib/crewevents";

mixin (
  accessGrants : Map.Map<Principal, Access.AccessGrant>,
  demoState : Common.DemoState,
  crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
  eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
  crews : Map.Map<Common.CrewId, Roadie.Crew>,
  roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
  storeInfo : { var value : Store.StoreInfo },
  changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
  counters : CrewEventsLib.Counters,
) {
  /// List every crew event in the active partition, upcoming first then past,
  /// with going / can't go / no answer counts for the viewer's crew.
  public query ({ caller }) func listCrewEvents() : async [CrewEvents.CrewEventSummary] {
    CrewEventsLib.listCrewEvents(accessGrants, demoState, crewEvents, eventInvites, crews, roadies, storeInfo.value, caller);
  };

  /// Read one event's crew list with each roadie's answer, reason, follow-up
  /// note, attendance and Follow up due state.
  public query ({ caller }) func getEventCrew(eventId : Common.CrewEventId, crewId : ?Common.CrewId) : async ?CrewEvents.EventCrewView {
    CrewEventsLib.getEventCrew(accessGrants, demoState, crewEvents, eventInvites, crews, roadies, storeInfo.value, caller, eventId, crewId);
  };

  /// Create a crew event (Managing Partner or Admin).
  public shared ({ caller }) func createCrewEvent(name : Text, start : Common.DateTime, place : Text, note : ?Text) : async Common.CrewEventId {
    CrewEventsLib.createCrewEvent(accessGrants, demoState, crewEvents, changeLog, counters, caller, name, start, place, note);
  };

  /// Edit a crew event, including moving its start date and time (Managing
  /// Partner or Admin). Moving keeps every recorded answer.
  public shared ({ caller }) func updateCrewEvent(eventId : Common.CrewEventId, name : Text, start : Common.DateTime, place : Text, note : ?Text) : async () {
    CrewEventsLib.updateCrewEvent(accessGrants, demoState, crewEvents, changeLog, counters, caller, eventId, name, start, place, note);
  };

  /// Cancel or un-cancel a crew event (Managing Partner or Admin).
  public shared ({ caller }) func setCrewEventCancelled(eventId : Common.CrewEventId, cancelled : Bool) : async () {
    CrewEventsLib.setCrewEventCancelled(accessGrants, demoState, crewEvents, changeLog, counters, caller, eventId, cancelled);
  };

  /// Save one roadie's answer, reason and follow-up note for an event.
  public shared ({ caller }) func saveEventAnswer(eventId : Common.CrewEventId, roadieId : Common.RoadieId, answer : CrewEvents.EventAnswer, reason : ?Text, followUpNote : ?Text) : async () {
    CrewEventsLib.saveEventAnswer(accessGrants, demoState, crewEvents, eventInvites, crews, roadies, changeLog, counters, storeInfo.value, caller, eventId, roadieId, answer, reason, followUpNote);
  };

  /// Mark one roadie's attendance at an event, only once its start has passed.
  public shared ({ caller }) func markEventAttendance(eventId : Common.CrewEventId, roadieId : Common.RoadieId, attendance : CrewEvents.EventAttendance) : async () {
    CrewEventsLib.markEventAttendance(accessGrants, demoState, crewEvents, eventInvites, crews, roadies, changeLog, counters, storeInfo.value, caller, eventId, roadieId, attendance);
  };

  /// List the at-risk roadies (2+ can't-go answers or attended-no marks across
  /// non-cancelled events) for the Dashboard Needs attention row.
  public query ({ caller }) func listAtRiskRoadies() : async [CrewEvents.AtRiskRoadie] {
    CrewEventsLib.listAtRiskRoadies(accessGrants, demoState, crewEvents, eventInvites, roadies, caller);
  };

  /// The next 3 non-cancelled events for the Today "Upcoming events" card, with
  /// the viewer's crew counts.
  public query ({ caller }) func listUpcomingEvents() : async [CrewEvents.UpcomingEventView] {
    CrewEventsLib.listUpcomingEvents(accessGrants, demoState, crewEvents, eventInvites, crews, roadies, storeInfo.value, caller);
  };
};
