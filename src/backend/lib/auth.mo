import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Common "../types/common";
import Access "../types/access";

/// Shared authorization helpers. Every domain lib receives the access-grant map
/// and the caller principal, and asks this module what the caller may do.
module {
  /// True when demo mode is currently on, accounting for the eight-hour
  /// auto-off. Pure read; the demo lib owns the actual auto-off write.
  public func demoActive(demoState : Common.DemoState) : Bool {
    if (not demoState.enabled) {
      return false;
    };
    switch (demoState.autoOffAt) {
      case (?autoOffAt) { Time.now() < autoOffAt };
      case null { true };
    };
  };

  /// The system actor principal recorded as the approver of a system-created
  /// demo leader. Demo leaders are recognised by this marker, never by a work
  /// email a user could type themselves.
  public func systemActor() : Principal {
    Principal.fromText("aaaaa-aa");
  };

  /// True when an access grant is a seeded demo leader: created by the system
  /// (its approver is the system actor). A user cannot set their own approver,
  /// so typing "DEMO" as a work email never makes them a demo leader.
  public func isDemoLeader(grant : Access.AccessGrant) : Bool {
    grant.approvedBy == systemActor();
  };

  /// Map a demo role to the real application role it impersonates.
  public func demoRoleToRole(role : Common.DemoRole) : Common.Role {
    switch (role) {
      case (#admin) { #admin };
      case (#storeManager) { #storeManager };
      case (#trainingManager) { #trainingManager };
      case (#trainer) { #trainer };
      case (#visitingManager) { #visitingManager };
      case (#leadership) { #leadership };
      case (#kiosk) { #kiosk };
    };
  };

  /// The demo role a signed-in caller is currently impersonating, or null when
  /// demo mode is off, the caller is anonymous, or the caller has not chosen a
  /// role. A caller with no stored entry gets no demo role at all: demo mode
  /// never grants access to someone who was never approved.
  public func demoRoleFor(
    demoState : Common.DemoState,
    caller : Principal,
  ) : ?Common.DemoRole {
    if (caller.isAnonymous()) {
      return null;
    };
    if (not demoActive(demoState)) {
      return null;
    };
    switch (demoState.demoRoles.get(caller)) {
      case (?entry) { ?entry.role };
      case null { null };
    };
  };

  /// The demo trainer stations for a signed-in caller, or an empty array when
  /// demo mode is off, the caller is anonymous, or the caller has no stored
  /// entry.
  public func demoTrainerStationsFor(
    demoState : Common.DemoState,
    caller : Principal,
  ) : [Common.PositionId] {
    if (caller.isAnonymous() or not demoActive(demoState)) {
      return [];
    };
    switch (demoState.demoRoles.get(caller)) {
      case (?entry) { entry.stations };
      case null { [] };
    };
  };

  /// The demo manager principal a signed-in caller is viewing as while demo
  /// mode is on and their demo role is Store Manager or Training Manager, or
  /// null when demo mode is off, the caller is anonymous, the caller's demo
  /// role is neither of those, or the caller has not chosen one.
  public func demoManagerFor(
    demoState : Common.DemoState,
    caller : Principal,
  ) : ?Principal {
    switch (demoRoleFor(demoState, caller)) {
      case (?#storeManager) {
        demoState.demoManagerAs.get(caller);
      };
      case (?#trainingManager) {
        demoState.demoManagerAs.get(caller);
      };
      case _ { null };
    };
  };

  /// The principal a caller should be treated as when matching board groups,
  /// group-change notices and crew ownership. While demo mode is on and the
  /// caller's demo role is NSO Trainer with a chosen demo leader, returns that
  /// demo leader principal; while it is Store Manager or Training Manager with
  /// a chosen demo manager, returns that demo manager principal; otherwise
  /// returns the caller unchanged. Never consulted outside demo mode.
  public func actingPrincipal(
    demoState : Common.DemoState,
    caller : Principal,
  ) : Principal {
    switch (demoRoleFor(demoState, caller)) {
      case (?#trainer) {
        switch (demoState.demoTrainerAs.get(caller)) {
          case (?leader) { leader };
          case null { caller };
        };
      };
      case (?#storeManager) {
        switch (demoState.demoManagerAs.get(caller)) {
          case (?manager) { manager };
          case null { caller };
        };
      };
      case (?#trainingManager) {
        switch (demoState.demoManagerAs.get(caller)) {
          case (?manager) { manager };
          case null { caller };
        };
      };
      case _ { caller };
    };
  };

  /// The effective role of a caller, or null when unregistered/expired. While
  /// demo mode is on, a **signed-in** caller (even one not yet approved) acts
  /// as their own chosen demo role; an anonymous caller always gets null, even
  /// while demo mode is on.
  public func effectiveRole(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : ?Common.Role {
    if (caller.isAnonymous()) {
      return null;
    };
    switch (demoRoleFor(demoState, caller)) {
      case (?role) { ?demoRoleToRole(role) };
      case null { realRole(accessGrants, caller) };
    };
  };

  /// The caller's real role from their access grant, or null when
  /// unregistered/expired. Ignores demo mode.
  public func realRole(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : ?Common.Role {
    switch (accessGrants.get(caller)) {
      case (?grant) {
        switch (grant.accessEndsAt) {
          case (?endsAt) {
            if (Time.now() >= endsAt) { null } else { ?grant.role };
          };
          case null { ?grant.role };
        };
      };
      case null { null };
    };
  };

  /// True when a role holds every Admin permission: Admin or Managing Partner.
  public func roleHasAdminRights(role : Common.Role) : Bool {
    role == #admin or role == #managingPartner;
  };

  /// True when a role may read the Opening Questions section: Admin, Managing
  /// Partner, Store Manager, Training Manager, Kitchen Manager or Service
  /// Manager. Every other role is refused.
  public func roleCanReadOpeningQuestions(role : Common.Role) : Bool {
    roleHasAdminRights(role)
      or role == #storeManager
      or role == #trainingManager
      or role == #kitchenManager
      or role == #serviceManager;
  };

  /// Require the caller's *real* role to be one that may read Opening
  /// Questions, ignoring any impersonated demo role, so demo mode can never
  /// raise anyone's access to real Opening Questions data. Traps otherwise.
  public func requireRealOpeningQuestionsReader(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Common.Role {
    let role = realRole(accessGrants, caller)
      ?? Runtime.trap("Access denied: caller is not registered or access has ended");
    if (not roleCanReadOpeningQuestions(role)) {
      Runtime.trap("Access denied: your role may not read Opening Questions");
    };
    role;
  };

  /// Require the caller's *real* role to hold Admin rights (Admin or Managing
  /// Partner), ignoring any impersonated demo role. Traps otherwise.
  public func requireRealAdminRights(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : () {
    switch (realRole(accessGrants, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role)) {
          Runtime.trap("Access denied: Admin role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin role required");
      };
    };
  };

  /// True when the caller's *real* role holds Admin rights (Admin or Managing
  /// Partner), ignoring any impersonated demo role.
  public func isRealAdmin(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) { roleHasAdminRights(role) };
      case null { false };
    };
  };

  /// True when the caller's *real* role is the Managing Partner, ignoring any
  /// impersonated demo role.
  public func isRealManagingPartner(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : Bool {
    switch (realRole(accessGrants, caller)) {
      case (?role) { role == #managingPartner };
      case null { false };
    };
  };

  /// True when a grant is a real, non-expired Managing Partner that is not a
  /// demo leader.
  public func isActiveManagingPartner(grant : Access.AccessGrant) : Bool {
    if (grant.role != #managingPartner) {
      return false;
    };
    if (isDemoLeader(grant)) {
      return false;
    };
    switch (grant.accessEndsAt) {
      case (?endsAt) { Time.now() < endsAt };
      case null { true };
    };
  };

  /// True when at least one real, non-expired, non-demo Managing Partner grant
  /// exists.
  public func hasActiveManagingPartner(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
  ) : Bool {
    accessGrants.values().any(func(g) = isActiveManagingPartner(g));
  };

  /// True when the caller is a registered, non-expired Admin or Managing
  /// Partner. While demo mode is on, the caller's own impersonated demo role is
  /// consulted.
  public func isAdmin(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) { roleHasAdminRights(role) };
      case null { false };
    };
  };

  /// True when the caller is a registered, non-expired Managing Partner. While
  /// demo mode is on, the caller's own impersonated demo role is consulted.
  public func isManagingPartner(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) { role == #managingPartner };
      case null { false };
    };
  };

  /// Require the Managing Partner role; trap otherwise. While demo mode is on,
  /// the caller's own impersonated demo role is consulted.
  public func requireManagingPartner(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    if (not isManagingPartner(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: Managing Partner role required");
    };
  };

  /// True when the caller is Admin or Store Manager. While demo mode is on, the
  /// caller's own impersonated demo role is consulted.
  public func isManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) { roleHasAdminRights(role) or role == #storeManager };
      case null { false };
    };
  };

  /// True when a role may see contact info, edit groups, check people in and
  /// approve sign-ups: Admin, Managing Partner, Store Manager, Kitchen Manager
  /// or Service Manager. This is the four-area access set only; it never widens
  /// any other manager or group-editor action.
  public func roleHasFourAreaAccess(role : Common.Role) : Bool {
    roleHasAdminRights(role)
      or role == #storeManager
      or role == #kitchenManager
      or role == #serviceManager;
  };

  /// True when the caller may see contact info (Admin, Managing Partner, Store
  /// Manager, Kitchen Manager or Service Manager). While demo mode is on, the
  /// caller's own impersonated demo role is consulted, so a demo Trainer really
  /// cannot see contact info.
  public func canSeeContactSet(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) { roleHasFourAreaAccess(role) };
      case null { false };
    };
  };

  /// Require a caller who may see contact info (Admin, Managing Partner, Store
  /// Manager, Kitchen Manager or Service Manager); trap otherwise. While demo
  /// mode is on, the caller's own impersonated demo role is consulted.
  public func requireContactViewer(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    if (not canSeeContactSet(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: Admin, Store Manager, Kitchen Manager or Service Manager role required");
    };
  };

  /// Require a caller who may edit shift boards and groups (Admin, Managing
  /// Partner, Store Manager, Training Manager, Kitchen Manager or Service
  /// Manager); trap otherwise. While demo mode is on, the caller's own
  /// impersonated demo role is consulted. Real boards are additionally blocked
  /// by the demo real-settings guard at the call site; demo boards stay
  /// editable in demo.
  public func requireGroupEditorFourArea(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasFourAreaAccess(role) and role != #trainingManager) {
          Runtime.trap("Access denied: Admin, Store Manager, Training Manager, Kitchen Manager or Service Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Store Manager, Training Manager, Kitchen Manager or Service Manager role required");
      };
    };
  };

  /// Require a caller who may check people in and change check-ins (Admin,
  /// Managing Partner, Store Manager, Training Manager, Kitchen Manager or
  /// Service Manager); trap otherwise. While demo mode is on, the caller's own
  /// impersonated demo role is consulted.
  public func requireCheckInManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasFourAreaAccess(role) and role != #trainingManager) {
          Runtime.trap("Access denied: Admin, Store Manager, Training Manager, Kitchen Manager or Service Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Store Manager, Training Manager, Kitchen Manager or Service Manager role required");
      };
    };
  };

  /// Require a caller who may open the approvals queue and approve or reject
  /// kiosk sign-ups (Admin, Managing Partner, Store Manager, Kitchen Manager or
  /// Service Manager); trap otherwise. While demo mode is on, the caller's own
  /// impersonated demo role is consulted.
  public func requireSignupApprover(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasFourAreaAccess(role)) {
          Runtime.trap("Access denied: Admin, Store Manager, Kitchen Manager or Service Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Store Manager, Kitchen Manager or Service Manager role required");
      };
    };
  };

  /// True when the caller is a Kiosk login (reads are rejected). While demo
  /// mode is on, the caller's own impersonated demo role is consulted.
  public func isKiosk(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Bool {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) { role == #kiosk };
      case null { false };
    };
  };

  /// Require a registered caller; trap otherwise. While demo mode is on, a
  /// signed-in caller acts as their own chosen demo role; an anonymous caller
  /// is always unregistered.
  public func requireRegistered(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Common.Role {
    effectiveRole(accessGrants, demoState, caller)
      ?? Runtime.trap("Access denied: caller is not registered or access has ended");
  };

  /// Require Admin; trap otherwise. While demo mode is on, the caller's own
  /// impersonated demo role is consulted.
  public func requireAdmin(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    if (not isAdmin(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: Admin role required");
    };
  };

  /// Require the caller's *real* Admin role, ignoring any impersonated demo
  /// role. Used by the demo-mode controls themselves so a real Admin can always
  /// turn demo mode off and manage demo data, even while impersonating a
  /// non-admin demo role.
  public func requireRealAdmin(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : () {
    switch (realRole(accessGrants, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role)) {
          Runtime.trap("Access denied: Admin role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin role required");
      };
    };
  };

  /// Require the caller's *real* Admin or Store Manager role, ignoring any
  /// impersonated demo role.
  public func requireRealManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    caller : Principal,
  ) : () {
    switch (realRole(accessGrants, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role) and role != #storeManager) {
          Runtime.trap("Access denied: Admin or Store Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin or Store Manager role required");
      };
    };
  };

  /// Require a real Admin grant and refuse while demo mode is on. Applied to
  /// every write that changes real, shared settings so a demo impersonation can
  /// never mutate real data.
  public func requireRealSettingsAdmin(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    requireRealAdmin(accessGrants, caller);
    if (demoActive(demoState)) {
      Runtime.trap("Turn off demo mode to change real settings");
    };
  };

  /// Require a real Admin or Store Manager grant and refuse while demo mode is
  /// on. Applied to every write that changes real, shared settings so a demo
  /// impersonation can never mutate real data.
  public func requireRealSettingsManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    requireRealManager(accessGrants, caller);
    if (demoActive(demoState)) {
      Runtime.trap("Turn off demo mode to change real settings");
    };
  };

  /// Require Admin or Store Manager; trap otherwise. While demo mode is on, the
  /// caller's own impersonated demo role is consulted.
  public func requireManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    if (not isManager(accessGrants, demoState, caller)) {
      Runtime.trap("Access denied: Admin or Store Manager role required");
    };
  };

  /// Require an orientation-staff caller (Admin, Store Manager, Training
  /// Manager or Visiting Manager); trap otherwise. While demo mode is on, the
  /// caller's own impersonated demo role is consulted.
  public func requireOrientationStaff(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role) and role != #storeManager and role != #trainingManager and role != #visitingManager) {
          Runtime.trap("Access denied: Admin, Store Manager, Training Manager or Visiting Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Store Manager, Training Manager or Visiting Manager role required");
      };
    };
  };

  /// Require a group-editor caller (Admin, Store Manager or Training Manager);
  /// trap otherwise. While demo mode is on, the caller's own impersonated demo
  /// role is consulted. Real boards are additionally blocked by the demo
  /// real-settings guard at the call site; demo boards stay editable in demo.
  public func requireGroupEditor(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role) and role != #storeManager and role != #trainingManager) {
          Runtime.trap("Access denied: Admin, Store Manager or Training Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Store Manager or Training Manager role required");
      };
    };
  };

  /// Require a leader-talk manager caller (Admin, Managing Partner, Store
  /// Manager or Training Manager); trap otherwise. While demo mode is on, the
  /// caller's own impersonated demo role is consulted.
  public func requireLeaderTalkManager(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role) and role != #storeManager and role != #trainingManager) {
          Runtime.trap("Access denied: Admin, Managing Partner, Store Manager or Training Manager role required");
        };
      };
      case null {
        Runtime.trap("Access denied: Admin, Managing Partner, Store Manager or Training Manager role required");
      };
    };
  };

  /// Require a leader-talk reader caller (Admin, Managing Partner, Store
  /// Manager, Training Manager, Kitchen Manager, Service Manager, Leadership or
  /// Visiting Manager); trap otherwise. Trainer, Kiosk and Integration are
  /// refused. While demo mode is on, the caller's own impersonated demo role is
  /// consulted.
  public func requireLeaderTalkReader(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : () {
    switch (effectiveRole(accessGrants, demoState, caller)) {
      case (?role) {
        if (not roleHasAdminRights(role)
          and role != #storeManager
          and role != #trainingManager
          and role != #kitchenManager
          and role != #serviceManager
          and role != #leadership
          and role != #visitingManager) {
          Runtime.trap("Access denied: leader talks are not readable by this role");
        };
      };
      case null {
        Runtime.trap("Access denied: leader talks are not readable by this role");
      };
    };
  };

  /// Require a read-capable caller (any role except Kiosk and Integration);
  /// trap otherwise. While demo mode is on, the caller's own impersonated demo
  /// role is consulted. Integration is limited to the Shareable export, so it
  /// is refused on every other read.
  public func requireReadable(
    accessGrants : Map.Map<Principal, Access.AccessGrant>,
    demoState : Common.DemoState,
    caller : Principal,
  ) : Common.Role {
    let role = requireRegistered(accessGrants, demoState, caller);
    if (role == #kiosk) {
      Runtime.trap("Access denied: Kiosk logins may only submit a sign-up");
    };
    if (role == #integration) {
      Runtime.trap("Access denied: Integration role may only read the Shareable export");
    };
    role;
  };
};

