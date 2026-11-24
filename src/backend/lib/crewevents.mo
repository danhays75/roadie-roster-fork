import Int "mo:core/Int";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Common "../types/common";
import Store "../types/store";
import Roadie "../types/roadie";
import Access "../types/access";
import CrewEvents "../types/crewevents";
import Auth "auth";
import Clock "clock";
import ChangeLog "changelog";

module {
  /// The counters slice the crew-events domain needs. A full actor counters
  /// record satisfies it by width subtyping.
  public type Counters = {
    var nextCrewEventId : Nat;
    var nextChangeLogId : Nat;
  };

  /// The maximum length of a can't-go reason and of a follow-up note.
  let maxTextLength : Nat = 1000;

  /// The follow-up window: a can't-go answer whose follow-up note is still
  /// empty this long after it was recorded shows "Follow up due".
  let followUpWindowNs : Int = 172_800_000_000_000;

  /// The number of can't-go answers or attended-no marks that flags a roadie
  /// "Orientation no-show risk".
  let atRiskThreshold : Nat = 2;

  /// The key for one event invite: the partition, the event id and the roadie
  /// id, so a demo invite and a real invite never collide.
  func inviteKey(eventId : Common.CrewEventId, roadieId : Common.RoadieId, isDemo : Bool) : Text {
    (if (isDemo) { "demo:" } else { "real:" })
      # eventId.toText()
      # ":"
      # roadieId.toText();
  };

  /// Internal: the display name for a roadie (preferred name when set).
  func displayName(roadie : Roadie.Roadie) : Text {
    switch (roadie.profile.preferredName) {
      case (?p) { if (p.size() > 0) { p } else { roadie.profile.name } };
      case null { roadie.profile.name };
    };
  };

  /// Internal: the stored invite for an event and roadie in the active
  /// partition, or null when none exists yet.
  func visibleInvite(
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    demo : Bool,
    eventId : Common.CrewEventId,
    roadieId : Common.RoadieId,
  ) : ?CrewEvents.EventInvite {
    switch (eventInvites.get(inviteKey(eventId, roadieId, demo))) {
      case (?inv) { if (inv.isDemo == demo) { ?inv } else { null } };
      case null { null };
    };
  };

  /// Internal: the answer for an event and roadie, defaulting to no answer.
  func answerOf(
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    demo : Bool,
    eventId : Common.CrewEventId,
    roadieId : Common.RoadieId,
  ) : CrewEvents.EventAnswer {
    switch (visibleInvite(eventInvites, demo, eventId, roadieId)) {
      case (?inv) { inv.answer };
      case null { #noAnswer };
    };
  };

  /// Internal: the active, non-archived roadies in one crew in the active
  /// partition.
  func crewRoadies(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    crewId : Common.CrewId,
  ) : [Roadie.Roadie] {
    roadies.values()
      .filter(func r = r.isDemo == demo and r.crewId == ?crewId and r.status != #archived)
      .toArray();
  };

  /// Internal: the going / can't go / no answer counts for one event over a set
  /// of roadies.
  func countsFor(
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    demo : Bool,
    eventId : Common.CrewEventId,
    members : [Roadie.Roadie],
  ) : (Nat, Nat, Nat) {
    var going = 0;
    var cantGo = 0;
    var noAnswer = 0;
    for (r in members.values()) {
      switch (answerOf(eventInvites, demo, eventId, r.id)) {
        case (#going) { going += 1 };
        case (#cantGo) { cantGo += 1 };
        case (#noAnswer) { noAnswer += 1 };
      };
    };
    (going, cantGo, noAnswer);
  };

  /// Internal: the crew the caller is viewing for an event. Admin, Managing
  /// Partner and Store Manager may pick any crew; a crew leader sees their own
  /// crew. Returns null when the caller owns no crew and may not pick one.
  func resolveCrew(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    caller : Principal,
    crewId : ?Common.CrewId,
  ) : ?Roadie.Crew {
    let demo = Auth.demoActive(demoState);
    let role = Auth.requireReadable(accessGrants, demoState, caller);
    let mayPick = Auth.roleHasAdminRights(role) or role == #storeManager;
    switch (crewId) {
      case (?cid) {
        if (mayPick) {
          switch (crews.get(cid)) {
            case (?c) { if (c.isDemo == demo) { ?c } else { null } };
            case null { null };
          };
        } else {
          let acting = Auth.actingPrincipal(demoState, caller);
          switch (crews.get(cid)) {
            case (?c) {
              if (c.isDemo == demo and c.leaderPrincipal == ?acting) { ?c } else { null };
            };
            case null { null };
          };
        };
      };
      case null {
        let acting = Auth.actingPrincipal(demoState, caller);
        crews.values().find(func c = c.isDemo == demo and c.leaderPrincipal == ?acting);
      };
    };
  };

  /// Internal: the viewer's own crew (matched by acting principal), or null.
  func viewerCrew(
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    caller : Principal,
  ) : ?Roadie.Crew {
    let demo = Auth.demoActive(demoState);
    let acting = Auth.actingPrincipal(demoState, caller);
    crews.values().find(func c = c.isDemo == demo and c.leaderPrincipal == ?acting);
  };

  /// The number of non-cancelled events at which a roadie's answer is can't go
  /// OR their attendance is no, counted once per event. A roadie is
  /// "Orientation no-show risk" when this is 2 or more. Shared by the
  /// crew-events domain and the My crew row so the two can never disagree.
  public func atRiskEventCount(
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    demo : Bool,
    roadieId : Common.RoadieId,
  ) : Nat {
    var count = 0;
    for (event in crewEvents.values()) {
      if (event.isDemo == demo and not event.cancelled) {
        switch (visibleInvite(eventInvites, demo, event.id, roadieId)) {
          case (?inv) {
            if (inv.answer == #cantGo or inv.attendance == #no) { count += 1 };
          };
          case null {};
        };
      };
    };
    count;
  };

  /// Internal: the active, non-archived roadies in any crew in the active
  /// partition. Used for a viewer who leads no crew, so their event counts
  /// cover every crewed roadie instead of showing zeros.
  func allCrewedRoadies(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
  ) : [Roadie.Roadie] {
    roadies.values()
      .filter(func r = r.isDemo == demo and r.crewId != null and r.status != #archived)
      .toArray();
  };

  /// Internal: the roadies whose answers an event's counts cover for the
  /// viewer: their own crew when they lead one, otherwise every active,
  /// non-archived roadie in any crew in the active partition.
  func countMembers(
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demo : Bool,
    caller : Principal,
  ) : [Roadie.Roadie] {
    switch (viewerCrew(demoState, crews, caller)) {
      case (?c) { crewRoadies(roadies, demo, c.id) };
      case null { allCrewedRoadies(roadies, demo) };
    };
  };

  /// Internal: whether a can't-go answer's follow-up note is still empty 48
  /// hours after it was recorded.
  func followUpDue(inv : ?CrewEvents.EventInvite, now : Common.Timestamp) : Bool {
    switch (inv) {
      case (?i) {
        if (i.answer != #cantGo) { return false };
        let hasNote = switch (i.followUpNote) {
          case (?n) { n.size() > 0 };
          case null { false };
        };
        (not hasNote) and (now >= i.updatedAt + followUpWindowNs);
      };
      case null { false };
    };
  };

  /// Internal: require a caller who may record answers for a roadie: a crew
  /// leader for roadies in their own crew, or Admin, Managing Partner or Store
  /// Manager for any roadie. Traps otherwise.
  func requireAnswerRecorder(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    caller : Principal,
    roadie : Roadie.Roadie,
  ) : () {
    let role = Auth.requireReadable(accessGrants, demoState, caller);
    if (Auth.roleHasAdminRights(role) or role == #storeManager) {
      return;
    };
    let acting = Auth.actingPrincipal(demoState, caller);
    let leads = switch (roadie.crewId) {
      case (?cid) {
        switch (crews.get(cid)) {
          case (?c) { c.leaderPrincipal == ?acting };
          case null { false };
        };
      };
      case null { false };
    };
    if (not leads) {
      Runtime.trap("Access denied: only a crew leader or a manager may record answers");
    };
  };

  /// Internal: require a roadie id to name an existing, active, non-archived
  /// roadie in the active partition.
  func requireActiveRoadie(
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    demoState : Common.DemoState,
    roadieId : Common.RoadieId,
  ) : Roadie.Roadie {
    let roadie = roadies.get(roadieId) ?? Runtime.trap("Roadie not found");
    if (roadie.isDemo != Auth.demoActive(demoState)) {
      Runtime.trap("Roadie not found");
    };
    if (roadie.status == #archived) {
      Runtime.trap("Roadie is archived");
    };
    roadie;
  };

  /// Internal: require an event id to name an existing event in the active
  /// partition.
  func requireEvent(
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    demoState : Common.DemoState,
    eventId : Common.CrewEventId,
  ) : CrewEvents.CrewEvent {
    let event = crewEvents.get(eventId) ?? Runtime.trap("Crew event not found");
    if (event.isDemo != Auth.demoActive(demoState)) {
      Runtime.trap("Crew event not found");
    };
    event;
  };

  /// Internal: require a non-blank event name and place.
  func requireEventFields(name : Text, place : Text) : () {
    if (name.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })).size() == 0) {
      Runtime.trap("An event name is required");
    };
    if (place.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })).size() == 0) {
      Runtime.trap("An event place is required");
    };
  };

  /// Internal: write a change-log entry into the active partition.
  func logWrite(
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    demoState : Common.DemoState,
    by : Principal,
    action : Text,
    subjectRoadieId : ?Common.RoadieId,
    detail : Text,
  ) : () {
    if (Auth.demoActive(demoState)) {
      ignore ChangeLog.recordDemo(changeLog, counters, by, action, subjectRoadieId, false, detail);
    } else {
      ignore ChangeLog.record(changeLog, counters, by, action, subjectRoadieId, false, detail);
    };
  };

  /// List every crew event in the active partition, upcoming first then past,
  /// each with the going / can't go / no answer counts for the viewer's crew.
  /// Readable by every signed-in role that can read the roster (not kiosk or
  /// integration).
  public func listCrewEvents(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    storeInfo : Store.StoreInfo,
    caller : Principal,
  ) : [CrewEvents.CrewEventSummary] {
    ignore Auth.requireReadable(accessGrants, demoState, caller);
    let demo = Auth.demoActive(demoState);
    let now = Clock.effectiveNow(demoState, storeInfo);
    let members = countMembers(demoState, crews, roadies, demo, caller);
    let summaries = crewEvents.values()
      .filter(func e = e.isDemo == demo)
      .map(func(e) {
        let (going, cantGo, noAnswer) = countsFor(eventInvites, demo, e.id, members);
        {
          id = e.id;
          name = e.name;
          start = e.start;
          place = e.place;
          note = e.note;
          cancelled = e.cancelled;
          goingCount = going;
          cantGoCount = cantGo;
          noAnswerCount = noAnswer;
          isDemo = e.isDemo;
        };
      })
      .toArray();
    // Upcoming first (soonest first), then past (most recent first).
    summaries.sort(func(a, b) {
      let aUp = a.start >= now;
      let bUp = b.start >= now;
      if (aUp and bUp) {
        Int.compare(a.start, b.start);
      } else if (aUp) {
        #less;
      } else if (bUp) {
        #greater;
      } else {
        Int.compare(b.start, a.start);
      };
    });
  };

  /// Read one event's crew list: the event header plus one row per active,
  /// non-archived roadie in the selected crew, with each roadie's answer,
  /// reason, follow-up note, attendance and Follow up due state. Admin,
  /// Managing Partner and Store Manager may pick any crew; a crew leader sees
  /// their own crew.
  public func getEventCrew(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    storeInfo : Store.StoreInfo,
    caller : Principal,
    eventId : Common.CrewEventId,
    crewId : ?Common.CrewId,
  ) : ?CrewEvents.EventCrewView {
    ignore Auth.requireReadable(accessGrants, demoState, caller);
    let demo = Auth.demoActive(demoState);
    let event = requireEvent(crewEvents, demoState, eventId);
    let now = Clock.effectiveNow(demoState, storeInfo);
    switch (resolveCrew(accessGrants, demoState, crews, caller, crewId)) {
      case null { null };
      case (?crew) {
        let members = crewRoadies(roadies, demo, crew.id);
        let rows = members.map(func(r) {
          let inv = visibleInvite(eventInvites, demo, eventId, r.id);
          let answer = switch (inv) { case (?i) { i.answer }; case null { #noAnswer } };
          let reason = switch (inv) { case (?i) { i.reason }; case null { null } };
          let followUpNote = switch (inv) { case (?i) { i.followUpNote }; case null { null } };
          let attendance = switch (inv) { case (?i) { i.attendance }; case null { #notMarked } };
          let updatedBy = switch (inv) { case (?i) { ?i.updatedBy }; case null { null } };
          let updatedAt = switch (inv) { case (?i) { ?i.updatedAt }; case null { null } };
          {
            roadieId = r.id;
            name = displayName(r);
            photo = r.photo;
            demoPhotoUrl = r.demoPhotoUrl;
            answer;
            reason;
            followUpNote;
            attendance;
            followUpDue = followUpDue(inv, now);
            updatedBy;
            updatedAt;
          };
        });
        ?{
          eventId;
          name = event.name;
          start = event.start;
          place = event.place;
          note = event.note;
          cancelled = event.cancelled;
          crewId = crew.id;
          crewName = crew.name;
          roadies = rows;
        };
      };
    };
  };

  /// Create a crew event (Managing Partner or Admin). No events are built in.
  public func createCrewEvent(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    caller : Principal,
    name : Text,
    start : Common.DateTime,
    place : Text,
    note : ?Text,
  ) : Common.CrewEventId {
    Auth.requireAdmin(accessGrants, demoState, caller);
    requireEventFields(name, place);
    let id = counters.nextCrewEventId;
    counters.nextCrewEventId := id + 1;
    crewEvents.add(id, {
      id;
      name;
      start;
      place;
      note;
      cancelled = false;
      isDemo = Auth.demoActive(demoState);
    });
    logWrite(changeLog, counters, demoState, caller, "createCrewEvent", null, "Created crew event " # name);
    id;
  };

  /// Edit a crew event, including moving its start date and time (Managing
  /// Partner or Admin). Moving an event keeps every answer, reason, follow-up
  /// and attendance already recorded.
  public func updateCrewEvent(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    caller : Principal,
    eventId : Common.CrewEventId,
    name : Text,
    start : Common.DateTime,
    place : Text,
    note : ?Text,
  ) : () {
    Auth.requireAdmin(accessGrants, demoState, caller);
    requireEventFields(name, place);
    let event = requireEvent(crewEvents, demoState, eventId);
    // Only the event header changes; every invite (answer, reason, follow-up,
    // attendance) is left untouched, so moving the date keeps them all.
    crewEvents.add(eventId, { event with name; start; place; note });
    logWrite(changeLog, counters, demoState, caller, "updateCrewEvent", null, "Edited crew event " # name);
  };

  /// Cancel or un-cancel a crew event (Managing Partner or Admin). A cancelled
  /// event takes no new answers but keeps every recorded answer.
  public func setCrewEventCancelled(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    caller : Principal,
    eventId : Common.CrewEventId,
    cancelled : Bool,
  ) : () {
    Auth.requireAdmin(accessGrants, demoState, caller);
    let event = requireEvent(crewEvents, demoState, eventId);
    crewEvents.add(eventId, { event with cancelled });
    let detail = if (cancelled) { "Cancelled crew event " # event.name } else { "Un-cancelled crew event " # event.name };
    logWrite(changeLog, counters, demoState, caller, "setCrewEventCancelled", null, detail);
  };

  /// Save one roadie's answer, reason and follow-up note for an event. A crew
  /// leader may record for roadies in their own crew; Admin, Managing Partner
  /// and Store Manager for any roadie. Only active, non-archived roadies.
  /// Cancelled events take no new answers. A can't-go answer requires a reason
  /// of at most 1,000 characters; the follow-up note is at most 1,000
  /// characters.
  public func saveEventAnswer(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    storeInfo : Store.StoreInfo,
    caller : Principal,
    eventId : Common.CrewEventId,
    roadieId : Common.RoadieId,
    answer : CrewEvents.EventAnswer,
    reason : ?Text,
    followUpNote : ?Text,
  ) : () {
    let event = requireEvent(crewEvents, demoState, eventId);
    if (event.cancelled) {
      Runtime.trap("This event is cancelled and takes no new answers");
    };
    let roadie = requireActiveRoadie(roadies, demoState, roadieId);
    requireAnswerRecorder(accessGrants, demoState, crews, caller, roadie);
    let trimmedReason = switch (reason) {
      case (?r) { r.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })) };
      case null { "" };
    };
    if (answer == #cantGo and trimmedReason.size() == 0) {
      Runtime.trap("A reason is required when a roadie can't go");
    };
    if (trimmedReason.size() > maxTextLength) {
      Runtime.trap("The reason is too long: the limit is " # maxTextLength.toText() # " characters");
    };
    let noteText = switch (followUpNote) {
      case (?n) { n.trim(#predicate(func(c : Char) : Bool { c.isWhitespace() })) };
      case null { "" };
    };
    if (noteText.size() > maxTextLength) {
      Runtime.trap("The follow-up note is too long: the limit is " # maxTextLength.toText() # " characters");
    };
    let demo = Auth.demoActive(demoState);
    let now = Clock.effectiveNow(demoState, storeInfo);
    let existing = visibleInvite(eventInvites, demo, eventId, roadieId);
    let attendance = switch (existing) {
      case (?i) { i.attendance };
      case null { #notMarked };
    };
    eventInvites.add(inviteKey(eventId, roadieId, demo), {
      eventId;
      roadieId;
      answer;
      reason = if (trimmedReason.size() == 0) { null } else { ?trimmedReason };
      followUpNote = if (noteText.size() == 0) { null } else { ?noteText };
      attendance;
      updatedBy = caller;
      updatedAt = now;
      isDemo = demo;
    });
    logWrite(changeLog, counters, demoState, caller, "saveEventAnswer", ?roadieId, "Saved an event answer for " # event.name);
  };

  /// Mark one roadie's attendance at an event (yes / no / not marked). Allowed
  /// only once the event's start has passed. Same authorization as saving an
  /// answer.
  public func markEventAttendance(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>,
    counters : Counters,
    storeInfo : Store.StoreInfo,
    caller : Principal,
    eventId : Common.CrewEventId,
    roadieId : Common.RoadieId,
    attendance : CrewEvents.EventAttendance,
  ) : () {
    let event = requireEvent(crewEvents, demoState, eventId);
    if (event.cancelled) {
      Runtime.trap("This event is cancelled and takes no new attendance");
    };
    let roadie = requireActiveRoadie(roadies, demoState, roadieId);
    requireAnswerRecorder(accessGrants, demoState, crews, caller, roadie);
    let now = Clock.effectiveNow(demoState, storeInfo);
    if (now < event.start) {
      Runtime.trap("Attendance can be marked only after the event has started");
    };
    let demo = Auth.demoActive(demoState);
    let existing = visibleInvite(eventInvites, demo, eventId, roadieId);
    let base = switch (existing) {
      case (?i) { i };
      case null {
        {
          eventId;
          roadieId;
          answer = #noAnswer;
          reason = null;
          followUpNote = null;
          attendance = #notMarked;
          updatedBy = caller;
          updatedAt = now;
          isDemo = demo;
        };
      };
    };
    eventInvites.add(inviteKey(eventId, roadieId, demo), {
      base with
      attendance;
      updatedBy = caller;
      updatedAt = now;
    });
    logWrite(changeLog, counters, demoState, caller, "markEventAttendance", ?roadieId, "Marked event attendance for " # event.name);
  };

  /// List the at-risk roadies: those with 2 or more non-cancelled events where
  /// their answer is can't go or their attendance is no, flagged "Orientation
  /// no-show risk". Manager query for the Dashboard Needs attention row.
  public func listAtRiskRoadies(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    caller : Principal,
  ) : [CrewEvents.AtRiskRoadie] {
    Auth.requireManager(accessGrants, demoState, caller);
    let demo = Auth.demoActive(demoState);
    roadies.values()
      .filter(func r = r.isDemo == demo and r.status != #archived)
      .filterMap(func(r) {
        let count = atRiskEventCount(crewEvents, eventInvites, demo, r.id);
        if (count < atRiskThreshold) {
          null;
        } else {
          ?{
            roadieId = r.id;
            name = displayName(r);
            photo = r.photo;
            demoPhotoUrl = r.demoPhotoUrl;
            atRiskEvents = count;
          };
        };
      })
      .toArray();
  };

  /// The next 3 non-cancelled events for the Today "Upcoming events" card, with
  /// the going / can't go / no answer counts for the viewer's crew.
  public func listUpcomingEvents(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>,
    eventInvites : Map.Map<Text, CrewEvents.EventInvite>,
    crews : Map.Map<Common.CrewId, Roadie.Crew>,
    roadies : Map.Map<Common.RoadieId, Roadie.Roadie>,
    storeInfo : Store.StoreInfo,
    caller : Principal,
  ) : [CrewEvents.UpcomingEventView] {
    ignore Auth.requireReadable(accessGrants, demoState, caller);
    let demo = Auth.demoActive(demoState);
    let now = Clock.effectiveNow(demoState, storeInfo);
    let members = countMembers(demoState, crews, roadies, demo, caller);
    let upcoming = crewEvents.values()
      .filter(func e = e.isDemo == demo and not e.cancelled and e.start >= now)
      .toArray();
    let sorted = upcoming.sort(func(a, b) = Int.compare(a.start, b.start));
    let limited = if (sorted.size() > 3) { sorted.sliceToArray(0, 3) } else { sorted };
    limited.map(func(e) {
      let (going, cantGo, noAnswer) = countsFor(eventInvites, demo, e.id, members);
      {
        id = e.id;
        name = e.name;
        start = e.start;
        place = e.place;
        goingCount = going;
        cantGoCount = cantGo;
        noAnswerCount = noAnswer;
      };
    });
  };
};
