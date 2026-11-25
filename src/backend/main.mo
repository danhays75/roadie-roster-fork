import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import Expose "mo:caffeineai-oql/Expose";
import OQL "mo:caffeineai-oql";
import Entity "mo:caffeineai-oql/Entity";
import MapEntity "mo:caffeineai-oql/MapEntity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import NatValue "mo:caffeineai-oql/NatValue";
import IntValue "mo:caffeineai-oql/IntValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import TextValue "mo:caffeineai-oql/TextValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";

import Common "types/common";
import Store "types/store";
import Roadie "types/roadie";
import Signup "types/signup";
import Access "types/access";
import Phase23 "types/phase23";
import OpeningQuestions "types/openingquestions";
import CrewEvents "types/crewevents";

import StoreApi "mixins/store-api";
import RoadieApi "mixins/roadie-api";
import SignupApi "mixins/signup-api";
import AccessApi "mixins/access-api";
import Phase23Api "mixins/phase23-api";
import ExportApi "mixins/export-api";
import GiftBagsApi "mixins/giftbags-api";
import KioskApi "mixins/kiosk-api";
import SeedApi "mixins/seed-api";
import DemoApi "mixins/demo-api";
import OpeningQuestionsApi "mixins/openingquestions-api";
import CrewEventsApi "mixins/crewevents-api";
import ApiDocMixin "mixins/api-doc";
import OpeningQuestionsLib "lib/openingquestions";
import Clock "lib/clock";
import OqlLib "lib/oql";
import OqlTypes "types/oql";
import Auth "lib/auth";

actor {
  // --- Platform infrastructure state ---
  let accessControlState : AccessControl.AccessControlState;
  include MixinAuthorization(accessControlState, null);
  include MixinObjectStorage();

  // --- Application state ---
  let storeInfo : { var value : Store.StoreInfo };
  let positions : Map.Map<Common.PositionId, Store.Position>;
  let buildToAdjustments : Map.Map<Nat, Store.BuildToAdjustment>;
  let schedule : Map.Map<Common.EventId, Store.ScheduleEvent>;
  let checklists : { var value : Store.Checklists };
  let retention : { var value : Store.RetentionSettings };
  let uniformSettings : { var value : Store.UniformSettings };
  let storeTemplates : Map.Map<Text, Store.StoreTemplate>;

  let roadies : Map.Map<Common.RoadieId, Roadie.Roadie>;
  let crews : Map.Map<Common.CrewId, Roadie.Crew>;
  let changeLog : Map.Map<Common.ChangeLogId, Roadie.ChangeLogEntry>;

  let signups : Map.Map<Common.SignupId, Signup.SignupSubmission>;

  let accessGrants : Map.Map<Principal, Access.AccessGrant>;
  let pendingUsers : Map.Map<Principal, Access.PendingUser>;

  // Admin-set kiosk staff PIN, stored only as a hash.
  let kioskPin : { var value : ?Text };

  // Demo-mode state: off by default, with the auto-off time, the pretend date
  // and the impersonated demo role. Demo records are stored alongside real
  // records and separated by an `isDemo` flag on each record.
  let demoState : Common.DemoState;

  let orientationCheckoffs : Map.Map<Common.RoadieId, Phase23.OrientationCheckoff>;
  let attendance : Map.Map<Nat, Phase23.AttendanceRecord>;
  let shiftBoards : Map.Map<Text, Phase23.ShiftBoard>;
  let groupChangeNotices : Map.Map<Nat, Phase23.GroupChangeNotice>;
  let trainerNotes : Map.Map<Nat, Phase23.TrainerNote>;
  let leaderTalks : Map.Map<Common.LeaderTalkId, Phase23.LeaderTalk>;
  let finalSignOffs : Map.Map<Common.RoadieId, Phase23.FinalSignOff>;
  let alerts : Map.Map<Common.AlertId, Phase23.Alert>;
  let checkIns : Map.Map<Text, Phase23.CheckInRecord>;
  let absentAlerts : Map.Map<Common.AlertId, Phase23.AbsentAlert>;

  // Opening Questions state: the imported questions and the daily-email
  // setting. Questions are real records and never appear in demo data.
  let openingQuestions : Map.Map<OpeningQuestions.QuestionId, OpeningQuestions.OpeningQuestion>;
  let openingQuestionEmailSettings : { var value : OpeningQuestions.EmailSettings };
  let openingQuestionHistory : Map.Map<Nat, OpeningQuestions.QuestionHistoryEntry>;
  let openingQuestionFinishBy : { var value : OpeningQuestions.FinishBySettings };
  let openingQuestionNudges : Map.Map<Principal, OpeningQuestions.Nudge>;
  let openingQuestionDailyEmail : OpeningQuestions.DailyEmailState;

  // Crew events: pre-opening get-togethers for the whole crew, and one invite
  // per event and roadie. No events are built in.
  let crewEvents : Map.Map<Common.CrewEventId, CrewEvents.CrewEvent>;
  let eventInvites : Map.Map<Text, CrewEvents.EventInvite>;

  let counters : {
    var nextRoadieId : Nat;
    var nextPositionId : Nat;
    var nextEventId : Nat;
    var nextCrewId : Nat;
    var nextSignupId : Nat;
    var nextChangeLogId : Nat;
    var nextTrainingGroupId : Nat;
    var nextLeaderTalkId : Nat;
    var nextAlertId : Nat;
    var nextAttendanceId : Nat;
    var nextTrainerNoteId : Nat;
    var nextBuildToAdjustmentId : Nat;
    var nextGroupChangeNoticeId : Nat;
    var nextAbsentAlertId : Nat;
    var nextOpeningQuestionId : Nat;
    var nextSuggestionId : Nat;
    var nextCommentId : Nat;
    var nextQuestionHistoryId : Nat;
    var nextNudgeId : Nat;
    var nextCrewEventId : Nat;
  };

  // --- Domain APIs ---
  include StoreApi(
    accessGrants,
    storeInfo,
    positions,
    buildToAdjustments,
    schedule,
    checklists,
    retention,
    uniformSettings,
    storeTemplates,
    roadies,
    attendance,
    changeLog,
    counters,
    demoState,
  );
  include RoadieApi(accessGrants, roadies, crews, positions, schedule, checklists, orientationCheckoffs, checkIns, changeLog, counters, demoState, shiftBoards, groupChangeNotices, storeInfo, finalSignOffs);
  include SignupApi(accessGrants, signups, roadies, positions, schedule, storeInfo, changeLog, counters, demoState);
  include AccessApi(accessGrants, pendingUsers, accessControlState, demoState, changeLog, counters);
  include Phase23Api(
    accessGrants,
    roadies,
    positions,
    crews,
    schedule,
    checklists,
    orientationCheckoffs,
    attendance,
    shiftBoards,
    groupChangeNotices,
    trainerNotes,
    leaderTalks,
    finalSignOffs,
    alerts,
    checkIns,
    absentAlerts,
    storeInfo,
    changeLog,
    counters,
    demoState,
    openingQuestions,
    openingQuestionEmailSettings,
    openingQuestionNudges,
    crewEvents,
    eventInvites,
  );
  include CrewEventsApi(
    accessGrants,
    demoState,
    crewEvents,
    eventInvites,
    crews,
    roadies,
    storeInfo,
    changeLog,
    counters,
  );
  include ExportApi(accessGrants, roadies, positions, orientationCheckoffs, changeLog, counters, demoState);  include GiftBagsApi(accessGrants, roadies, positions, demoState);
  include KioskApi(accessGrants, kioskPin, demoState);

  // --- Demo mode ---
  include DemoApi(
    accessGrants,
    demoState,
    roadies,
    signups,
    crews,
    attendance,
    trainerNotes,
    orientationCheckoffs,
    checkIns,
    schedule,
    checklists,
    shiftBoards,
    groupChangeNotices,
    leaderTalks,
    finalSignOffs,
    positions,
    storeInfo,
    changeLog,
    counters,
    crewEvents,
    eventInvites,
  );

  // --- Idempotent runtime re-seed ---
  include SeedApi(
    accessGrants,
    demoState,
    storeInfo,
    positions,
    schedule,
    checklists,
    retention,
    uniformSettings,
    counters,
  );

  // --- Opening Questions ---
  include OpeningQuestionsApi(
    accessGrants,
    demoState,
    {
      questions = openingQuestions;
      emailSettings = openingQuestionEmailSettings;
      history = openingQuestionHistory;
      finishBy = openingQuestionFinishBy;
      nudges = openingQuestionNudges;
      dailyEmail = openingQuestionDailyEmail;
    },
    storeInfo,
    changeLog,
    counters,
    counters,
  );

  // --- Behavioral API documentation ---
  include ApiDocMixin();

  // --- Daily Opening Questions email timer ---
  // Re-armed after every run and on every upgrade (the actor body runs on each
  // install and upgrade), so the daily 7:00 AM store-time send keeps firing.
  // The next day's timer is armed BEFORE the send runs, so a send that traps or
  // fails can never stop the daily email. The run itself is idempotent per
  // store-local day, so a late or repeated fire sends nothing more to anyone
  // already emailed that day.
  func armDailyEmailTimer<system>() : () {
    let now = Time.now();
    let delayNs = Clock.nextDailyEmailTime(now, storeInfo.value.timeZone) - now;
    ignore Timer.setTimer<system>(
      #nanoseconds(delayNs.toNat()),
      func() : async () {
        // Arm the next day's timer first, so a trapping send cannot stop it.
        armDailyEmailTimer<system>();
        await OpeningQuestionsLib.runDailyEmail(
          accessGrants,
          demoState,
          {
            questions = openingQuestions;
            emailSettings = openingQuestionEmailSettings;
            history = openingQuestionHistory;
            finishBy = openingQuestionFinishBy;
            nudges = openingQuestionNudges;
            dailyEmail = openingQuestionDailyEmail;
          },
          storeInfo,
          changeLog,
          counters,
          counters,
        );
      },
    );
  };
  armDailyEmailTimer<system>();

  // --- OQL exposure ---
  //
  // The entities below are read-only and scoped to the caller's REAL,
  // non-expired role from the app's access grants (never a demo role). Each is
  // .controllerOrScoped().ownedByWith(...) with a canSee rule that runs against
  // the real query subject. The row builders build every row without a role
  // check; the `owner` column is the row's identity (the roadie id for the
  // roadie entity, the caller for the rest), so a row the rule refuses never
  // reaches the caller. Kiosk, Integration, unregistered, expired and anonymous
  // callers get no rows. Rows are partitioned by the current demo mode exactly
  // like the existing queries.

  /// Render a size-curve entry list as a compact "size percent" text, so the
  /// uniform settings entity can expose the curve as a queryable column.
  func curveText(entries : [Store.SizeCurveEntry]) : Text {
    entries.map(func(e) = e.size # " " # e.percent.toText()).values().join(", ");
  };

  // The OQL query subject: the caller the entity's canSee rule is evaluated
  // against. `Expose` runs each entity's iterator inside the query, so the
  // caller is read here, per query, never a fixed principal.
  func oqlSubject() : Principal {
    Principal.fromText("aaaaa-aa");
  };

  // The roadie id encoded in a roadie row's `owner` column, or null when the
  // column is not a roadie id.
  func roadieIdFromOwner(owner : OQL.Value) : ?Common.RoadieId {
    switch (owner) {
      case (#text(t)) { t.toNat() };
      case (_) { null };
    };
  };

  include Expose({
    entities = [
      // --- Read-only, real-role scoped entities for the AI assistant ---
      // Each row builder builds its rows WITHOUT a role check; the role check
      // runs in `ownedByWith` against the real query subject. Rows are
      // partitioned by the current demo mode exactly like the existing queries.
      Entity.manual<OqlTypes.RoadieRow>(
        "roadie",
        func () = roadies.values().filter(func(r) = r.isDemo == Auth.demoActive(demoState)).map(func(r) = OqlLib.roadieRow(finalSignOffs, r)),
        "RoadieRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          name = "";
          mainPositionId = 0;
          secondPositionId = 0;
          status = "hired";
          crewId = 0;
          orientationEventId = 0;
          paperworkDone = false;
          paperworkStep = "";
          shirtSize = "";
          hatSize = "";
          finalOutcome = "";
          archived = false;
          isDemo = false;
        })
        .payload("id", func r = r.id)
        .payload("owner", func r = r.owner)
        .payload("name", func r = r.name)
        .payload("mainPositionId", func r = r.mainPositionId)
        .payload("secondPositionId", func r = r.secondPositionId)
        .payload("status", func r = r.status)
        .payload("crewId", func r = r.crewId)
        .payload("orientationEventId", func r = r.orientationEventId)
        .payload("paperworkDone", func r = r.paperworkDone)
        .payload("paperworkStep", func r = r.paperworkStep)
        .payload("shirtSize", func r = r.shirtSize)
        .payload("hatSize", func r = r.hatSize)
        .payload("finalOutcome", func r = r.finalOutcome)
        .payload("archived", func r = r.archived)
        .payload("isDemo", func r = r.isDemo)
        .ownedByWith("owner", func (subject, owner) =
          switch (roadieIdFromOwner(owner)) {
            case (?id) {
              switch (roadies.get(id)) {
                case (?r) { OqlLib.canSeeRoadie(accessGrants, demoState, subject, r) };
                case null { false };
              };
            };
            case null { false };
          })
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.PositionRow>(
        "position",
        func () = positions.values().map(func(p) = OqlLib.positionRow(roadies, Auth.demoActive(demoState), p)),
        "PositionRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          name = "";
          openingBuildTo = 0;
          afterOpeningBuildTo = 0;
          onHand = 0;
        })
        .payload("id", func p = p.id)
        .payload("owner", func p = p.owner)
        .payload("name", func p = p.name)
        .payload("openingBuildTo", func p = p.openingBuildTo)
        .payload("afterOpeningBuildTo", func p = p.afterOpeningBuildTo)
        .payload("onHand", func p = p.onHand)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeManager(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.PendingSignupRow>(
        "pendingSignup",
        func () = signups.values().filter(func(s) = s.status == #pending and s.isDemo == Auth.demoActive(demoState)).map(func(s) = OqlLib.pendingSignupRow(s)),
        "PendingSignupRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          name = "";
          positionAppliedFor = "";
          submittedAt = 0;
          isDemo = false;
        })
        .payload("id", func s = s.id)
        .payload("owner", func s = s.owner)
        .payload("name", func s = s.name)
        .payload("positionAppliedFor", func s = s.positionAppliedFor)
        .payload("submittedAt", func s = s.submittedAt)
        .payload("isDemo", func s = s.isDemo)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeSignups(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.OrientationSessionRow>(
        "orientationSession",
        func () = schedule.values().filter(func(e) = e.kind == #orientation).map(func(e) = OqlLib.orientationSessionRow(e)),
        "OrientationSessionRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          name = "";
          start = 0;
        })
        .payload("id", func e = e.id)
        .payload("owner", func e = e.owner)
        .payload("name", func e = e.name)
        .payload("start", func e = e.start)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeOrientation(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.AttendanceRow>(
        "attendance",
        func () = attendance.entries().filter(func((_, a)) = a.isDemo == Auth.demoActive(demoState)).map(func((id, a)) = OqlLib.attendanceRow(id, a)),
        "AttendanceRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          roadieId = 0;
          eventId = 0;
          present = false;
          isDemo = false;
        })
        .payload("id", func a = a.id)
        .payload("owner", func a = a.owner)
        .payload("roadieId", func a = a.roadieId)
        .payload("eventId", func a = a.eventId)
        .payload("present", func a = a.present)
        .payload("isDemo", func a = a.isDemo)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeAttendance(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.OpeningQuestionRow>(
        "openingQuestion",
        func () = openingQuestions.values().map(func(q) = OqlLib.openingQuestionRow(accessGrants, q)),
        "OpeningQuestionRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          sectionTitle = "";
          area = "kitchen";
          question = "";
          answer = "";
          final = false;
          readyForFinal = false;
          approvalCount = 0;
        })
        .payload("id", func q = q.id)
        .payload("owner", func q = q.owner)
        .payload("sectionTitle", func q = q.sectionTitle)
        .payload("area", func q = q.area)
        .payload("question", func q = q.question)
        .payload("answer", func q = q.answer)
        .payload("final", func q = q.final)
        .payload("readyForFinal", func q = q.readyForFinal)
        .payload("approvalCount", func q = q.approvalCount)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeOpeningQuestions(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.CrewEventRow>(
        "crewEvent",
        func () = crewEvents.values().filter(func(e) = e.isDemo == Auth.demoActive(demoState)).map(func(e) = OqlLib.crewEventRow(e)),
        "CrewEventRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          name = "";
          start = 0;
          place = "";
          cancelled = false;
          isDemo = false;
        })
        .payload("id", func e = e.id)
        .payload("owner", func e = e.owner)
        .payload("name", func e = e.name)
        .payload("start", func e = e.start)
        .payload("place", func e = e.place)
        .payload("cancelled", func e = e.cancelled)
        .payload("isDemo", func e = e.isDemo)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeCrewEvent(accessGrants, demoState, crews, roadies, subject))
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.EventAnswerRow>(
        "eventAnswer",
        func () = eventInvites.entries().filter(func((_, inv)) = inv.isDemo == Auth.demoActive(demoState)).filterMap(func((key, inv)) = OqlLib.eventAnswerRow(roadies, key, inv)),
        "EventAnswerRow",
        "key",
      )
        .sample({
          key = "";
          owner = Principal.fromText("aaaaa-aa");
          eventId = 0;
          roadieId = 0;
          answer = "noAnswer";
          attendance = "notMarked";
          isDemo = false;
        })
        .payload("key", func a = a.key)
        .payload("owner", func a = a.owner)
        .payload("eventId", func a = a.eventId)
        .payload("roadieId", func a = a.roadieId)
        .payload("answer", func a = a.answer)
        .payload("attendance", func a = a.attendance)
        .payload("isDemo", func a = a.isDemo)
        .ownedByWith("owner", func (subject, owner) =
          switch (roadieIdFromOwner(owner)) {
            case (?id) {
              switch (roadies.get(id)) {
                case (?r) { OqlLib.canSeeEventAnswer(accessGrants, demoState, crews, subject, r) };
                case null { false };
              };
            };
            case null { false };
          })
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.TrainerNoteRow>(
        "trainerNote",
        func () = trainerNotes.values().filter(func(n) = n.isDemo == Auth.demoActive(demoState)).filterMap(func(n) = OqlLib.trainerNoteRow(accessGrants, roadies, n)),
        "TrainerNoteRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          roadieId = 0;
          authorName = "";
          didWell = "";
          workOn = "";
          createdAt = 0;
          isDemo = false;
        })
        .payload("id", func n = n.id)
        .payload("owner", func n = n.owner)
        .payload("roadieId", func n = n.roadieId)
        .payload("authorName", func n = n.authorName)
        .payload("didWell", func n = n.didWell)
        .payload("workOn", func n = n.workOn)
        .payload("createdAt", func n = n.createdAt)
        .payload("isDemo", func n = n.isDemo)
        .ownedByWith("owner", func (subject, owner) =
          switch (roadieIdFromOwner(owner)) {
            case (?id) {
              switch (roadies.get(id)) {
                case (?r) { OqlLib.canSeeRoadie(accessGrants, demoState, subject, r) };
                case null { false };
              };
            };
            case null { false };
          })
        .controllerOrScoped()
        .build(),
      Entity.manual<OqlTypes.AlertRow>(
        "alert",
        func () = alerts.values().map(func(a) = OqlLib.alertRow(a)),
        "AlertRow",
        "id",
      )
        .sample({
          id = 0;
          owner = Principal.fromText("aaaaa-aa");
          kind = "alert";
          roadieId = 0;
          createdAt = 0;
          acknowledged = false;
        })
        .payload("id", func a = a.id)
        .payload("owner", func a = a.owner)
        .payload("kind", func a = a.kind)
        .payload("roadieId", func a = a.roadieId)
        .payload("createdAt", func a = a.createdAt)
        .payload("acknowledged", func a = a.acknowledged)
        .ownedByWith("owner", func (subject, _) = OqlLib.canSeeAttendance(accessGrants, demoState, subject))
        .controllerOrScoped()
        .build(),
      // The caller's own access row: principal, real role, registered/approved
      // state and access end date. One row per signed-in caller; none for an
      // anonymous caller.
      Entity.manual<OqlTypes.MyAccessRow>(
        "myAccess",
        func () = switch (OqlLib.myAccessRow(accessGrants, oqlSubject())) {
          case (?row) { [row].values() };
          case null { [].values() };
        },
        "MyAccessRow",
        "principal",
      )
        .sample({
          principal = Principal.fromText("aaaaa-aa");
          owner = Principal.fromText("aaaaa-aa");
          role = "admin";
          registered = true;
          approved = true;
          accessEndsAt = ?0;
        })
        .payload("principal", func r = r.principal)
        .payload("owner", func r = r.owner)
        .payload("role", func r = r.role)
        .payload("registered", func r = r.registered)
        .payload("approved", func r = r.approved)
        .payload("accessEndsAt", func r = r.accessEndsAt)
        .ownedByWith("owner", func (subject, owner) = owner == #text(subject.toText()))
        .scopedPerUser()
        .build(),
    ];
  });
};
