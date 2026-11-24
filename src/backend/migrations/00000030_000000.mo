import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  // --- Inlined stable types (migrations must be self-contained) ---

  type Timestamp = Int;
  type DateOnly = Int;
  type TimeOfDay = Nat;
  type TimeZone = Text;
  type Phone = Text;
  type Email = Text;
  type PersonName = Text;
  type ShirtSize = Text;
  type HatSize = Text;
  type PhotoRef = Blob;
  type SignatureRef = Blob;

  type Role = {
    #admin;
    #managingPartner;
    #kitchenManager;
    #serviceManager;
    #storeManager;
    #trainingManager;
    #leadership;
    #visitingManager;
    #trainer;
    #kiosk;
    #integration;
  };

  type House = { #foh; #boh };
  type Shift = { #am; #pm };
  type Weekday = { #wed; #thu; #fri; #sat; #sun; #mon; #tue };

  type UniformItemType = { #checkbox; #count };

  type StoreInfo = {
    appName : Text;
    storeNumber : Text;
    locationName : Text;
    address : Text;
    storePhone : Phone;
    openingDate : DateOnly;
    timeZone : TimeZone;
    amShiftStart : TimeOfDay;
    amShiftEnd : TimeOfDay;
    pmShiftStart : TimeOfDay;
    pmShiftEnd : TimeOfDay;
    leaderTalkName : Text;
    trainingGroupSize : Nat;
    leaderTalkSize : Nat;
    logo : ?PhotoRef;
    secondaryLogo : ?PhotoRef;
  };

  type Position = {
    id : Nat;
    name : Text;
    house : House;
    code : Text;
    openingBuildTo : Nat;
    afterOpeningBuildTo : Nat;
    needsAlcoholCert : Bool;
    minimumAge : Nat;
    defaultShirts : Nat;
    defaultHats : Nat;
    shirtType : Text;
    shirtQty : Nat;
    hatType : Text;
    hatQty : Nat;
  };

  type BuildToAdjustment = {
    positionId : Nat;
    openingDelta : Int;
    afterOpeningDelta : Int;
    at : Timestamp;
    by : Principal;
  };

  type EventKind = {
    #deadline;
    #orientation;
    #trainingDay;
    #friendsAndFamily;
    #openingDay;
    #signOff;
    #other;
  };

  type ScheduleEvent = {
    id : Nat;
    kind : EventKind;
    name : Text;
    start : Timestamp;
    end : ?Timestamp;
  };

  type ChecklistItem = {
    id : Nat;
    text : Text;
    requiresAlcoholCert : Bool;
    minorOnly : Bool;
    itemType : UniformItemType;
    enabled : Bool;
    shortLabel : ?Text;
  };

  type Checklists = {
    orientationUniform : [ChecklistItem];
    paperwork : [ChecklistItem];
  };

  type RetentionSettings = {
    archivedContactSetDays : Nat;
    notesDays : Nat;
    archivedPhotoDays : Nat;
    changeLogDays : Nat;
  };

  type StoreTemplate = {
    name : Text;
    schedule : [ScheduleEvent];
    positions : [Position];
    checklists : Checklists;
    leaderTalkName : Text;
  };

  type RoadieStatus = {
    #hired;
    #paperworkDone;
    #oriented;
    #inTraining;
    #certified;
    #needsMoreTime;
    #active;
    #archived;
  };

  type ArchiveReason = {
    #noShow;
    #quitDuringTraining;
    #tookAnotherJob;
    #letGo;
    #ncnsOrientation;
    #paperworkIncomplete;
    #other : Text;
  };

  type RosterState = { #pending; #active };

  type AvailabilitySlot = { day : Weekday; shift : Shift };

  type ContactSet = {
    phone : Phone;
    email : Email;
    emergencyContactName : Text;
    emergencyContactPhone : Phone;
    dateOfBirth : DateOnly;
    availability : [AvailabilitySlot];
    availabilitySignature : ?SignatureRef;
    availabilitySignedAt : ?Timestamp;
    availabilityResignPending : Bool;
    managerSignature : ?SignatureRef;
    managerSignedAt : ?Timestamp;
    managerSignedBy : ?Principal;
  };

  type RoadieProfile = {
    name : PersonName;
    preferredName : ?Text;
    hometown : ?Text;
    hobbies : ?Text;
    favoriteMovie : ?Text;
    favoriteSnack : ?Text;
    favoriteTeam : ?Text;
    favoriteDrink : ?Text;
    favoriteColor : ?Text;
    funFact : ?Text;
    goalHere : ?Text;
    positionAppliedFor : ?Text;
    shirtSize : ?ShirtSize;
    hatSize : ?HatSize;
    shiftsWantedPerWeek : ?Nat;
    weekdayLunch : ?Bool;
  };

  type RoadieStage = {
    #hired;
    #paperworkDone;
    #oriented;
    #inTraining;
    #certified;
  };

  type Roadie = {
    id : Nat;
    profile : RoadieProfile;
    photo : ?PhotoRef;
    demoPhotoUrl : ?Text;
    mainPositionId : Nat;
    secondPositionId : ?Nat;
    crossTrainedPositionId : ?Nat;
    crewId : ?Nat;
    orientationEventId : ?Nat;
    startDate : ?DateOnly;
    status : RoadieStatus;
    corporateEmployeeId : ?Text;
    contactSet : ?ContactSet;
    isMinor : Bool;
    birthdayMonthDay : ?Text;
    archivedReason : ?ArchiveReason;
    archivedAt : ?Timestamp;
    hiredAt : Timestamp;
    hireDate : ?Timestamp;
    signedBy : ?Principal;
    rosterState : RosterState;
    isDemo : Bool;
    stage : ?RoadieStage;
    paperworkStep : ?Text;
  };

  type Crew = { id : Nat; name : Text; leaderPrincipal : ?Principal; isDemo : Bool };

  type ChangeLogEntry = {
    id : Nat;
    at : Timestamp;
    by : Principal;
    action : Text;
    subjectRoadieId : ?Nat;
    touchesContactSet : Bool;
    detail : Text;
    paperworkDetail : ?Text;
    isDemo : Bool;
  };

  type SignupStatus = { #pending; #approved : Nat; #rejected };

  type SignupSubmission = {
    id : Nat;
    submittedAt : Timestamp;
    profile : RoadieProfile;
    photo : ?PhotoRef;
    demoPhotoUrl : ?Text;
    signature : ?SignatureRef;
    contactSet : ContactSet;
    status : SignupStatus;
    isDemo : Bool;
  };

  type StaffProfile = {
    fullName : PersonName;
    requestedRole : Role;
    title : Text;
    homeStoreNumber : Text;
    homeStoreCity : Text;
    preferredName : ?Text;
    workPhone : ?Phone;
    workEmail : ?Email;
    photo : ?PhotoRef;
    demoPhotoUrl : ?Text;
    trainerPositionIds : [Nat];
    arrivalDate : ?DateOnly;
    departureDate : ?DateOnly;
    hometown : ?Text;
    hobbies : ?Text;
    favoriteTeam : ?Text;
    favoriteSnack : ?Text;
    favoriteDrink : ?Text;
    favoriteColor : ?Text;
    funFact : ?Text;
    goalHere : ?Text;
    shirtSize : ?ShirtSize;
    hatSize : ?HatSize;
  };

  type AccessGrant = {
    principal : Principal;
    role : Role;
    approvedAt : Timestamp;
    approvedBy : Principal;
    accessEndsAt : ?Timestamp;
    trainerPositionIds : [Nat];
    linkedRoadieId : ?Nat;
    staffProfile : ?StaffProfile;
  };

  type PendingUser = {
    principal : Principal;
    requestedAt : Timestamp;
    staffProfile : ?StaffProfile;
  };

  type OrientationCheckoff = {
    roadieId : Nat;
    uniformItems : [Text];
    uniformCounts : [(Nat, Nat)];
    paperworkItems : [Text];
    shirtsCount : Nat;
    hatsCount : Nat;
    updatedAt : Timestamp;
    isDemo : Bool;
  };

  type AttendanceState = { #present; #late; #absent };

  type AttendanceRecord = {
    roadieId : Nat;
    eventId : ?Nat;
    shift : ?Shift;
    state : AttendanceState;
    recordedAt : Timestamp;
    recordedBy : Principal;
    isDemo : Bool;
  };

  type ShiftBoardGroup = {
    trainerPrincipal : Principal;
    capacity : Nat;
    roadieIds : [Nat];
  };

  type ShiftBoard = {
    eventId : Nat;
    shift : Shift;
    groups : [ShiftBoardGroup];
    offRoadieIds : [Nat];
    editedAt : Timestamp;
    isDemo : Bool;
  };

  type GroupChangeNotice = {
    id : Nat;
    trainerPrincipal : Principal;
    eventId : Nat;
    shift : Shift;
    shiftLabel : Text;
    addedNames : [Text];
    removedNames : [Text];
    editorName : Text;
    createdAt : Timestamp;
    dismissed : Bool;
    isDemo : Bool;
  };

  type TrainerNote = {
    id : Nat;
    author : Principal;
    roadieId : Nat;
    shift : Shift;
    day : DateOnly;
    didWell : Text;
    workOn : Text;
    createdAt : Timestamp;
    isDemo : Bool;
  };

  type LeaderTalk = {
    id : Nat;
    name : Text;
    day : DateOnly;
    attendees : [Nat];
    isDemo : Bool;
  };

  type SignOffOutcome = { #certified; #needsMoreTime : Text };

  type FinalSignOff = {
    roadieId : Nat;
    outcome : SignOffOutcome;
    futureTrainer : Bool;
    signedBy : Principal;
    signedAt : Timestamp;
    isDemo : Bool;
  };

  type Alert = {
    id : Nat;
    message : Text;
    createdAt : Timestamp;
    acknowledged : Bool;
  };

  type CheckInState = { #present; #late; #absent };

  type CheckInRecord = {
    eventId : Nat;
    shift : Shift;
    roadieId : Nat;
    state : CheckInState;
    lateAt : ?Timestamp;
    excused : ?Text;
    recordedBy : Principal;
    recordedAt : Timestamp;
    isDemo : Bool;
  };

  type AbsentAlertKind = { #absent };

  type AbsentAlert = {
    id : Nat;
    eventId : Nat;
    shift : Shift;
    roadieId : Nat;
    kind : AbsentAlertKind;
    excused : ?Text;
    archived : Bool;
    createdAt : Timestamp;
    isDemo : Bool;
  };

  type Counters = {
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
  };

  type DemoRole = {
    #admin;
    #storeManager;
    #trainingManager;
    #trainer;
    #visitingManager;
    #leadership;
    #kiosk;
  };

  type DemoShift = { #am; #pm };

  type PretendDate = { day : DateOnly; shift : DemoShift };

  type DemoRoleEntry = {
    role : DemoRole;
    stations : [Nat];
  };

  type DemoState = {
    var enabled : Bool;
    var turnedOnAt : ?Timestamp;
    var autoOffAt : ?Timestamp;
    var pretendDate : ?PretendDate;
    var demoRoles : Map.Map<Principal, DemoRoleEntry>;
    var demoTrainerAs : Map.Map<Principal, Principal>;
    var demoManagerAs : Map.Map<Principal, Principal>;
  };

  type SizeCurveEntry = { size : Text; percent : Nat };

  type SizeCurve = {
    shirts : [SizeCurveEntry];
    hats : [SizeCurveEntry];
  };

  type UniformSettings = {
    sizeCurve : SizeCurve;
    bufferPercent : Nat;
  };

  // --- Opening Questions stable types ---

  type QuestionArea = { #kitchen; #service; #both; #dan };
  type SuggestionState = { #open; #accepted; #declined };

  type Approval = { principal : Principal; at : Timestamp };

  type Suggestion = {
    id : Nat;
    author : Principal;
    proposedAnswer : Text;
    note : Text;
    createdAt : Timestamp;
    discussionEndsAt : Timestamp;
    state : SuggestionState;
    decidedBy : ?Principal;
    decidedAt : ?Timestamp;
  };

  type Comment = {
    id : Nat;
    author : Principal;
    text : Text;
    createdAt : Timestamp;
    suggestionId : ?Nat;
  };

  type OpeningQuestion = {
    id : Nat;
    sectionTitle : Text;
    sectionOrder : Nat;
    number : Nat;
    order : Nat;
    question : Text;
    area : QuestionArea;
    answer : Text;
    approvals : [Approval];
    finalizedBy : ?Principal;
    finalizedAt : ?Timestamp;
    suggestions : [Suggestion];
    comments : [Comment];
    updatedAt : Timestamp;
    updatedBy : Principal;
    isDemo : Bool;
  };

  type EmailSettings = { enabled : Bool };

  // --- New per-question history ---

  type QuestionChangeKind = {
    #answerEdited;
    #approved;
    #approvalWithdrawn;
    #markedFinal;
    #reopened;
    #suggestionAccepted;
    #suggestionDeclined;
  };

  type QuestionHistoryEntry = {
    id : Nat;
    questionId : Nat;
    at : Timestamp;
    by : Principal;
    kind : QuestionChangeKind;
    oldAnswer : ?Text;
    newAnswer : ?Text;
  };

  type NewCounters = {
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
  };

  // OldActor is the NewActor of the preceding migration (00000029_000000.mo),
  // which matches the deployed baseline.
  public type OldActor = {
    accessControlState : AccessControl.AccessControlState;
    storeInfo : { var value : StoreInfo };
    positions : Map.Map<Nat, Position>;
    buildToAdjustments : Map.Map<Nat, BuildToAdjustment>;
    schedule : Map.Map<Nat, ScheduleEvent>;
    checklists : { var value : Checklists };
    retention : { var value : RetentionSettings };
    storeTemplates : Map.Map<Text, StoreTemplate>;
    roadies : Map.Map<Nat, Roadie>;
    crews : Map.Map<Nat, Crew>;
    changeLog : Map.Map<Nat, ChangeLogEntry>;
    signups : Map.Map<Nat, SignupSubmission>;
    accessGrants : Map.Map<Principal, AccessGrant>;
    pendingUsers : Map.Map<Principal, PendingUser>;
    orientationCheckoffs : Map.Map<Nat, OrientationCheckoff>;
    attendance : Map.Map<Nat, AttendanceRecord>;
    shiftBoards : Map.Map<Text, ShiftBoard>;
    groupChangeNotices : Map.Map<Nat, GroupChangeNotice>;
    trainerNotes : Map.Map<Nat, TrainerNote>;
    leaderTalks : Map.Map<Nat, LeaderTalk>;
    finalSignOffs : Map.Map<Nat, FinalSignOff>;
    alerts : Map.Map<Nat, Alert>;
    checkIns : Map.Map<Text, CheckInRecord>;
    absentAlerts : Map.Map<Nat, AbsentAlert>;
    counters : Counters;
    kioskPin : { var value : ?Text };
    demoState : DemoState;
    uniformSettings : { var value : UniformSettings };
    openingQuestions : Map.Map<Nat, OpeningQuestion>;
    openingQuestionEmailSettings : { var value : EmailSettings };
  };

  public type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    storeInfo : { var value : StoreInfo };
    positions : Map.Map<Nat, Position>;
    buildToAdjustments : Map.Map<Nat, BuildToAdjustment>;
    schedule : Map.Map<Nat, ScheduleEvent>;
    checklists : { var value : Checklists };
    retention : { var value : RetentionSettings };
    storeTemplates : Map.Map<Text, StoreTemplate>;
    roadies : Map.Map<Nat, Roadie>;
    crews : Map.Map<Nat, Crew>;
    changeLog : Map.Map<Nat, ChangeLogEntry>;
    signups : Map.Map<Nat, SignupSubmission>;
    accessGrants : Map.Map<Principal, AccessGrant>;
    pendingUsers : Map.Map<Principal, PendingUser>;
    orientationCheckoffs : Map.Map<Nat, OrientationCheckoff>;
    attendance : Map.Map<Nat, AttendanceRecord>;
    shiftBoards : Map.Map<Text, ShiftBoard>;
    groupChangeNotices : Map.Map<Nat, GroupChangeNotice>;
    trainerNotes : Map.Map<Nat, TrainerNote>;
    leaderTalks : Map.Map<Nat, LeaderTalk>;
    finalSignOffs : Map.Map<Nat, FinalSignOff>;
    alerts : Map.Map<Nat, Alert>;
    checkIns : Map.Map<Text, CheckInRecord>;
    absentAlerts : Map.Map<Nat, AbsentAlert>;
    counters : NewCounters;
    kioskPin : { var value : ?Text };
    demoState : DemoState;
    uniformSettings : { var value : UniformSettings };
    openingQuestions : Map.Map<Nat, OpeningQuestion>;
    openingQuestionEmailSettings : { var value : EmailSettings };
    openingQuestionHistory : Map.Map<Nat, QuestionHistoryEntry>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = old.accessControlState;
      storeInfo = old.storeInfo;
      positions = old.positions;
      buildToAdjustments = old.buildToAdjustments;
      schedule = old.schedule;
      checklists = old.checklists;
      retention = old.retention;
      storeTemplates = old.storeTemplates;
      roadies = old.roadies;
      crews = old.crews;
      changeLog = old.changeLog;
      signups = old.signups;
      accessGrants = old.accessGrants;
      pendingUsers = old.pendingUsers;
      orientationCheckoffs = old.orientationCheckoffs;
      attendance = old.attendance;
      shiftBoards = old.shiftBoards;
      groupChangeNotices = old.groupChangeNotices;
      trainerNotes = old.trainerNotes;
      leaderTalks = old.leaderTalks;
      finalSignOffs = old.finalSignOffs;
      alerts = old.alerts;
      checkIns = old.checkIns;
      absentAlerts = old.absentAlerts;
      counters = {
        var nextRoadieId = old.counters.nextRoadieId;
        var nextPositionId = old.counters.nextPositionId;
        var nextEventId = old.counters.nextEventId;
        var nextCrewId = old.counters.nextCrewId;
        var nextSignupId = old.counters.nextSignupId;
        var nextChangeLogId = old.counters.nextChangeLogId;
        var nextTrainingGroupId = old.counters.nextTrainingGroupId;
        var nextLeaderTalkId = old.counters.nextLeaderTalkId;
        var nextAlertId = old.counters.nextAlertId;
        var nextAttendanceId = old.counters.nextAttendanceId;
        var nextTrainerNoteId = old.counters.nextTrainerNoteId;
        var nextBuildToAdjustmentId = old.counters.nextBuildToAdjustmentId;
        var nextGroupChangeNoticeId = old.counters.nextGroupChangeNoticeId;
        var nextAbsentAlertId = old.counters.nextAbsentAlertId;
        var nextOpeningQuestionId = old.counters.nextOpeningQuestionId;
        var nextSuggestionId = old.counters.nextSuggestionId;
        var nextCommentId = old.counters.nextCommentId;
        var nextQuestionHistoryId = 0;
      };
      kioskPin = old.kioskPin;
      demoState = old.demoState;
      uniformSettings = old.uniformSettings;
      openingQuestions = old.openingQuestions;
      openingQuestionEmailSettings = old.openingQuestionEmailSettings;
      openingQuestionHistory = Map.empty();
    };
  };
};
