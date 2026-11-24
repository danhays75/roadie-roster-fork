import { QuestionArea, Role, createActor } from "@/backend";
import type { StoreDemoView, StoreInfo } from "@/backend";
import { demoRoleToRole } from "@/hooks/useDemo";
import { useDemoState, useMyAccess, useStoreInfo } from "@/hooks/useQueries";
import type { AccessGrant, AccessState, MyAccessView, NavItem } from "@/types";
import { useActor, useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * The Managing Partner holds full Admin permissions everywhere. Every role list
 * that grants Admin also grants the Managing Partner, so the two are always
 * checked together through `isAdminRole`.
 */
export const ADMIN_ROLES: Role[] = [Role.admin, Role.managingPartner];

/** Whether a role carries full Admin permissions (Admin or Managing Partner). */
export function isAdminRole(role: Role | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/** Roles allowed to archive or rehire a roadie. */
export const ARCHIVE_ROLES: Role[] = [Role.storeManager, ...ADMIN_ROLES];

/** Roles allowed to see the approvals queue. */
export const APPROVAL_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/** Roles allowed to see the kiosk sign-up surface. */
export const KIOSK_ROLES: Role[] = [
  Role.kiosk,
  ...ADMIN_ROLES,
  Role.storeManager,
];

/**
 * Roles allowed to see the export surface. The Integration role may open it
 * too, but only the Shareable export: the Full export stays locked to Admin and
 * Store Manager, which is what FULL_EXPORT_ROLES gates.
 */
export const EXPORT_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.leadership,
  Role.integration,
];

/** Roles allowed to download the Full export with contact details. */
export const FULL_EXPORT_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/** Roles allowed to edit a roadie's details or change their position. */
export const EDIT_ROADIE_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/** Roles allowed to see the Gift Bags surface. */
export const GIFT_BAGS_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
];

/**
 * Roles allowed to view the Uniforms surface: Admin, Managing Partner, Store
 * Manager and Training Manager. Training Manager may view the order but not
 * edit the settings, which is what UNIFORM_EDITOR_ROLES gates.
 */
export const UNIFORM_VIEWER_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
];

/** Roles allowed to edit the uniform settings (size curve and buffer). */
export const UNIFORM_EDITOR_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/**
 * Roles allowed to see the Opening Questions surface: Admin, Managing Partner,
 * Store Manager and Training Manager. Trainer, Leadership, Kiosk and
 * Integration are refused. A Kitchen Manager or Service Manager may also read
 * the section because their role carries the area they own.
 */
export const OPENING_QUESTIONS_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
];

/**
 * Roles that own Opening Questions: the Kitchen Manager owns Kitchen and Both
 * questions, the Service Manager owns Service and Both, and the Managing
 * Partner owns the Dan questions. The role itself carries the area, so no
 * separate grant field is needed. Ownership is per question, so use
 * `ownsOpeningQuestionArea` rather than this list for any question-level check.
 */
export const OPENING_QUESTIONS_OWNER_ROLES: Role[] = [
  Role.kitchenManager,
  Role.serviceManager,
  Role.managingPartner,
];

/**
 * Roles allowed to open a full profile from a card pop-up: Admin and Managing
 * Partner always, plus the Store Manager, who sees the link today. Every other
 * role keeps its current access.
 */
export const FULL_PROFILE_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/** Roles allowed to see the Leaders surface. Every readable role except Kiosk
 * and Integration, which have no roster read access.
 */
export const LEADERS_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
  Role.trainer,
  Role.visitingManager,
  Role.leadership,
];

/**
 * Roles allowed to see the Orientation check-in surface: the roles that may
 * read an orientation session view on the backend.
 */
export const ORIENTATION_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.visitingManager,
];

/**
 * Roles allowed to view the Groups shift boards: every read role except Kiosk
 * and Integration, which have no roster read access. Editing a board is gated
 * separately by GROUP_EDITOR_ROLES.
 */
export const GROUPS_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.trainer,
  Role.visitingManager,
  Role.leadership,
];

/** Roles allowed to edit a shift board (Admin, Managing Partner, Store Manager, Training Manager). */
export const GROUP_EDITOR_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
];

/**
 * Roles allowed to record a check-in on the trainer check-in board: the roles
 * that may write a check-in on the backend (Admin, Managing Partner, Store
 * Manager, Training Manager, NSO Trainer).
 */
export const CHECK_IN_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.trainer,
];

/**
 * Roles allowed to see the absent alerts list: the roles that may read the
 * alerts on the backend (Admin, Managing Partner, Store Manager, Training
 * Manager, Visiting Manager).
 */
export const ABSENT_ALERT_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.visitingManager,
];

/**
 * Roles allowed to see a roadie's contact info (work phone, email, contact
 * set): Admin, Managing Partner, Store Manager, plus the Kitchen Manager and
 * Service Manager, who carry this area. Dedicated to contact visibility so the
 * other role lists keep today's roles.
 */
export const CONTACT_INFO_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.kitchenManager,
  Role.serviceManager,
];

/**
 * Roles allowed to edit a shift board or group: Admin, Managing Partner, Store
 * Manager, Training Manager, plus the Kitchen Manager and Service Manager, who
 * carry this area. Dedicated to board editing so GROUP_EDITOR_ROLES keeps
 * today's roles for every other action it gates.
 */
export const SHIFT_BOARD_EDITOR_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
];

/**
 * Roles allowed to record and change check-ins: Admin, Managing Partner, Store
 * Manager, Training Manager, NSO Trainer, plus the Kitchen Manager and Service
 * Manager, who carry this area. Dedicated to check-ins so CHECK_IN_ROLES keeps
 * today's roles for every other action it gates.
 */
export const CHECK_IN_MANAGER_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.trainer,
  Role.kitchenManager,
  Role.serviceManager,
];

/**
 * Roles allowed to open the approvals queue and approve or reject kiosk
 * sign-ups: Admin, Managing Partner, Store Manager, plus the Kitchen Manager
 * and Service Manager, who carry this area. Dedicated to sign-up approval so
 * APPROVAL_ROLES keeps today's roles for every other action it gates.
 */
export const SIGNUP_APPROVER_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.kitchenManager,
  Role.serviceManager,
];

/**
 * Roles allowed to read a roadie's trainer notes: every read role except Kiosk
 * and Integration, matching the backend's roadie read restriction.
 */
export const TRAINER_NOTE_READ_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
  Role.trainer,
  Role.leadership,
  Role.visitingManager,
];

/**
 * Roles allowed to add a trainer note: Trainer, Training Manager, Kitchen
 * Manager, Service Manager, Store Manager, Managing Partner and Admin.
 */
export const TRAINER_NOTE_WRITE_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
  Role.trainer,
];

/**
 * Roles allowed to record a final trainer sign-off: Trainer, Training Manager,
 * Kitchen Manager, Service Manager, Store Manager, Managing Partner and Admin.
 * A Trainer is limited to roadies in their own stations, which the backend
 * enforces.
 */
export const FINAL_SIGN_OFF_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
  Role.kitchenManager,
  Role.serviceManager,
  Role.trainer,
];

/**
 * Roles allowed to clear a final sign-off: Admin, Managing Partner and Store
 * Manager. Every other sign-off role may record one but not clear it.
 */
export const CLEAR_SIGN_OFF_ROLES: Role[] = [...ADMIN_ROLES, Role.storeManager];

/**
 * Roles that see the Today screen read-only: they may read the day's summary
 * but cannot record a check-in. Every role that can reach Today but is not a
 * check-in role is read-only.
 */
export const TODAY_READ_ONLY_ROLES: Role[] = [
  Role.visitingManager,
  Role.leadership,
];

/**
 * Roles routed to the manager Today view (absent alerts plus per-shift
 * check-in counts): the group editors that may read the absent alerts on the
 * backend. Visiting Manager is deliberately excluded — the backend
 * listAbsentAlerts requires a group editor and traps for a Visiting Manager,
 * so that role sees the read-only attendance summary instead.
 */
export const MANAGER_TODAY_ROLES: Role[] = [
  ...ADMIN_ROLES,
  Role.storeManager,
  Role.trainingManager,
];

/** The full navigation model; each item declares which roles may see it. */
export const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.today", to: "/today", allowedRoles: [] },
  { labelKey: "nav.dashboard", to: "/dashboard", allowedRoles: [] },
  { labelKey: "nav.roster", to: "/roster", allowedRoles: [] },
  { labelKey: "nav.myProfile", to: "/my-profile", allowedRoles: [] },
  { labelKey: "nav.leaders", to: "/leaders", allowedRoles: LEADERS_ROLES },
  { labelKey: "nav.groups", to: "/groups", allowedRoles: GROUPS_ROLES },
  {
    labelKey: "nav.orientation",
    to: "/orientation",
    allowedRoles: ORIENTATION_ROLES,
  },
  {
    labelKey: "nav.openingQuestions",
    to: "/opening-questions",
    allowedRoles: [
      ...OPENING_QUESTIONS_ROLES,
      ...OPENING_QUESTIONS_OWNER_ROLES,
    ],
    badge: "openingQuestions",
  },
  {
    labelKey: "nav.approvals",
    to: "/approvals",
    allowedRoles: APPROVAL_ROLES,
    badge: "pendingApprovals",
  },
  { labelKey: "nav.admin", to: "/admin", allowedRoles: ADMIN_ROLES },
  { labelKey: "nav.kiosk", to: "/kiosk", allowedRoles: KIOSK_ROLES },
  { labelKey: "nav.export", to: "/export", allowedRoles: EXPORT_ROLES },
  {
    labelKey: "nav.giftBags",
    to: "/gift-bags",
    allowedRoles: GIFT_BAGS_ROLES,
  },
  {
    labelKey: "nav.uniforms",
    to: "/uniforms",
    allowedRoles: UNIFORM_VIEWER_ROLES,
  },
];

/**
 * Normalize the `getMyAccess` result. The current binding returns a
 * `MyAccessView` with a separate `grant` and `demoRole`; an older actor (or a
 * test mock) may return a bare `AccessGrant`, which is treated as a real grant
 * with no demo role.
 */
function normalizeAccessView(value: unknown): {
  grant: AccessGrant | null;
  demoRole: MyAccessView["demoRole"];
} {
  if (typeof value !== "object" || value === null) {
    return { grant: null, demoRole: undefined };
  }
  const record = value as Record<string, unknown>;
  if ("grant" in record || "demoRole" in record) {
    const view = value as MyAccessView;
    return { grant: view.grant ?? null, demoRole: view.demoRole };
  }
  return { grant: value as AccessGrant, demoRole: undefined };
}

/** A stable empty station list so a missing demo state never re-derives access. */
const NO_DEMO_STATIONS: bigint[] = [];

/**
 * Resolve the caller's access state from the backend access view.
 *
 * The backend returns the caller's real grant (or null) plus a separate
 * `demoRole` carrying the caller's own demo role while demo mode is on. A
 * caller with no real grant is never presented as really approved: while demo
 * mode is on they act as their chosen demo role against demo data only, and
 * while it is off they stay pending. The backend enforces the same permission
 * rules for the impersonated role as for a real user with that role.
 */
export function useAccessState(): AccessState {
  const { data, isLoading, isError, error, isReady } = useMyAccess();
  // The demo state is read directly rather than through `useDemo`, which also
  // mounts the four demo mutations. Every mounted backend hook triggers a
  // cache-wide refetch on mount, so an access check costs two hooks, not six.
  const { data: demoData } = useDemoState();
  const demoEnabled = demoData?.enabled ?? false;
  const demoStateRole = demoData?.demoRole ?? null;
  const demoTrainerStations = demoData?.demoTrainerStations ?? NO_DEMO_STATIONS;
  const { identity } = useInternetIdentity();

  return useMemo(() => {
    // Until the backend actor is ready the read has not run; report loading so
    // the waiting screen does not flash before the grant is known.
    if (!isReady || isLoading) return { kind: "loading" };

    const { grant, demoRole } = normalizeAccessView(data);
    const demoOn = demoEnabled;
    // The caller's own demo role: prefer the per-caller value from the access
    // view, falling back to the demo state read.
    const callerDemoRole = demoRole ?? demoStateRole;

    if (demoOn && callerDemoRole !== null && callerDemoRole !== undefined) {
      const effectiveRole = demoRoleToRole(callerDemoRole);
      // A real grant keeps its identity but acts as the demo role.
      if (grant) {
        return {
          kind: "granted",
          grant: { ...grant, role: effectiveRole },
          demo: true,
        };
      }
      // No real grant: synthesize a demo-only grant so an unapproved caller can
      // act as the demo role against demo data only.
      const principal =
        identity && !identity.getPrincipal().isAnonymous()
          ? identity.getPrincipal()
          : undefined;
      if (principal) {
        const synthetic: AccessGrant = {
          principal,
          approvedAt: 0n,
          approvedBy: principal,
          role: effectiveRole,
          trainerPositionIds: demoTrainerStations,
        };
        return { kind: "granted", grant: synthetic, demo: true };
      }
    }

    // Prefer a resolved grant over a failed poll: one transient error must not
    // replace the app (or a kiosk sign-up in progress) with the error screen.
    if (grant) return { kind: "granted", grant };
    if (isError) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
    return { kind: "pending" };
  }, [
    data,
    isLoading,
    isError,
    error,
    isReady,
    demoEnabled,
    demoStateRole,
    demoTrainerStations,
    identity,
  ]);
}

/**
 * The caller's real access grant, ignoring any demo impersonation. Used by the
 * demo banner so the "Turn off" control stays real-Admin only even while the
 * caller is viewing as another demo role. Returns null while loading or when
 * the caller has no real grant.
 */
export function useRealAccessGrant(): AccessGrant | null {
  const { data } = useMyAccess();
  return useMemo(() => normalizeAccessView(data).grant, [data]);
}

/**
 * Routes the Integration role is refused even though their nav entries carry
 * no role list: it has no roster read access, so Today and the Dashboard would
 * only trap on the backend.
 */
export const INTEGRATION_REFUSED_ROUTES: string[] = ["/today", "/dashboard"];

/** Whether the given role may see a nav item. */
export function canSeeNavItem(item: NavItem, role: Role | undefined): boolean {
  if (
    role === Role.integration &&
    INTEGRATION_REFUSED_ROUTES.includes(item.to)
  ) {
    return false;
  }
  if (item.allowedRoles.length === 0) return true;
  if (!role) return false;
  return item.allowedRoles.includes(role);
}

/** Whether the given role may archive or rehire. */
export function canArchive(role: Role | undefined): boolean {
  return !!role && ARCHIVE_ROLES.includes(role);
}

/** Whether the given role may open the Admin surface. */
export function canAdmin(role: Role | undefined): boolean {
  return isAdminRole(role);
}

/** Whether the given role may open the approvals queue. */
export function canApprove(role: Role | undefined): boolean {
  return !!role && APPROVAL_ROLES.includes(role);
}

/** Whether the given role may open the export surface. */
export function canExport(role: Role | undefined): boolean {
  return !!role && EXPORT_ROLES.includes(role);
}

/** Whether the given role may download the Full export with contact details. */
export function canDownloadFullExport(role: Role | undefined): boolean {
  return !!role && FULL_EXPORT_ROLES.includes(role);
}

/** Whether the given role may edit a roadie's details or position. */
export function canEditRoadie(role: Role | undefined): boolean {
  return !!role && EDIT_ROADIE_ROLES.includes(role);
}

/** Whether the given role may open the Gift Bags surface. */
export function canGiftBags(role: Role | undefined): boolean {
  return !!role && GIFT_BAGS_ROLES.includes(role);
}

/**
 * Whether the given role may open a full profile from a card pop-up. Admin and
 * Managing Partner always may, and the Store Manager keeps the link it sees
 * today. Trainer, Visiting Manager, Leadership, Kiosk and Integration do not.
 */
export function canOpenFullProfile(role: Role | undefined): boolean {
  return !!role && FULL_PROFILE_ROLES.includes(role);
}

/** Whether the given role may open the Leaders surface. */
export function canLeaders(role: Role | undefined): boolean {
  return !!role && LEADERS_ROLES.includes(role);
}

/** Whether the given role may view the Groups shift boards. */
export function canGroups(role: Role | undefined): boolean {
  return !!role && GROUPS_ROLES.includes(role);
}

/** Whether the given role may open the Orientation check-in surface. */
export function canOrientation(role: Role | undefined): boolean {
  return !!role && ORIENTATION_ROLES.includes(role);
}

/**
 * Whether the given role may open the Opening Questions surface. Admin,
 * Managing Partner, Store Manager and Training Manager always may; a Kitchen
 * Manager or Service Manager may because their role carries the area they own.
 * Trainer, Kiosk and Integration are refused.
 */
export function canOpeningQuestions(role: Role | undefined): boolean {
  if (!role) return false;
  return (
    OPENING_QUESTIONS_ROLES.includes(role) ||
    OPENING_QUESTIONS_OWNER_ROLES.includes(role)
  );
}

/** Whether the given role owns Opening Questions as a Kitchen or Service Manager. */
export function isOpeningQuestionsOwner(role: Role | undefined): boolean {
  return !!role && OPENING_QUESTIONS_OWNER_ROLES.includes(role);
}

/**
 * Whether the given role owns a question in the given area. This mirrors the
 * backend `ownsArea` exactly: the Kitchen Manager owns Kitchen and Both, the
 * Service Manager owns Service and Both, and the Managing Partner owns Dan.
 * Every per-question gate (Approve, untick, Edit, My questions, Needs my
 * approval, Next, need-you counts and nudge targets) uses this rule.
 */
export function ownsOpeningQuestionArea(
  role: Role | undefined,
  area: QuestionArea | undefined,
): boolean {
  if (!role || !area) return false;
  switch (area) {
    case QuestionArea.kitchen:
      return role === Role.kitchenManager;
    case QuestionArea.service:
      return role === Role.serviceManager;
    case QuestionArea.both:
      return role === Role.kitchenManager || role === Role.serviceManager;
    case QuestionArea.dan:
      return role === Role.managingPartner;
    default:
      return false;
  }
}

/**
 * Whether the given role may mark a question final or reopen it. Only the
 * Managing Partner may; the backend enforces the same rule.
 */
export function canFinalizeOpeningQuestions(role: Role | undefined): boolean {
  return role === Role.managingPartner;
}

/** Whether the given role may view the Uniforms surface. */
export function canUniforms(role: Role | undefined): boolean {
  return !!role && UNIFORM_VIEWER_ROLES.includes(role);
}

/** Whether the given role may edit the uniform settings. */
export function canEditUniforms(role: Role | undefined): boolean {
  return !!role && UNIFORM_EDITOR_ROLES.includes(role);
}

/** Whether the given role may record a check-in on the Today board. */
export function canCheckIn(role: Role | undefined): boolean {
  return !!role && CHECK_IN_ROLES.includes(role);
}

/** Whether the given role may see the absent alerts list. */
export function canSeeAbsentAlerts(role: Role | undefined): boolean {
  return !!role && ABSENT_ALERT_ROLES.includes(role);
}

/**
 * Whether the given role may see a roadie's contact info (work phone, email,
 * contact set). Admin, Managing Partner and Store Manager keep it, and the
 * Kitchen Manager and Service Manager carry this area.
 */
export function canSeeContactInfo(role: Role | undefined): boolean {
  return !!role && CONTACT_INFO_ROLES.includes(role);
}

/**
 * Whether the given role may edit a shift board or group. Admin, Managing
 * Partner, Store Manager and Training Manager keep it, and the Kitchen Manager
 * and Service Manager carry this area.
 */
export function canEditShiftBoards(role: Role | undefined): boolean {
  return !!role && SHIFT_BOARD_EDITOR_ROLES.includes(role);
}

/**
 * Whether the given role may record and change check-ins. Admin, Managing
 * Partner, Store Manager, Training Manager and NSO Trainer keep it, and the
 * Kitchen Manager and Service Manager carry this area.
 */
export function canManageCheckIns(role: Role | undefined): boolean {
  return !!role && CHECK_IN_MANAGER_ROLES.includes(role);
}

/**
 * Whether the given role may open the approvals queue and approve or reject
 * kiosk sign-ups. Admin, Managing Partner and Store Manager keep it, and the
 * Kitchen Manager and Service Manager carry this area.
 */
export function canApproveSignups(role: Role | undefined): boolean {
  return !!role && SIGNUP_APPROVER_ROLES.includes(role);
}

/**
 * Whether the given role may read a roadie's trainer notes. Every read role
 * except Kiosk and Integration may read them.
 */
export function canReadTrainerNotes(role: Role | undefined): boolean {
  return !!role && TRAINER_NOTE_READ_ROLES.includes(role);
}

/**
 * Whether the given role may add a trainer note. Trainer, Training Manager,
 * Kitchen Manager, Service Manager, Store Manager, Managing Partner and Admin
 * may add one.
 */
export function canAddTrainerNote(role: Role | undefined): boolean {
  return !!role && TRAINER_NOTE_WRITE_ROLES.includes(role);
}

/**
 * Whether the given role may record a final trainer sign-off. Trainer, Training
 * Manager, Kitchen Manager, Service Manager, Store Manager, Managing Partner
 * and Admin may; a Trainer is limited to their own stations by the backend.
 */
export function canRecordFinalSignOff(role: Role | undefined): boolean {
  return !!role && FINAL_SIGN_OFF_ROLES.includes(role);
}

/**
 * Whether the given role may clear a final sign-off. Admin, Managing Partner
 * and Store Manager may.
 */
export function canClearFinalSignOff(role: Role | undefined): boolean {
  return !!role && CLEAR_SIGN_OFF_ROLES.includes(role);
}

/** Whether the given role sees the Today screen read-only. */
export function isTodayReadOnly(role: Role | undefined): boolean {
  return !!role && TODAY_READ_ONLY_ROLES.includes(role);
}

/** Whether the given role is routed to the manager Today view. */
export function canSeeManagerToday(role: Role | undefined): boolean {
  return !!role && MANAGER_TODAY_ROLES.includes(role);
}

/**
 * The non-sensitive store details a demo viewer may read while demo mode is on,
 * read through the backend's `getStoreDemoView`. Refused when demo mode is off,
 * so the query stays disabled unless demo mode is on.
 */
function useStoreDemoView(enabled: boolean) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["storeDemoView"],
    queryFn: async (): Promise<StoreDemoView | null> => {
      if (!actor) return null;
      return actor.getStoreDemoView();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Map the demo store view onto the full `StoreInfo` shape. The demo view only
 * carries the non-sensitive fields (name, number, location, opening date, time
 * zone and positions); every other setting falls back to a neutral default so
 * the demo screens can render without exposing real store settings.
 */
function demoViewToStoreInfo(view: StoreDemoView): StoreInfo {
  return {
    amShiftEnd: 0n,
    pmShiftStart: 0n,
    storeNumber: view.storeNumber,
    leaderTalkName: "",
    appName: view.appName,
    leaderTalkSize: 0n,
    amShiftStart: 0n,
    openingDate: view.openingDate,
    pmShiftEnd: 0n,
    trainingGroupSize: 4n,
    address: "",
    locationName: view.locationName,
    timeZone: view.timeZone,
    storePhone: "",
  };
}

/**
 * The store details a screen needs, demo-aware. A caller with a real grant
 * reads the full `getStoreInfo`; a demo-only viewer (no real grant) is refused
 * there, so while demo mode is on the hook falls back to the non-sensitive
 * `getStoreDemoView` and maps it onto the `StoreInfo` shape. This lets a demo
 * viewer still see the store name and the details the demo screens need without
 * exposing the real store settings.
 */
export function useDemoAwareStoreInfo() {
  const real = useStoreInfo();
  const { data: demoData } = useDemoState();
  const demoEnabled = demoData?.enabled ?? false;
  // Read the demo view whenever demo mode is on and the real read has not
  // produced data yet, so a demo-only viewer (whose real read is refused) sees
  // the store details without waiting for the real read's retries to exhaust.
  const demoView = useStoreDemoView(demoEnabled && !real.data);

  const data = useMemo<StoreInfo | null>(() => {
    if (real.data) return real.data;
    if (demoView.data) return demoViewToStoreInfo(demoView.data);
    return null;
  }, [real.data, demoView.data]);

  return {
    data,
    isLoading: !data && (real.isLoading || demoView.isLoading),
    isError: real.isError && !demoView.data,
    refetch: real.refetch,
  };
}
