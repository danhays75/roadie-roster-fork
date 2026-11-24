import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
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

  // Old role variant (as deployed): eight roles, no Managing Partner / Kitchen
  // Manager / Service Manager.
  type Role = {
    #admin;
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

  // Old AccessGrant (as deployed) — carries `managerArea`.
  type OldAccessGrant = {
    principal : Principal;
    role : Role;
    approvedAt : Timestamp;
    approvedBy : Principal;
    accessEndsAt : ?Timestamp;
    trainerPositionIds : [Nat];
    linkedRoadieId : ?Nat;
    staffProfile : ?StaffProfile;
    managerArea : ManagerArea;
  };

  // The Manager area on a leader's access grant (removed by this migration).
  type ManagerArea = { #none; #kitchen; #service };

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

  // Old counters (as deployed) — includes the Opening Questions counters.
  type OldCounters = {
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

  // --- Opening Questions stable types (new in this migration) ---

  type QuestionArea = { #kitchen; #service; #both; #dan };
  type QuestionStatus = { #needsDecision; #checkOnSite; #answered };
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
    who : Text;
    answer : Text;
    status : QuestionStatus;
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

  // --- Transformations ---

  /// Internal: the new role variant, which adds Managing Partner, Kitchen
  /// Manager and Service Manager to the eight existing roles.
  type NewRole = {
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

  /// Internal: the new staff profile, whose requested role uses the new role
  /// variant.
  type NewStaffProfile = {
    fullName : PersonName;
    requestedRole : NewRole;
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

  /// Internal: the new pending user, whose staff profile uses the new role
  /// variant.
  type NewPendingUser = {
    principal : Principal;
    requestedAt : Timestamp;
    staffProfile : ?NewStaffProfile;
  };

  /// Internal: the new access grant — the Manager area field is removed.
  type NewAccessGrant = {
    principal : Principal;
    role : NewRole;
    approvedAt : Timestamp;
    approvedBy : Principal;
    accessEndsAt : ?Timestamp;
    trainerPositionIds : [Nat];
    linkedRoadieId : ?Nat;
    staffProfile : ?NewStaffProfile;
  };

  /// Internal: the new Opening Question — unchanged shape, but the record is
  /// rebuilt so the new role-based ownership rules apply to it.
  type NewOpeningQuestion = {
    id : Nat;
    sectionTitle : Text;
    sectionOrder : Nat;
    number : Nat;
    order : Nat;
    question : Text;
    area : QuestionArea;
    who : Text;
    answer : Text;
    status : QuestionStatus;
    approvals : [Approval];
    finalizedBy : ?Principal;
    finalizedAt : ?Timestamp;
    suggestions : [Suggestion];
    comments : [Comment];
    updatedAt : Timestamp;
    updatedBy : Principal;
    isDemo : Bool;
  };

  /// Internal: migrate one staff profile to the new role variant.
  func migrateProfile(p : StaffProfile) : NewStaffProfile {
    let requestedRole : NewRole = switch (p.requestedRole) {
      case (#admin) { #managingPartner };
      case (#storeManager) { #storeManager };
      case (#trainingManager) { #trainingManager };
      case (#leadership) { #leadership };
      case (#visitingManager) { #visitingManager };
      case (#trainer) { #trainer };
      case (#kiosk) { #kiosk };
      case (#integration) { #integration };
    };
    {
      fullName = p.fullName;
      requestedRole;
      title = p.title;
      homeStoreNumber = p.homeStoreNumber;
      homeStoreCity = p.homeStoreCity;
      preferredName = p.preferredName;
      workPhone = p.workPhone;
      workEmail = p.workEmail;
      photo = p.photo;
      demoPhotoUrl = p.demoPhotoUrl;
      trainerPositionIds = p.trainerPositionIds;
      arrivalDate = p.arrivalDate;
      departureDate = p.departureDate;
      hometown = p.hometown;
      hobbies = p.hobbies;
      favoriteTeam = p.favoriteTeam;
      favoriteSnack = p.favoriteSnack;
      favoriteDrink = p.favoriteDrink;
      favoriteColor = p.favoriteColor;
      funFact = p.funFact;
      goalHere = p.goalHere;
      shirtSize = p.shirtSize;
      hatSize = p.hatSize;
    };
  };

  /// Internal: migrate one access grant. A leader whose Manager area was
  /// Kitchen Manager becomes a Kitchen Manager, Service Manager becomes a
  /// Service Manager, and a leader with no area keeps their existing role. The
  /// store owner (the current Admin) becomes the Managing Partner.
  func migrateGrant(g : OldAccessGrant) : NewAccessGrant {
    let role : NewRole = switch (g.managerArea) {
      case (#kitchen) { #kitchenManager };
      case (#service) { #serviceManager };
      case (#none) {
        switch (g.role) {
          case (#admin) { #managingPartner };
          case (#storeManager) { #storeManager };
          case (#trainingManager) { #trainingManager };
          case (#leadership) { #leadership };
          case (#visitingManager) { #visitingManager };
          case (#trainer) { #trainer };
          case (#kiosk) { #kiosk };
          case (#integration) { #integration };
        };
      };
    };
    {
      principal = g.principal;
      role;
      approvedAt = g.approvedAt;
      approvedBy = g.approvedBy;
      accessEndsAt = g.accessEndsAt;
      trainerPositionIds = g.trainerPositionIds;
      linkedRoadieId = g.linkedRoadieId;
      staffProfile = switch (g.staffProfile) {
        case (?p) { ?migrateProfile(p) };
        case null { null };
      };
    };
  };

  /// Internal: reset a question that was marked final without a real Managing
  /// Partner action. The old build auto-finalized a question whenever every
  /// current owner had approved (and vacuously when it had no owners), so a
  /// question whose final mark is not a Managing Partner's is cleared. The
  /// answer, discussion, status and approvals are kept.
  func migrateQuestion(
    q : OpeningQuestion,
    accessGrants : Map.Map<Principal, NewAccessGrant>,
  ) : NewOpeningQuestion {
    let finalizedBy = switch (q.finalizedBy) {
      case (?p) {
        switch (accessGrants.get(p)) {
          case (?g) {
            switch (g.role) {
              case (#managingPartner) { ?p };
              case (_) { null };
            };
          };
          case null { null };
        };
      };
      case null { null };
    };
    let finalizedAt = switch (finalizedBy) {
      case (?_) { q.finalizedAt };
      case null { null };
    };
    {
      id = q.id;
      sectionTitle = q.sectionTitle;
      sectionOrder = q.sectionOrder;
      number = q.number;
      order = q.order;
      question = q.question;
      area = q.area;
      who = q.who;
      answer = q.answer;
      status = q.status;
      approvals = q.approvals;
      finalizedBy;
      finalizedAt;
      suggestions = q.suggestions;
      comments = q.comments;
      updatedAt = q.updatedAt;
      updatedBy = q.updatedBy;
      isDemo = q.isDemo;
    };
  };

  // OldActor is the NewActor of the preceding migration (00000027_000000.mo),
  // which matches the deployed baseline: grants carry `managerArea`, roles are
  // the eight-role variant, and Opening Questions already exist.
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
    accessGrants : Map.Map<Principal, OldAccessGrant>;
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
    counters : OldCounters;
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
    accessGrants : Map.Map<Principal, NewAccessGrant>;
    pendingUsers : Map.Map<Principal, NewPendingUser>;
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
    openingQuestions : Map.Map<Nat, NewOpeningQuestion>;
    openingQuestionEmailSettings : { var value : EmailSettings };
  };

  public func migration(old : OldActor) : NewActor {
    let accessGrants = old.accessGrants.map<Principal, OldAccessGrant, NewAccessGrant>(func(_, g) = migrateGrant(g));
    let pendingUsers = old.pendingUsers.map<Principal, PendingUser, NewPendingUser>(
      func(_, u) {
        {
          principal = u.principal;
          requestedAt = u.requestedAt;
          staffProfile = switch (u.staffProfile) {
            case (?p) { ?migrateProfile(p) };
            case null { null };
          };
        };
      }
    );
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
      accessGrants;
      pendingUsers;
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
      };
      kioskPin = old.kioskPin;
      demoState = old.demoState;
      uniformSettings = old.uniformSettings;
      openingQuestions = old.openingQuestions.map(func(_, q) = migrateQuestion(q, accessGrants));
      openingQuestionEmailSettings = old.openingQuestionEmailSettings;
    };
  };
};
