import {
  type AbsentAlertView,
  type AlertId,
  type AlertSummary,
  type ApprovalDecision,
  type ApprovalRequest,
  type AtRiskRoadie,
  type BatchFinalResult,
  type CheckInBoardView,
  type CheckInState,
  type Checklists,
  type CoverageView,
  type CrewEventId,
  type CrewEventSummary,
  type CrewId,
  type CrewSummary,
  type DailyEmailStatus,
  type DateOnly,
  type DateTime,
  type DemoActionResult,
  type DemoDataSummary,
  type DemoRole,
  type DemoStateView,
  type DuplicateMatch,
  type EmailSettings,
  type EventAnswer,
  type EventAttendance,
  type EventCrewView,
  type EventId,
  type FinalSignOff,
  type FinalSignOffView,
  type FinishByView,
  type GroupChangeNotice,
  type ImportFile,
  type ImportValidation,
  type LeaderSummary,
  type LeaderTalk,
  type LeaderTalkId,
  type LeaderTalkView,
  type ManagerScoreRow,
  type MyCrewView,
  type MyGroupView,
  type NudgeAlert,
  type OrientationSessionOption,
  type OrientationSessionView,
  type PaySetup,
  type PhotoRef,
  type Position,
  type PositionId,
  type PretendDate,
  type ProgressSummary,
  type QuestionDiscussion,
  type QuestionFilter,
  type QuestionHistoryEntry,
  type QuestionId,
  type QuestionTab,
  type QuestionView,
  type RetentionSettings,
  type RoadieId,
  type Role,
  type ScheduleEvent,
  type Shift,
  type ShiftBoard,
  type ShiftBoardView,
  type SignatureRef,
  type SignupId,
  type SignupSubmission,
  type StaffProfile,
  type StoreInfo,
  type StoreLogos,
  type StoreTemplateFile,
  type SuggestionId,
  type Timestamp,
  type TodayView,
  type TrainerNote,
  type TrainerNoteView,
  type UnassignedRoadieRow,
  type UniformCheckoffView,
  type UniformHouseFilter,
  type UniformOrderView,
  type UniformSettings,
  type UpcomingEventView,
  createActor,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import type { Principal } from "@icp-sdk/core/principal";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/* ---------------------------------------------------------------------------
   Access & approval
--------------------------------------------------------------------------- */

export function useMyAccess() {
  const { actor, isFetching } = useActor(createActor);
  const enabled = !!actor && !isFetching;
  const query = useQuery({
    queryKey: ["myAccess"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getMyAccess();
    },
    enabled,
    // Poll so a pending caller's approval appears without a manual reload.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  // A disabled query reports `isLoading: false`, so expose whether the read has
  // actually been able to run. Callers treat "not ready" as loading rather than
  // as a resolved pending state.
  return { ...query, isReady: enabled };
}

/**
 * The caller's own pending access request, if any. Returns null when the
 * caller has no pending entry; otherwise the requestedAt of that pending entry
 * and hasProfile = true when a staff profile has been submitted. Polls like
 * `useMyAccess` so a pending caller's state stays current without a reload.
 */
export function useMyPendingRequest() {
  const { actor, isFetching } = useActor(createActor);
  const enabled = !!actor && !isFetching;
  const query = useQuery({
    queryKey: ["myPendingRequest"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getMyPendingRequest();
    },
    enabled,
    // Poll so a pending caller's request state stays current without a reload.
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  // A disabled query reports `isLoading: false`, so expose whether the read has
  // actually been able to run. Callers treat "not ready" as loading rather than
  // as a resolved absent state.
  return { ...query, isReady: enabled };
}

/**
 * The pending sign-in queue. Only admins may read it, so callers pass
 * `enabled` (typically `canApprove(role)`) to avoid a trapping read for every
 * other role.
 */
export function usePendingUsers(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["pendingUsers"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingUsers();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * The pending kiosk sign-ups queue. Readable by sign-up approvers, so callers
 * pass `enabled` (typically `canApproveSignups(role)`) to avoid a trapping read
 * for a role that may not approve sign-ups.
 */
export function usePendingSignups(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["pendingSignups"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingSignups();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

export function useSignupDuplicates(id: SignupId | undefined) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["signupDuplicates", id?.toString()],
    queryFn: async () => {
      if (!actor || id === undefined) return [];
      return actor.findDuplicates(id);
    },
    enabled: !!actor && !isFetching && id !== undefined,
  });
}

export function useApproveSignup() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: SignupId;
      decision: ApprovalDecision;
      signature: SignatureRef;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveSignup(args.id, args.decision, args.signature);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pendingSignups"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

export function useRejectSignup() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: SignupId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectSignup(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pendingSignups"] });
    },
  });
}

export function useRequestAccess() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.requestAccess();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myAccess"] });
      void queryClient.invalidateQueries({ queryKey: ["pendingUsers"] });
    },
  });
}

/**
 * Bridge the platform's first-admin grant into the app's own access model.
 * Idempotent: the backend only persists a grant while no app Admin exists and
 * the caller is already a platform admin, so it is safe to call for every
 * signed-in caller. Returns true once the caller holds an app Admin grant.
 */
export function useBootstrapAdmin() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.bootstrapAdmin();
    },
    onSuccess: (granted) => {
      if (granted) {
        void queryClient.invalidateQueries({ queryKey: ["myAccess"] });
        void queryClient.invalidateQueries({ queryKey: ["pendingUsers"] });
        void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
        void queryClient.invalidateQueries({ queryKey: ["adminCount"] });
      }
    },
  });
}

export function useAccessGrants() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["accessGrants"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listAccessGrants();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useAdminCount() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["adminCount"],
    queryFn: async () => {
      if (!actor) return 0n;
      return actor.adminCount();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useApproveUser() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { request: ApprovalRequest }) => {
      if (!actor) throw new Error("Backend is not ready");
      await actor.approveUser(args.request);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pendingUsers"] });
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
      void queryClient.invalidateQueries({ queryKey: ["adminCount"] });
    },
  });
}

export function useUpdateUserRole() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { principal: Principal; role: Role }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateUserRole(args.principal, args.role);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
      void queryClient.invalidateQueries({ queryKey: ["adminCount"] });
      void queryClient.invalidateQueries({ queryKey: ["leaders"] });
    },
  });
}

export function useUpdateTrainerStations() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      principal: Principal;
      positionIds: PositionId[];
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateTrainerStations(args.principal, args.positionIds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
    },
  });
}

export function useUpdateAccessEnd() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      principal: Principal;
      accessEndsAt: Timestamp | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateAccessEnd(args.principal, args.accessEndsAt);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
    },
  });
}

export function useRemoveUser() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (principal: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.removeUser(principal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
      void queryClient.invalidateQueries({ queryKey: ["adminCount"] });
    },
  });
}

/**
 * Whether an Admin has set the kiosk staff PIN. The kiosk sign-out checks the
 * entered PIN against the stored hash, so this tells an admin whether a PIN
 * exists yet. Admin-only on the backend, so callers pass `enabled` to avoid a
 * trapping read for other roles.
 */
export function useHasKioskPin(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["hasKioskPin"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.hasKioskPin();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Set the kiosk staff PIN. The backend stores only a one-way hash, so the
 * plaintext is never persisted or returned. Admin-only.
 */
export function useSetKioskPin() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pin: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setKioskPin(pin);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hasKioskPin"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Demo mode
--------------------------------------------------------------------------- */

/**
 * The current demo state. Readable by any caller, including unregistered users,
 * so the banner can render on the sign-in and waiting screens. Polls so an
 * auto-off (eight hours) or another admin's change is reflected without a
 * reload.
 */
export function useDemoState() {
  const { actor, isFetching } = useActor(createActor);
  const enabled = !!actor && !isFetching;
  const query = useQuery({
    queryKey: ["demoState"],
    queryFn: async (): Promise<DemoStateView | null> => {
      if (!actor) return null;
      return actor.getDemoState();
    },
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  return { ...query, isReady: enabled };
}

/**
 * Turn demo mode on or off (Admin only). Turning it on requires the literal
 * confirmation "DEMO". The demo state is invalidated so the banner and every
 * demo-aware read refresh.
 */
export function useSetDemoMode() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      enabled: boolean;
      confirmation: string;
    }): Promise<DemoActionResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setDemoMode(args.enabled, args.confirmation);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demoState"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
      // Turning demo mode on/off changes what every screen shows, so refetch
      // every query (dashboard tiles, countdown, Today, Orientation, roster).
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Choose the impersonated demo role and, for a demo NSO Trainer, the stations
 * that role may see. Any signed-in caller may choose a demo role while demo
 * mode is on.
 */
export function useSetDemoRole() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      role: DemoRole;
      stations: PositionId[];
    }): Promise<DemoActionResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setDemoRole(args.role, args.stations);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demoState"] });
      void queryClient.invalidateQueries({ queryKey: ["myAccess"] });
    },
  });
}

/**
 * Choose which demo leader a demo NSO Trainer views as, so "View as NSO
 * Trainer" can see that leader's group. Any signed-in caller may choose while
 * demo mode is on. The chosen trainer changes what every screen shows, so every
 * query is refetched.
 */
export function useSetDemoTrainerAs() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      trainerPrincipal: Principal,
    ): Promise<DemoActionResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setDemoTrainerAs(trainerPrincipal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Choose which demo manager a demo Store Manager or Training Manager views as,
 * so crew ownership matching uses that manager. Any signed-in caller may choose
 * while demo mode is on. The chosen manager changes what every screen shows, so
 * every query is refetched.
 */
export function useSetDemoManagerAs() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      managerPrincipal: Principal,
    ): Promise<DemoActionResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setDemoManagerAs(managerPrincipal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Set or clear the pretend "now" used while demo mode is on. Null restores the
 * real clock.
 */
export function useSetPretendDate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      pretendDate: PretendDate | null,
    ): Promise<DemoActionResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setPretendDate(pretendDate);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demoState"] });
      // The pretend date overrides "now" for every screen, so refetch every
      // query (dashboard tiles, countdown, Today, Orientation, roster).
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * The cache key holding the timestamp of the last successful Load demo data
 * action. It is bumped on every load, even when the seed is idempotent and the
 * record counts do not change, so surfaces can react to the action itself.
 */
export const DEMO_DATA_LOADED_KEY = ["demoDataLoadedAt"] as const;

/**
 * The timestamp of the last successful Load demo data action, or 0 before any
 * load. Reads the shared marker written by `useLoadDemoData`, so it changes on
 * every load regardless of whether the demo record counts changed.
 */
export function useDemoDataLoadedAt(): number {
  const { data } = useQuery({
    queryKey: DEMO_DATA_LOADED_KEY,
    queryFn: async (): Promise<number> => 0,
    staleTime: Number.POSITIVE_INFINITY,
    enabled: false,
  });
  return data ?? 0;
}

/** Count the demo records currently loaded (Admin, demo mode only). */
export function useDemoDataSummary(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["demoDataSummary"],
    queryFn: async (): Promise<DemoDataSummary | null> => {
      if (!actor) return null;
      return actor.getDemoDataSummary();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Seed the demo data set (Admin, demo mode only). Invalidates every surface the
 * seed populates so the demo records appear immediately.
 */
export function useLoadDemoData() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DemoDataSummary> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.loadDemoData();
    },
    onSuccess: () => {
      // Bump the load marker first so surfaces keyed to the action itself (the
      // practice run card) reset even when the idempotent seed changes nothing.
      queryClient.setQueryData(DEMO_DATA_LOADED_KEY, Date.now());
      void queryClient.invalidateQueries({ queryKey: ["demoDataSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["pendingSignups"] });
      void queryClient.invalidateQueries({ queryKey: ["crews"] });
      void queryClient.invalidateQueries({ queryKey: ["leaders"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Remove every demo record (Admin, demo mode only). Real records are never
 * touched.
 */
export function useClearDemoData() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DemoDataSummary> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.clearDemoData();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demoDataSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["pendingSignups"] });
      void queryClient.invalidateQueries({ queryKey: ["crews"] });
      void queryClient.invalidateQueries({ queryKey: ["leaders"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Staff profile
--------------------------------------------------------------------------- */

/**
 * Store the caller's staff profile on their pending access request. Used by the
 * post-sign-in profile form before an Admin approves the caller. The backend
 * traps when the caller has no pending request, so callers only invoke this
 * while the access state is pending.
 */
export function useSubmitStaffProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: StaffProfile) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitStaffProfile(profile);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myAccess"] });
      void queryClient.invalidateQueries({ queryKey: ["pendingUsers"] });
    },
  });
}

/**
 * Update the caller's own staff profile on their access grant. Existing users
 * approved before profiles existed use this to fill theirs in without losing
 * access. The backend traps when the caller has no grant.
 */
export function useUpdateMyStaffProfile() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: StaffProfile) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateMyStaffProfile(profile);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["myAccess"] });
      void queryClient.invalidateQueries({ queryKey: ["accessGrants"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Store & schedule
--------------------------------------------------------------------------- */

export function useStoreInfo() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["storeInfo"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getStoreInfo();
    },
    enabled: !!actor && !isFetching,
  });
}

/** The store's two uploaded logos, each absent when not set. */
export interface StoreLogoPair {
  logo: PhotoRef | null;
  secondaryLogo: PhotoRef | null;
}

const NO_STORE_LOGOS: StoreLogoPair = { logo: null, secondaryLogo: null };

/** Coerce one optional logo field to `PhotoRef | null`. */
function toPhotoRef(value: unknown): PhotoRef | null {
  return value instanceof Uint8Array ? value : null;
}

/**
 * Normalize the public `getStoreLogo` result. The current binding returns a
 * `StoreLogos` record with both logos; an older actor (or a test mock) may
 * return a bare `PhotoRef` for the main logo, which is treated as `logo` with
 * no secondary logo.
 */
function normalizeStoreLogos(value: unknown): StoreLogoPair {
  if (value instanceof Uint8Array) {
    return { logo: value, secondaryLogo: null };
  }
  if (typeof value === "object" && value !== null) {
    const record = value as StoreLogos;
    return {
      logo: toPhotoRef(record.logo),
      secondaryLogo: toPhotoRef(record.secondaryLogo),
    };
  }
  return NO_STORE_LOGOS;
}

/**
 * The store's uploaded logo bytes, read from the public `getStoreLogo`
 * endpoint. Both the main logo and the secondary logo are exposed so callers
 * can render either. The bytes never change for a given store, so the read is
 * cached indefinitely. Older actors (and test mocks) may not expose
 * `getStoreLogo`; the hook then resolves to both logos absent so callers fall
 * back to the built-in star instead of surfacing an error.
 */
export function useStoreLogo() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["storeLogo"],
    queryFn: async (): Promise<StoreLogoPair> => {
      if (!actor) return NO_STORE_LOGOS;
      const readLogo = readOptionalStoreLogo(actor);
      if (!readLogo) return NO_STORE_LOGOS;
      return normalizeStoreLogos(await readLogo());
    },
    enabled: !!actor && !isFetching,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Narrow an actor to its optional `getStoreLogo` read. The generated bindings
 * do not declare the method, so it is looked up structurally and only invoked
 * when the running actor actually exposes it.
 */
function readOptionalStoreLogo(
  actor: unknown,
): (() => Promise<unknown>) | null {
  if (typeof actor !== "object" || actor === null) return null;
  const candidate = (actor as { getStoreLogo?: unknown }).getStoreLogo;
  if (typeof candidate !== "function") return null;
  return () => (candidate as () => Promise<unknown>).call(actor);
}

export function usePositions() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPositions();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSchedule() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listSchedule();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useUpdateStoreInfo() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (info: StoreInfo) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateStoreInfo(info);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["storeInfo"] });
      void queryClient.invalidateQueries({ queryKey: ["storeLogo"] });
    },
  });
}

export function useCreatePosition() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: Position) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createPosition(position);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdatePosition() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: Position) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updatePosition(position);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePosition() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: PositionId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deletePosition(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateScheduleEvent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: ScheduleEvent) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createScheduleEvent(event);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function useUpdateScheduleEvent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: ScheduleEvent) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateScheduleEvent(event);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function useDeleteScheduleEvent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: EventId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteScheduleEvent(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function useChecklists() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["checklists"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getChecklists();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useUpdateChecklists() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: Checklists) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateChecklists(value);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
}

export function useRetentionSettings() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["retentionSettings"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getRetentionSettings();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useUpdateRetentionSettings() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: RetentionSettings) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateRetentionSettings(settings);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["retentionSettings"] });
    },
  });
}

export function useSaveStoreTemplate() {
  const { actor } = useActor(createActor);
  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.saveStoreTemplate(name);
    },
  });
}

/**
 * Download the current store configuration as a template file. This is a
 * mutation rather than a query so the build runs only when an Admin taps
 * Download, never on page load. The caller passes the returned file to the
 * download handler.
 */
export function useDownloadStoreTemplate() {
  const { actor } = useActor(createActor);
  return useMutation({
    mutationFn: async (): Promise<StoreTemplateFile> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.downloadStoreTemplate();
    },
  });
}

/**
 * Load a store template file (Admin only). The backend validates the file and
 * refuses once any roadie exists; on success it replaces positions, schedule
 * and checklists, so the affected reads are invalidated.
 */
export function useLoadStoreTemplate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: StoreTemplateFile) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.loadStoreTemplate(file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["checklists"] });
      void queryClient.invalidateQueries({ queryKey: ["storeInfo"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Roadies
--------------------------------------------------------------------------- */

export function useRoadies() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["roadies"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRoadies();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useRoadie(id: RoadieId | undefined) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["roadie", id?.toString()],
    queryFn: async () => {
      if (!actor || id === undefined) return null;
      return actor.getRoadie(id);
    },
    enabled: !!actor && !isFetching && id !== undefined,
  });
}

/**
 * A roadie's photo bytes, read on demand. `listRoadies` and
 * `listPendingSignups` no longer carry full photo bytes, so the roster list and
 * the roadie card fetch the photo by id instead. React Query caches the result
 * under the roadie id, and the bytes never change for a given id, so a
 * re-render or a revisit reuses the cached read rather than re-fetching.
 */
export function useRoadiePhoto(id: RoadieId | undefined) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["roadiePhoto", id?.toString()],
    queryFn: async () => {
      if (!actor || id === undefined) return null;
      return actor.getPhoto(id);
    },
    enabled: !!actor && !isFetching && id !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The leaders roster: managers, trainers and market partners with their staff
 * profile, title and travel dates. Readable by every role except Kiosk and
 * Integration, so callers pass `enabled` (typically `canLeaders(role)`) to
 * avoid a trapping read for those roles.
 */
export function useLeaders(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["leaders"],
    queryFn: async (): Promise<LeaderSummary[]> => {
      if (!actor) return [];
      return actor.listLeaders();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

export function useCrews() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["crews"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listCrews();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The crews with their pending + active roadie count, for the crew screens.
 * Readable by every read role, so no `enabled` gate is needed.
 */
export function useCrewSummaries() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["crewSummaries"],
    queryFn: async (): Promise<CrewSummary[]> => {
      if (!actor) return [];
      return actor.listCrewSummaries();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The crew the caller owns, with its roadies (photo, name, position, roster
 * state, paperwork done/total, absentToday, paperworkOverdue). Null when the
 * caller owns no crew. Readable by every signed-in caller, so no `enabled`
 * gate is needed.
 */
export function useMyCrew() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myCrew"],
    queryFn: async (): Promise<MyCrewView | null> => {
      if (!actor) return null;
      return actor.getMyCrew();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Create a crew with its owner (Admin/Store Manager only). The backend returns
 * the new crew id; the crews list is invalidated so the new row appears.
 */
export function useCreateCrew() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; leaderPrincipal: Principal }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createCrew(args.name, args.leaderPrincipal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crews"] });
      void queryClient.invalidateQueries({ queryKey: ["crewSummaries"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Rename a crew and/or change its leader (Admin/Store Manager only). Both
 * fields save through the same update, so the crews list is invalidated once.
 */
export function useUpdateCrew() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: CrewId;
      name: string;
      leaderPrincipal: Principal | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateCrew(args.id, args.name, args.leaderPrincipal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crews"] });
      void queryClient.invalidateQueries({ queryKey: ["crewSummaries"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Delete a crew (Admin/Store Manager only). The backend refuses while any
 * roadie is assigned to the crew, so the caller surfaces that error.
 */
export function useDeleteCrew() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: CrewId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteCrew(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crews"] });
      void queryClient.invalidateQueries({ queryKey: ["crewSummaries"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Dashboard & export
--------------------------------------------------------------------------- */

export function useDashboard() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getDashboard();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Per-position roster counts: on-hand roadies and open spots. The backend
 * derives both from the position's build-to target, so the dashboard panels
 * read on-hand and open spots from this summary rather than recounting.
 */
export function useRosterSummary() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["rosterSummary"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getRosterSummary();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useShareableExport() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["export", "shareable"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.buildShareableExport();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The Full export, including contact details. This is a mutation rather than a
 * query so the expensive build runs only when an Admin or Store Manager taps
 * Download, never on page load. The caller invokes `mutateAsync()` from the
 * download handler and passes the returned data to the workbook builder.
 */
export function useFullExport() {
  const { actor } = useActor(createActor);
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.buildFullExport();
    },
  });
}

/* ---------------------------------------------------------------------------
   Orientation
--------------------------------------------------------------------------- */

/**
 * The orientation check-in view for one session: assigned roadies with photo,
 * name, position, crew and paperwork status, plus Present x / y counts.
 * Readable by Admin, Store Manager, Training Manager and Visiting Manager, so
 * callers pass `enabled` (typically `canOrientation(role)`) to avoid a trapping
 * read for other roles.
 */
export function useOrientationSessionView(
  eventId: EventId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orientationSession", eventId?.toString()],
    queryFn: async (): Promise<OrientationSessionView | null> => {
      if (!actor || eventId === undefined) return null;
      return actor.getOrientationSessionView(eventId);
    },
    enabled: enabled && !!actor && !isFetching && eventId !== undefined,
  });
}

/**
 * Mark a roadie Present at an orientation session (Admin/Store Manager only).
 * Idempotent on the backend, so concurrent managers converge. Invalidates the
 * session view, the dashboard and the roster summary so the counts refresh.
 */
export function useMarkPresent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      roadieId: RoadieId;
      eventId: EventId;
      overrideReason?: string | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markPresent(
        args.roadieId,
        args.eventId,
        args.overrideReason ?? null,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Undo a roadie's Present mark at an orientation session (Admin/Store Manager
 * only). Invalidates the same reads as marking Present.
 */
export function useUndoPresent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roadieId: RoadieId; eventId: EventId }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.undoPresent(args.roadieId, args.eventId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Move a roadie to another orientation session (Admin/Store Manager only).
 * Invalidates both the source and target session views plus the roster.
 */
export function useMoveRoadieToSession() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roadieId: RoadieId; eventId: EventId }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.moveRoadieToSession(args.roadieId, args.eventId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({
        queryKey: ["unassignedPendingRoadies"],
      });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * The orientation sessions as lightweight options (id, name, start, end),
 * soonest first. Readable by orientation staff, so callers pass `enabled`
 * (typically `canOrientation(role)`) to avoid a trapping read for other roles.
 */
export function useOrientationSessions(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orientationSessions"],
    queryFn: async (): Promise<OrientationSessionOption[]> => {
      if (!actor) return [];
      return actor.listOrientationSessions();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Pending roadies with no valid orientation session, each with name, position
 * and crew. Readable by orientation staff, so callers pass `enabled` (typically
 * `canOrientation(role)`) to avoid a trapping read for other roles.
 */
export function useUnassignedPendingRoadies(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["unassignedPendingRoadies"],
    queryFn: async (): Promise<UnassignedRoadieRow[]> => {
      if (!actor) return [];
      return actor.listUnassignedPendingRoadies();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Assign every unassigned pending roadie to a session (Admin/Store Manager
 * only). Returns the number moved. Invalidates the unassigned list, the session
 * views, the roster and the dashboard so every surface reflects the move.
 */
export function useMoveAllRoadiesToSession() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      fromEventId: EventId;
      toEventId: EventId;
    }): Promise<bigint> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.moveAllRoadiesToSession(args.fromEventId, args.toEventId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["unassignedPendingRoadies"],
      });
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Archive every no-show at a session as NCNS Orientation (Admin/Store Manager
 * only). Returns the archived roadie ids. Invalidates the session view, the
 * roster and the dashboard so the archived roadies drop out of the counts.
 */
export function useArchiveNoShows() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: EventId): Promise<RoadieId[]> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.archiveNoShows(eventId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * The uniform check-off for a roadie: the required items with their checked
 * state and counts, plus whether the check-off is complete. Readable by Admin
 * and Store Manager only, so callers pass `enabled` to avoid a trapping read.
 */
export function useUniformCheckoff(
  roadieId: RoadieId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["uniformCheckoff", roadieId?.toString()],
    queryFn: async (): Promise<UniformCheckoffView | null> => {
      if (!actor || roadieId === undefined) return null;
      return actor.getUniformCheckoff(roadieId);
    },
    enabled: enabled && !!actor && !isFetching && roadieId !== undefined,
  });
}

/**
 * A roadie's orientation check-off: the stored paperwork items and uniform
 * fields. Readable by Admin and Store Manager only, so callers pass `enabled`
 * to avoid a trapping read for other roles.
 */
export function useOrientationCheckoff(
  roadieId: RoadieId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orientationCheckoff", roadieId?.toString()],
    queryFn: async () => {
      if (!actor || roadieId === undefined) return null;
      return actor.getOrientationCheckoff(roadieId);
    },
    enabled: enabled && !!actor && !isFetching && roadieId !== undefined,
  });
}

/**
 * Save the uniform check-off for a roadie (Admin/Store Manager only). Writes
 * only the uniform fields, so the roadie's paperwork items are preserved.
 * Invalidates the check-off read plus the roster tile, the orientation list and
 * the alerts so every surface reflects the save.
 */
export function useSaveUniformCheckoff() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      roadieId: RoadieId;
      uniformItems: string[];
      uniformCounts: Array<[bigint, bigint]>;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.saveUniformCheckoff(
        args.roadieId,
        args.uniformItems,
        args.uniformCounts,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["uniformCheckoff"] });
      void queryClient.invalidateQueries({ queryKey: ["orientationCheckoff"] });
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Set a roadie's paperwork items (Admin/Store Manager only). Writes only the
 * paperwork items, so the uniform fields are preserved. Invalidates the
 * check-off read plus the roster tile, the orientation list and the alerts so
 * every surface reflects the save.
 */
export function useSetPaperworkItems() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      roadieId: RoadieId;
      paperworkItems: string[];
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setPaperworkItems(args.roadieId, args.paperworkItems);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orientationCheckoff"] });
      void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Paperwork dates, paid dates, pay setup & check-in
--------------------------------------------------------------------------- */

/**
 * Invalidate every surface that shows a roadie's paperwork, pay or check-in
 * state: the check-off read, the roster tiles, the orientation list, My crew,
 * the dashboard, the roster summary, the alerts and the change log.
 */
function invalidateRoadieWrites(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["orientationCheckoff"] });
  void queryClient.invalidateQueries({ queryKey: ["orientationSession"] });
  void queryClient.invalidateQueries({ queryKey: ["roadies"] });
  void queryClient.invalidateQueries({ queryKey: ["roadie"] });
  void queryClient.invalidateQueries({ queryKey: ["myCrew"] });
  void queryClient.invalidateQueries({ queryKey: ["today"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
  void queryClient.invalidateQueries({ queryKey: ["alerts"] });
  void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
}

/**
 * Set or clear the ticked date of one paperwork item (Admin/Store Manager
 * only). The item must already be ticked; clearing the date keeps it ticked.
 */
export function useSetPaperworkItemDate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      roadieId: RoadieId;
      itemId: string;
      date: DateOnly | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setPaperworkItemDate(args.roadieId, args.itemId, args.date);
    },
    onSuccess: () => invalidateRoadieWrites(queryClient),
  });
}

/**
 * Set or clear the manager-only paid date for the Digital Paperwork, Policies &
 * Procedures or Alcohol Certificate item (Admin/Store Manager only).
 */
export function useSetPaperworkPaidDate() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      roadieId: RoadieId;
      itemId: string;
      date: DateOnly | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setPaperworkPaidDate(args.roadieId, args.itemId, args.date);
    },
    onSuccess: () => invalidateRoadieWrites(queryClient),
  });
}

/**
 * Set the pay setup choice to Direct deposit, Pay card or Not set (Admin/Store
 * Manager only). Only the choice is stored.
 */
export function useSetPaySetup() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roadieId: RoadieId; paySetup: PaySetup }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setPaySetup(args.roadieId, args.paySetup);
    },
    onSuccess: () => invalidateRoadieWrites(queryClient),
  });
}

/**
 * Check a roadie in for this week, saving the current store-local date and time
 * to their weekly check-in list. Managers may check in any roadie; a crew
 * leader only roadies in their own crew.
 */
export function useCheckInRoadie() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roadieId: RoadieId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.checkInRoadie(roadieId);
    },
    onSuccess: () => invalidateRoadieWrites(queryClient),
  });
}

/* ---------------------------------------------------------------------------
   Coverage
--------------------------------------------------------------------------- */

/**
 * The read-only shift coverage view: per position, the 14 shifts in Wed AM …
 * Tue PM order with Needed, Available and Covered counts, plus the weekly
 * totals, short shifts, still-to-hire and the FOH and BOH totals. Manager roles
 * only, so callers pass `enabled` (typically `canCoverage(role)`) to avoid a
 * trapping read for other roles.
 */
export function useCoverage(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["coverage"],
    queryFn: async (): Promise<CoverageView | null> => {
      if (!actor) return null;
      return actor.getCoverage();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Save a position's weekday lunch par and shifts-to-cover grid (Admin only).
 * The whole position is written through `updatePosition`, so the caller passes
 * the position it edited. Invalidates the positions, the coverage view and the
 * dashboard so the Coverage tab and the Dashboard card refresh.
 */
export function useSavePositionCoverage() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: Position) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updatePosition(position);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["coverage"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Uniforms
--------------------------------------------------------------------------- */

/**
 * The uniform settings: the shirt and hat size curve plus the buffer percent
 * applied to the projected order. Readable by Admin, Store Manager and Training
 * Manager, so callers pass `enabled` (typically `canUniforms(role)`) to avoid a
 * trapping read for other roles.
 */
export function useUniformSettings(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["uniformSettings"],
    queryFn: async (): Promise<UniformSettings | null> => {
      if (!actor) return null;
      return actor.getUniformSettings();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Save the uniform settings (Admin/Store Manager only). The backend guards the
 * write with requireRealSettingsManager, so it traps while demo mode is on. The
 * settings and the derived order are invalidated so both refresh.
 */
export function useUpdateUniformSettings() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: UniformSettings) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateUniformSettings(settings);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["uniformSettings"] });
      void queryClient.invalidateQueries({ queryKey: ["uniformOrder"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * The uniform order for one house filter: per-item size rows with hired,
 * projected and order totals, the size-unknown roadies and the buffer percent
 * used. Readable by Admin, Store Manager and Training Manager, so callers pass
 * `enabled` (typically `canUniforms(role)`) to avoid a trapping read.
 */
export function useUniformOrder(filter: UniformHouseFilter, enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["uniformOrder", filter],
    queryFn: async (): Promise<UniformOrderView | null> => {
      if (!actor) return null;
      return actor.getUniformOrder(filter);
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/* ---------------------------------------------------------------------------
   Groups & shift boards
--------------------------------------------------------------------------- */

/**
 * One shift board with its trainer columns, Unassigned tray and Off this shift
 * tray. Readable by every read role except Kiosk and Integration, so callers
 * pass `enabled` (typically `canGroups(role)`) to avoid a trapping read for
 * those roles.
 */
export function useShiftBoard(
  eventId: EventId | undefined,
  shift: Shift | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["shiftBoard", eventId?.toString(), shift],
    queryFn: async (): Promise<ShiftBoardView | null> => {
      if (!actor || eventId === undefined || shift === undefined) return null;
      return actor.getShiftBoard(eventId, shift);
    },
    enabled:
      enabled &&
      !!actor &&
      !isFetching &&
      eventId !== undefined &&
      shift !== undefined,
  });
}

/**
 * Replace one shift board's groups, capacities and Off list (Admin, Store
 * Manager or Training Manager). Invalidates the board, the board list and the
 * caller's own group so every surface reflects the save.
 */
export function useSaveShiftBoard() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (board: ShiftBoard) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.saveShiftBoard(board);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["groupChangeNotices"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Copy another shift's groups, capacities and Off list onto this shift (Admin,
 * Store Manager or Training Manager). Invalidates the affected boards.
 */
export function useCopyShiftBoard() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      eventId: EventId;
      shift: Shift;
      fromEventId: EventId;
      fromShift: Shift;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.copyShiftBoard(
        args.eventId,
        args.shift,
        args.fromEventId,
        args.fromShift,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["groupChangeNotices"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Fill a shift board's groups automatically from the unassigned roadies
 * (Admin, Store Manager or Training Manager). Invalidates the affected boards.
 */
export function useAutoFillShiftBoard() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { eventId: EventId; shift: Shift }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.autoFillShiftBoard(args.eventId, args.shift);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["groupChangeNotices"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Clear one shift board's groups and Off list (Admin, Store Manager or Training
 * Manager). Invalidates the affected boards.
 */
export function useClearShiftBoard() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { eventId: EventId; shift: Shift }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.clearShiftBoard(args.eventId, args.shift);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["groupChangeNotices"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * The caller's own "Your group changed" notices, newest first. Readable by any
 * signed-in caller, so no `enabled` gate is needed.
 */
export function useGroupChangeNotices() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["groupChangeNotices"],
    queryFn: async (): Promise<GroupChangeNotice[]> => {
      if (!actor) return [];
      return actor.listGroupChangeNotices();
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * Dismiss one "Your group changed" notice. Invalidates the notices list so the
 * dismissed card drops out.
 */
export function useDismissGroupChangeNotice() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.dismissGroupChangeNotice(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groupChangeNotices"] });
    },
  });
}

/**
 * The caller's own group for the current or next shift, for the Today screen.
 * Null when the caller trains no group on that shift.
 */
export function useMyGroup() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["myGroup"],
    queryFn: async (): Promise<MyGroupView | null> => {
      if (!actor) return null;
      return actor.getMyGroup();
    },
    enabled: !!actor && !isFetching,
  });
}

/* ---------------------------------------------------------------------------
   Today & trainer check-in
--------------------------------------------------------------------------- */

/**
 * The whole Today view for the caller: the role, the current shift's check-in
 * board, the next event, the per-shift check-in summaries, the caller's own
 * group and the absent alerts. Readable by every signed-in role, so no
 * `enabled` gate is needed. Polls so a check-in recorded on another device
 * appears without a manual reload.
 */
export function useToday() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["today"],
    queryFn: async (): Promise<TodayView | null> => {
      if (!actor) return null;
      return actor.getToday();
    },
    enabled: !!actor && !isFetching,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * One shift's check-in board: the assigned roadies with their check-in state,
 * the present-of-total count and whether the board is locked. Readable by
 * check-in roles, so callers pass `enabled` (typically `canCheckIn(role)`) to
 * avoid a trapping read for other roles.
 */
export function useCheckInBoard(
  eventId: EventId | undefined,
  shift: Shift | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["checkInBoard", eventId?.toString(), shift],
    queryFn: async (): Promise<CheckInBoardView | null> => {
      if (!actor || eventId === undefined || shift === undefined) return null;
      return actor.getCheckInBoard(eventId, shift);
    },
    enabled:
      enabled &&
      !!actor &&
      !isFetching &&
      eventId !== undefined &&
      shift !== undefined,
  });
}

/**
 * Record a roadie's check-in state on a shift (check-in roles only). The
 * backend is idempotent per roadie and shift, so a repeat converges. Invalidates
 * the Today view, the check-in board and the dashboard so every surface
 * reflects the change.
 */
export function useRecordCheckIn() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      eventId: EventId;
      shift: Shift;
      roadieId: RoadieId;
      state: CheckInState;
      lateAt?: Timestamp | null;
      excused?: string | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.recordCheckIn(
        args.eventId,
        args.shift,
        args.roadieId,
        args.state,
        args.lateAt ?? null,
        args.excused ?? null,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["checkInBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["absentAlerts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * The absent alerts list: roadies who did not show for a shift, with their
 * name, photo, phone and excused reason. Readable by alert roles, so callers
 * pass `enabled` (typically `canSeeAbsentAlerts(role)`) to avoid a trapping
 * read for other roles.
 */
export function useAbsentAlerts(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["absentAlerts"],
    queryFn: async (): Promise<AbsentAlertView[]> => {
      if (!actor) return [];
      return actor.listAbsentAlerts();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Acknowledge a stored alert so it drops out of the Dashboard alerts box
 * (Admin and Store Manager only). Invalidates the alerts list so the box
 * refreshes without a page reload.
 */
export function useAcknowledgeAlert() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: AlertId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.acknowledgeAlert(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

/**
 * Excuse an absent alert with a reason (alert roles only). Invalidates the
 * alerts list and the Today view so the excused state appears.
 */
export function useExcuseAbsentAlert() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: AlertId; reason: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.excuseAbsentAlert(args.id, args.reason);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["absentAlerts"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Archive an absent alert (alert roles only). Invalidates the alerts list, the
 * Today view, the roster and the dashboard so the archived roadie drops out of
 * the counts.
 */
export function useArchiveAbsentAlert() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: AlertId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.archiveAbsentAlert(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["absentAlerts"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Move an absent roadie to the other shift of the same day (alert roles only).
 * Invalidates the alerts list, the Today view and the affected check-in boards
 * so the move appears everywhere.
 */
export function useMoveAbsentRoadieToOtherShift() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: AlertId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.moveAbsentRoadieToOtherShift(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["absentAlerts"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["checkInBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Opening Questions
--------------------------------------------------------------------------- */

/** The query keys an Opening Questions write invalidates. */
const OPENING_QUESTION_KEYS = [
  "openingQuestions",
  "openingQuestionsProgress",
  "openingQuestionsMyPendingApprovals",
  "openingQuestionAlerts",
  "openingQuestionEmailSettings",
  "openingQuestionDailyEmailStatus",
  "openingQuestionScoreboard",
  "openingQuestionFinishBy",
  "openingQuestionNudges",
  "openingQuestionDiscussion",
  "today",
  "changeLog",
] as const;

function invalidateOpeningQuestions(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  for (const key of OPENING_QUESTION_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * The Opening Questions list for a tab and filter. Readable by the roles that
 * may read the section, so callers pass `enabled` (typically
 * `canOpeningQuestions(role)`) to avoid a trapping read for other roles.
 */
export function useOpeningQuestions(
  tab: QuestionTab,
  filter: QuestionFilter,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      "openingQuestions",
      tab,
      filter.area,
      filter.sectionTitle,
      filter.search,
    ],
    queryFn: async (): Promise<QuestionView[]> => {
      if (!actor) return [];
      return actor.listOpeningQuestions(tab, filter);
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/** The Opening Questions progress summary (final / answered / total by section). */
export function useOpeningQuestionsProgress(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionsProgress"],
    queryFn: async (): Promise<ProgressSummary | null> => {
      if (!actor) return null;
      return actor.getOpeningQuestionsProgress();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * The caller's own pending-approval count: questions they own that they have
 * not approved and that are not Final. Drives the Needs my approval tab badge.
 */
export function useMyPendingOpeningQuestionApprovals(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionsMyPendingApprovals"],
    queryFn: async (): Promise<bigint> => {
      if (!actor) return 0n;
      return actor.getMyPendingOpeningQuestionApprovals();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * The Managers scoreboard: one row per current question owner with owned,
 * approved and still-needing counts, sorted by most still needing approval
 * first. Readable only by the Managing Partner and Admins, so callers pass
 * `enabled` to avoid a trapping read for every other role.
 */
export function useOpeningQuestionManagerScoreboard(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionScoreboard"],
    queryFn: async (): Promise<ManagerScoreRow[]> => {
      if (!actor) return [];
      return actor.getOpeningQuestionManagerScoreboard();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * One question's change history, newest first. Readable only by the Managing
 * Partner and Admins, so callers pass `enabled` to avoid a trapping read for
 * every other role.
 */
export function useOpeningQuestionHistory(
  id: QuestionId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionHistory", id?.toString()],
    queryFn: async (): Promise<QuestionHistoryEntry[]> => {
      if (!actor || id === undefined) return [];
      return actor.getOpeningQuestionHistory(id);
    },
    enabled: enabled && id !== undefined && !!actor && !isFetching,
  });
}

/**
 * One question's discussion (suggestions and comments), loaded only while its
 * card is open. The list carries counts instead of every comment and reply, so
 * this read is what fills the discussion block.
 */
export function useOpeningQuestionDiscussion(
  id: QuestionId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionDiscussion", id?.toString()],
    queryFn: async (): Promise<QuestionDiscussion | null> => {
      if (!actor || id === undefined) return null;
      return actor.getOpeningQuestionDiscussion(id);
    },
    enabled: enabled && id !== undefined && !!actor && !isFetching,
  });
}

/** The Opening Questions alert counts for the nav badge and the Today card. */
export function useOpeningQuestionAlerts(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionAlerts"],
    queryFn: async (): Promise<AlertSummary | null> => {
      if (!actor) return null;
      return actor.getOpeningQuestionAlerts();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/** The daily email settings (Admin only). */
export function useOpeningQuestionEmailSettings(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionEmailSettings"],
    queryFn: async (): Promise<EmailSettings | null> => {
      if (!actor) return null;
      return actor.getOpeningQuestionEmailSettings();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * When the last daily email went out and to how many people (Admin and
 * Managing Partner only). `lastSentAt` is absent when none has gone out yet.
 */
export function useOpeningQuestionDailyEmailStatus(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionDailyEmailStatus"],
    queryFn: async (): Promise<DailyEmailStatus | null> => {
      if (!actor) return null;
      return actor.getOpeningQuestionDailyEmailStatus();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/** Save a question's answer (owners and Admin). Resets approvals on change. */
export function useSaveOpeningQuestionAnswer() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: QuestionId; answer: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.saveOpeningQuestionAnswer(args.id, args.answer);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/**
 * Approve a question as the caller (owners only).
 *
 * `keepListInPlace` skips refetching the question lists so an approved card
 * stays visible on the Needs my approval tab (with its "You approved" chip)
 * until the person switches tabs or refreshes. The progress, alert, pending
 * count and change log reads still refresh.
 */
export function useApproveOpeningQuestion(keepListInPlace = false) {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: QuestionId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveOpeningQuestion(id);
    },
    onSuccess: () => {
      if (keepListInPlace) {
        for (const key of OPENING_QUESTION_KEYS) {
          if (key === "openingQuestions") continue;
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
        return;
      }
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Withdraw the caller's own approval. */
export function useWithdrawOpeningQuestionApproval() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: QuestionId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.withdrawOpeningQuestionApproval(id);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Mark a question final (Admin only). */
export function useMarkOpeningQuestionFinal() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: QuestionId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markOpeningQuestionFinal(id);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/**
 * Mark several questions final at once (Managing Partner only). Returns how
 * many were marked and how many were skipped because they were no longer ready.
 * Every Opening Questions read is invalidated so the Final and Ready for final
 * counts, the scoreboard and the lists refresh without a reload.
 */
export function useMarkOpeningQuestionsFinal() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: QuestionId[]): Promise<BatchFinalResult> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markOpeningQuestionsFinal(ids);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Reopen a finalized question (Admin only). */
export function useReopenOpeningQuestion() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: QuestionId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.reopenOpeningQuestion(id);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Post a suggestion on a question (read/comment/suggest roles). */
export function usePostOpeningQuestionSuggestion() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: QuestionId;
      proposedAnswer: string;
      note: string;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.postOpeningQuestionSuggestion(
        args.id,
        args.proposedAnswer,
        args.note,
      );
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Reply to a suggestion during its 48-hour discussion window. */
export function useReplyToOpeningQuestionSuggestion() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: QuestionId;
      suggestionId: SuggestionId;
      text: string;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.replyToOpeningQuestionSuggestion(
        args.id,
        args.suggestionId,
        args.text,
      );
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Post a plain comment on a question. */
export function usePostOpeningQuestionComment() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: QuestionId; text: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.postOpeningQuestionComment(args.id, args.text);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Accept or decline a suggestion (Admin only). */
export function useDecideOpeningQuestionSuggestion() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: QuestionId;
      suggestionId: SuggestionId;
      accept: boolean;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.decideOpeningQuestionSuggestion(
        args.id,
        args.suggestionId,
        args.accept,
      );
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Import a JSON question file with preview and validation (Admin only). */
export function useImportOpeningQuestions() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: ImportFile): Promise<ImportValidation> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.importOpeningQuestions(file);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/** Clear every question, confirmed by typing CLEAR (Admin only). */
export function useClearOpeningQuestions() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirm: string) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.clearOpeningQuestions(confirm);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/**
 * The Opening Questions Finish-by date: the set date (if any) plus the days
 * left before it or the days overdue after it, computed on the backend against
 * the store clock. Readable by the roles that may read the section, so callers
 * pass `enabled` to avoid a trapping read for other roles.
 */
export function useOpeningQuestionFinishBy(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionFinishBy"],
    queryFn: async (): Promise<FinishByView | null> => {
      if (!actor) return null;
      return actor.getOpeningQuestionFinishBy();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Set or clear the Finish-by date (Managing Partner and Admin only). Null
 * clears it. Every Opening Questions read is invalidated so the banner, the
 * scoreboard and Today refresh without a reload.
 */
export function useSetOpeningQuestionFinishBy() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (finishBy: DateOnly | null) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setOpeningQuestionFinishBy(finishBy);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/**
 * The caller's own Opening Questions nudge alerts, newest first: each names the
 * sender and how many of the caller's questions are still waiting on them.
 * Readable by any signed-in caller, so no `enabled` gate is needed.
 */
export function useMyOpeningQuestionNudges(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["openingQuestionNudges"],
    queryFn: async (): Promise<NudgeAlert[]> => {
      if (!actor) return [];
      return actor.getMyOpeningQuestionNudges();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Send a nudge to a manager with pending questions (Managing Partner and Admin
 * only, enforced in the backend). One nudge per manager per day. Invalidates
 * the scoreboard, the caller's own nudge alerts and Today so the "Nudged today"
 * state and the recipient's alert appear without a reload.
 */
export function useSendOpeningQuestionNudge() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (manager: Principal) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.sendOpeningQuestionNudge(manager);
    },
    onSuccess: () => {
      invalidateOpeningQuestions(queryClient);
    },
  });
}

/**
 * Send the caller a test of the daily email right now (Admin and Managing
 * Partner only, enforced in the backend). Refreshes the last-send status so the
 * status line reflects the test send.
 */
export function useSendOpeningQuestionTestEmail() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.sendOpeningQuestionTestEmail();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["openingQuestionDailyEmailStatus"],
      });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/** Toggle the daily 7 AM email (Admin only). */
export function useUpdateOpeningQuestionEmailSettings() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: EmailSettings) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateOpeningQuestionEmailSettings(settings);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["openingQuestionEmailSettings"],
      });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Trainer notes
--------------------------------------------------------------------------- */

/**
 * A roadie's trainer notes, newest first, each with the author's display name.
 * Restricted the same way roadies are: Integration sees nothing and a trainer
 * sees notes only for roadies in their assigned stations, so callers pass
 * `enabled` (typically `canReadTrainerNotes(role)`) to avoid a trapping read.
 */
export function useTrainerNotes(
  roadieId: RoadieId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["trainerNotes", roadieId?.toString()],
    queryFn: async (): Promise<TrainerNoteView[]> => {
      if (!actor || roadieId === undefined) return [];
      return actor.listTrainerNotes(roadieId);
    },
    enabled: enabled && !!actor && !isFetching && roadieId !== undefined,
  });
}

/**
 * Add a trainer note (Trainer, Training Manager, Kitchen Manager, Service
 * Manager, Store Manager, Managing Partner or Admin). Refreshes the roadie's
 * note list so the new note appears without a reload.
 */
export function useAddTrainerNote() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: TrainerNote) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.addTrainerNote(note);
    },
    onSuccess: (_id, note) => {
      void queryClient.invalidateQueries({
        queryKey: ["trainerNotes", note.roadieId.toString()],
      });
    },
  });
}

/**
 * Edit a trainer note within its 24-hour lock window (author only). Refreshes
 * the roadie's note list so the edited text appears without a reload.
 */
export function useUpdateTrainerNote() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: TrainerNote) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateTrainerNote(note);
    },
    onSuccess: (_result, note) => {
      void queryClient.invalidateQueries({
        queryKey: ["trainerNotes", note.roadieId.toString()],
      });
    },
  });
}

/* ---------------------------------------------------------------------------
   Final trainer sign-off
--------------------------------------------------------------------------- */

/**
 * A roadie's current final sign-off, with the signer's display name, or null
 * when they have none. Readable by every role that can read the roadie, so
 * callers pass `enabled` (typically `canReadTrainerNotes(role)`) to avoid a
 * trapping read for Kiosk and Integration.
 */
export function useFinalSignOff(
  roadieId: RoadieId | undefined,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["finalSignOff", roadieId?.toString()],
    queryFn: async (): Promise<FinalSignOffView | null> => {
      if (!actor || roadieId === undefined) return null;
      return actor.getFinalSignOff(roadieId);
    },
    enabled: enabled && !!actor && !isFetching && roadieId !== undefined,
  });
}

/**
 * Record or replace a roadie's final sign-off (Trainer limited to their own
 * stations, Training Manager, Kitchen Manager, Service Manager, Store Manager,
 * Managing Partner or Admin). Refreshes the sign-off, the roadie, the
 * dashboard, the group and crew views, the shift boards, the roster summary,
 * Today and the change log so every stage tag follows the sign-off.
 */
export function useRecordFinalSignOff() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (signOff: FinalSignOff) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.recordFinalSignOff(signOff);
    },
    onSuccess: (_result, signOff) => {
      const roadieId = signOff.roadieId.toString();
      void queryClient.invalidateQueries({
        queryKey: ["finalSignOff", roadieId],
      });
      void queryClient.invalidateQueries({ queryKey: ["roadie", roadieId] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["myCrew"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Clear a roadie's final sign-off (Admin, Managing Partner or Store Manager),
 * restoring the roadie to Active. Refreshes the sign-off, the roadie, the
 * dashboard, the group and crew views, the shift boards, the roster summary,
 * Today and the change log so every stage tag follows the clear.
 */
export function useClearFinalSignOff() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roadieId: RoadieId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.clearFinalSignOff(roadieId);
    },
    onSuccess: (_result, roadieId) => {
      const id = roadieId.toString();
      void queryClient.invalidateQueries({ queryKey: ["finalSignOff", id] });
      void queryClient.invalidateQueries({ queryKey: ["roadie", id] });
      void queryClient.invalidateQueries({ queryKey: ["roadies"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["myGroup"] });
      void queryClient.invalidateQueries({ queryKey: ["myCrew"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoard"] });
      void queryClient.invalidateQueries({ queryKey: ["shiftBoards"] });
      void queryClient.invalidateQueries({ queryKey: ["rosterSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Leader talks
--------------------------------------------------------------------------- */

/**
 * Every leader talk in the current demo partition, sorted by day then id, each
 * with its attendees' id and display name. Readable by Admin, Managing Partner,
 * Store Manager, Training Manager, Kitchen Manager, Service Manager, Leadership
 * and Visiting Manager, so callers pass `enabled` (typically
 * `canLeaderTalks(role)`) to avoid a trapping read for Trainer, Kiosk and
 * Integration.
 */
export function useLeaderTalks(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["leaderTalks"],
    queryFn: async (): Promise<LeaderTalkView[]> => {
      if (!actor) return [];
      return actor.listLeaderTalks();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Create a leader talk (Admin, Managing Partner, Store Manager or Training
 * Manager). A blank name defaults to the store's leader talk name plus the
 * group number. Refreshes the list and the change log.
 */
export function useCreateLeaderTalk() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (talk: LeaderTalk) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createLeaderTalk(talk);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leaderTalks"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Set a talk's group: replace its attendees (Admin, Managing Partner, Store
 * Manager or Training Manager). Refreshes the list and the change log.
 */
export function useSetLeaderTalkAttendance() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      attendees,
    }: {
      id: LeaderTalkId;
      name: string;
      attendees: RoadieId[];
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setLeaderTalkAttendance(id, name, attendees);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leaderTalks"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/**
 * Delete one leader talk (Admin, Managing Partner, Store Manager or Training
 * Manager). Refreshes the list and the change log.
 */
export function useDeleteLeaderTalk() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: LeaderTalkId) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.deleteLeaderTalk(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leaderTalks"] });
      void queryClient.invalidateQueries({ queryKey: ["changeLog"] });
    },
  });
}

/* ---------------------------------------------------------------------------
   Crew events
--------------------------------------------------------------------------- */

/**
 * The query keys every crew event write invalidates: the events list, the event
 * crew list, the Today upcoming events card, My crew, Today and the Dashboard
 * alerts, plus the change log.
 */
const CREW_EVENT_KEYS = [
  "crewEvents",
  "eventCrew",
  "upcomingEvents",
  "myCrew",
  "today",
  "dashboard",
  "atRiskRoadies",
  "changeLog",
] as const;

function invalidateCrewEvents(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of CREW_EVENT_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Every crew event in the current demo partition with its going, can't go and
 * no-answer counts. Readable by the roles that can see My crew plus Admin and
 * Managing Partner, so callers pass `enabled` (typically `canEvents(role)`) to
 * avoid a trapping read for Kiosk and Integration.
 */
export function useCrewEvents(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["crewEvents"],
    queryFn: async (): Promise<CrewEventSummary[]> => {
      if (!actor) return [];
      return actor.listCrewEvents();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * One event's crew list: each roadie's answer, reason, follow-up note,
 * attendance and whether a follow-up is due. `crewId` null shows the caller's
 * own crew; Admin, Managing Partner and Store Manager may pass any crew id.
 * Readable by the events roles, so callers pass `enabled`.
 */
export function useEventCrew(
  eventId: CrewEventId | undefined,
  crewId: CrewId | null,
  enabled = true,
) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["eventCrew", eventId?.toString(), crewId?.toString() ?? "mine"],
    queryFn: async (): Promise<EventCrewView | null> => {
      if (!actor || eventId === undefined) return null;
      return actor.getEventCrew(eventId, crewId);
    },
    enabled: enabled && !!actor && !isFetching && eventId !== undefined,
  });
}

/**
 * The next upcoming non-cancelled events with the caller's crew counts, for the
 * Today card. Readable by the events roles, so callers pass `enabled`.
 */
export function useUpcomingEvents(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["upcomingEvents"],
    queryFn: async (): Promise<UpcomingEventView[]> => {
      if (!actor) return [];
      return actor.listUpcomingEvents();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * The roadies at risk of missing orientation: two or more can't-go answers or
 * attended-no marks across non-cancelled events. Readable by the manager roles,
 * so callers pass `enabled` to avoid a trapping read for every other role.
 */
export function useAtRiskRoadies(enabled = true) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["atRiskRoadies"],
    queryFn: async (): Promise<AtRiskRoadie[]> => {
      if (!actor) return [];
      return actor.listAtRiskRoadies();
    },
    enabled: enabled && !!actor && !isFetching,
  });
}

/**
 * Create a crew event (Admin and Managing Partner only). Refreshes the events
 * list, the event crew list, My crew, Today and the Dashboard alerts.
 */
export function useCreateCrewEvent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      name: string;
      start: DateTime;
      place: string;
      note: string | null;
    }): Promise<CrewEventId> => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createCrewEvent(
        args.name,
        args.start,
        args.place,
        args.note,
      );
    },
    onSuccess: () => {
      invalidateCrewEvents(queryClient);
    },
  });
}

/**
 * Edit a crew event, including moving its date and time (Admin and Managing
 * Partner only). Every answer, reason, follow-up and attendance already
 * recorded is kept. Refreshes the same reads as create.
 */
export function useUpdateCrewEvent() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      eventId: CrewEventId;
      name: string;
      start: DateTime;
      place: string;
      note: string | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateCrewEvent(
        args.eventId,
        args.name,
        args.start,
        args.place,
        args.note,
      );
    },
    onSuccess: () => {
      invalidateCrewEvents(queryClient);
    },
  });
}

/**
 * Cancel or un-cancel a crew event (Admin and Managing Partner only). A
 * cancelled event takes no new answers; un-cancelling restores it. Refreshes
 * the same reads as create.
 */
export function useSetCrewEventCancelled() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { eventId: CrewEventId; cancelled: boolean }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.setCrewEventCancelled(args.eventId, args.cancelled);
    },
    onSuccess: () => {
      invalidateCrewEvents(queryClient);
    },
  });
}

/**
 * Save one roadie's answer for an event, with the reason (required when they
 * can't go) and the follow-up note. Crew leaders record answers for their own
 * crew; Admin, Managing Partner and Store Manager for any roadie. Refreshes the
 * same reads as create.
 */
export function useSaveEventAnswer() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      eventId: CrewEventId;
      roadieId: RoadieId;
      answer: EventAnswer;
      reason: string | null;
      followUpNote: string | null;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.saveEventAnswer(
        args.eventId,
        args.roadieId,
        args.answer,
        args.reason,
        args.followUpNote,
      );
    },
    onSuccess: () => {
      invalidateCrewEvents(queryClient);
    },
  });
}

/**
 * Mark one roadie's attendance for an event (only after the event's start).
 * Refreshes the same reads as create.
 */
export function useMarkEventAttendance() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      eventId: CrewEventId;
      roadieId: RoadieId;
      attendance: EventAttendance;
    }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markEventAttendance(
        args.eventId,
        args.roadieId,
        args.attendance,
      );
    },
    onSuccess: () => {
      invalidateCrewEvents(queryClient);
    },
  });
}
