import { type LeaderSummary, Role } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import {
  type CardEntry,
  FullProfileLink,
  RoadieCardModal,
} from "@/components/roadie/RoadieCardModal";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canAdmin, useAccessState } from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useAccessGrants,
  useAdminCount,
  useLeaders,
  useUpdateUserRole,
} from "@/hooks/useQueries";
import { refToDataUrl, staffDisplayName } from "@/lib/format";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

/** The three tier groups, in display order. */
type TierKey = "legend" | "plat" | "gold";

const TIERS: { key: TierKey; headingKey: string }[] = [
  { key: "legend", headingKey: "leaders.section.legend" },
  { key: "plat", headingKey: "leaders.section.plat" },
  { key: "gold", headingKey: "leaders.section.gold" },
];

/**
 * The role that decides a leader's badge, tier and title line: their current
 * access-grant role, which is the same value the Role pill and the Admin role
 * picker show. Using one source keeps the badge, its colour and the Role pill
 * in agreement, and the migration that re-roles leaders means the store owner
 * now carries the Managing Partner role rather than a bare Admin grant.
 */
function tierRole(leader: LeaderSummary): Role {
  return leader.role;
}

/**
 * The tier a leader belongs to. Trainers are Gold; managers (store, training,
 * kitchen, service and visiting) are Platinum; leadership, the Managing Partner
 * and Admin are Legend. Any other readable role falls back to Legend so no
 * leader is ever dropped.
 */
function tierOf(leader: LeaderSummary): TierKey {
  switch (tierRole(leader)) {
    case Role.trainer:
      return "gold";
    case Role.storeManager:
    case Role.trainingManager:
    case Role.kitchenManager:
    case Role.serviceManager:
    case Role.visitingManager:
      return "plat";
    default:
      return "legend";
  }
}

/**
 * The tier ribbon label key for a leader, matching the card ribbon. It always
 * names the leader's current Role, so the tile badge and the card badge agree
 * and no role falls back to the old MARKET PARTNER label.
 */
function tierLabelKey(leader: LeaderSummary): string {
  switch (tierRole(leader)) {
    case Role.trainer:
      return "roadie.card.tier.role.trainer";
    case Role.storeManager:
      return "roadie.card.tier.role.storeManager";
    case Role.trainingManager:
      return "roadie.card.tier.role.trainingManager";
    case Role.kitchenManager:
      return "roadie.card.tier.role.kitchenManager";
    case Role.serviceManager:
      return "roadie.card.tier.role.serviceManager";
    case Role.visitingManager:
      return "roadie.card.tier.role.visitingManager";
    case Role.managingPartner:
      return "roadie.card.tier.role.managingPartner";
    case Role.leadership:
      return "roadie.card.tier.role.leadership";
    default:
      return "roadie.card.tier.role.admin";
  }
}

/** A leader's initials for the no-photo placeholder, at most two letters. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * The roles a leader may be given from the Leaders surface. A Kitchen Manager
 * or Service Manager role is what makes a leader own Opening Questions, so the
 * role picker replaces the old separate Manager area field. The Managing
 * Partner carries full Admin rights.
 */
const LEADER_ROLES: { value: Role; labelKey: string }[] = [
  { value: Role.managingPartner, labelKey: "leaders.role.managingPartner" },
  { value: Role.leadership, labelKey: "leaders.role.leadership" },
  { value: Role.visitingManager, labelKey: "leaders.role.visitingManager" },
  { value: Role.kitchenManager, labelKey: "leaders.role.kitchenManager" },
  { value: Role.serviceManager, labelKey: "leaders.role.serviceManager" },
  { value: Role.trainingManager, labelKey: "leaders.role.trainingManager" },
  { value: Role.storeManager, labelKey: "leaders.role.storeManager" },
];

/** The copy key for a role's label, falling back to its raw enum value. */
export function roleLabelKey(role: Role): string {
  return (
    LEADER_ROLES.find((entry) => entry.value === role)?.labelKey ??
    `leaders.role.${role}`
  );
}

/**
 * The Admin-only role picker on a leader tile. It shows the leader's current
 * role and saves a change through the access API. The tile itself is a button
 * that opens the card, so the picker stops click and key events from bubbling
 * up to it. A refused change (the backend protects the last admin) shows the
 * last-admin message instead of a generic error.
 */
function LeaderRolePicker({
  leader,
  current,
  isLastAdmin,
}: {
  leader: LeaderSummary;
  current: Role;
  isLastAdmin: boolean;
}) {
  const { t } = useI18n();
  const update = useUpdateUserRole();
  const [error, setError] = useState<string | null>(null);
  const id = `leader-role-${leader.principal.toString()}`;

  return (
    <div
      className="mt-1 space-y-1.5 border-t border-border pt-3"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      data-ocid="leaders.role.panel"
    >
      <Label htmlFor={id} className="text-xs uppercase tracking-wide">
        {t("leaders.role.label")}
      </Label>
      <Select
        value={current}
        onValueChange={(value) => {
          setError(null);
          update.mutate(
            { principal: leader.principal, role: value as Role },
            {
              onError: () =>
                setError(
                  isLastAdmin
                    ? t("admin.access.lastAdmin")
                    : t("leaders.role.error"),
                ),
            },
          );
        }}
      >
        <SelectTrigger
          id={id}
          data-ocid="leaders.role.select"
          className="touch-target w-full"
          disabled={update.isPending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEADER_ROLES.map((role) => (
            <SelectItem key={role.value} value={role.value}>
              {t(role.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p
        className="text-xs text-muted-foreground"
        data-ocid="leaders.role.hint"
      >
        {update.isPending ? t("leaders.role.saving") : t("leaders.role.hint")}
      </p>
      {error && (
        <p
          role="alert"
          data-ocid="leaders.role.error_state"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** One leader card in the grid; tapping it opens the shared card pop-up. */
function LeaderTile({
  leader,
  onOpen,
  showRolePicker,
  isLastAdmin,
}: {
  leader: LeaderSummary;
  onOpen: () => void;
  showRolePicker: boolean;
  isLastAdmin: boolean;
}) {
  const { t } = useI18n();
  const name = staffDisplayName(leader.staffProfile, t("profile.unnamed"));
  // The title line shows the leader's current Role, never their stored title
  // text, so a stale or contradictory title can never contradict the badge.
  const title = t(roleLabelKey(leader.role));
  // A stored photo always wins; a leader with no stored photo falls back to
  // their demo-only photo URL, which never touches real records.
  const photoUrl = useMemo(
    () =>
      refToDataUrl(leader.staffProfile?.photo) ?? leader.demoPhotoUrl ?? null,
    [leader.staffProfile?.photo, leader.demoPhotoUrl],
  );

  return (
    <li data-ocid="leaders.item">
      <div className="flex h-full w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-subtle transition-smooth hover:-translate-y-0.5 hover:shadow-elevated">
        <button
          type="button"
          data-ocid="leaders.item.link"
          onClick={onOpen}
          className="group flex w-full flex-col gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-primary-foreground"
            data-ocid="leaders.item.tier"
          >
            {t(tierLabelKey(leader))}
          </span>

          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-muted"
            data-ocid="leaders.item.photo"
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={name}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <span
                className="font-display text-xl font-semibold uppercase tracking-wide text-muted-foreground"
                aria-hidden="true"
              >
                {initialsOf(name)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-foreground">
              {name}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {title}
            </p>
            <p
              className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
              data-ocid="leaders.item.role"
            >
              <span className="uppercase tracking-wide text-muted-foreground">
                {t("leaders.role.label")}
              </span>
              <span className="truncate">{t(roleLabelKey(leader.role))}</span>
            </p>
          </div>

          <span className="flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-wider text-primary">
            {t("leaders.viewCard")}
            <ChevronRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </button>

        {showRolePicker && (
          <LeaderRolePicker
            leader={leader}
            current={leader.role}
            isLastAdmin={isLastAdmin}
          />
        )}
      </div>
    </li>
  );
}

export default function LeadersPage() {
  const { t } = useI18n();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;
  const isAdmin = canAdmin(role);
  const { data: leaders, isLoading, isError, refetch } = useLeaders(true);
  const { data: grants } = useAccessGrants();
  const { data: adminCount } = useAdminCount();
  const [card, setCard] = useState<{ tier: TierKey; index: number } | null>(
    null,
  );

  // The backend refuses any change that would leave zero active admins. When
  // only one admin-rights grant remains, a refused change on that leader is
  // the last-admin protection, so the picker names it instead of a generic
  // error.
  const lastAdminPrincipal = useMemo(() => {
    if (adminCount === undefined || adminCount > 1n) return null;
    const admin = (grants ?? []).find(
      (grant) =>
        grant.role === Role.admin || grant.role === Role.managingPartner,
    );
    return admin?.principal.toString() ?? null;
  }, [grants, adminCount]);

  const grouped = useMemo(() => {
    const groups: Record<TierKey, LeaderSummary[]> = {
      legend: [],
      plat: [],
      gold: [],
    };
    for (const leader of leaders ?? []) {
      groups[tierOf(leader)].push(leader);
    }
    return groups;
  }, [leaders]);

  const entriesByTier = useMemo(() => {
    const map: Record<TierKey, CardEntry[]> = {
      legend: [],
      plat: [],
      gold: [],
    };
    for (const tier of TIERS) {
      map[tier.key] = grouped[tier.key].map((leader) => ({
        key: leader.principal.toString(),
        leader,
      }));
    }
    return map;
  }, [grouped]);

  const total = leaders?.length ?? 0;

  return (
    <div className="space-y-8" data-ocid="leaders.page">
      <PageHeader title={t("leaders.title")} subtitle={t("leaders.subtitle")} />

      {isLoading && <LoadingState label={t("leaders.loading")} />}
      {isError && (
        <ErrorState
          message={t("leaders.error")}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && total === 0 && (
        <EmptyState title={t("leaders.empty")} />
      )}

      {!isLoading &&
        !isError &&
        TIERS.map((tier) => {
          const members = grouped[tier.key];
          if (members.length === 0) return null;
          return (
            <section
              key={tier.key}
              data-ocid={`leaders.section.${tier.key}`}
              aria-labelledby={`leaders-heading-${tier.key}`}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <h2
                  id={`leaders-heading-${tier.key}`}
                  className="font-display text-xl font-bold uppercase tracking-wide text-foreground"
                >
                  {t(tier.headingKey)}
                </h2>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">
                  {members.length}
                </span>
              </div>

              <ul
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                data-ocid={`leaders.list.${tier.key}`}
              >
                {members.map((leader, index) => (
                  <LeaderTile
                    key={leader.principal.toString()}
                    leader={leader}
                    showRolePicker={isAdmin}
                    isLastAdmin={
                      lastAdminPrincipal === leader.principal.toString()
                    }
                    onOpen={() => setCard({ tier: tier.key, index })}
                  />
                ))}
              </ul>
            </section>
          );
        })}

      <RoadieCardModal
        entries={card ? entriesByTier[card.tier] : []}
        index={card?.index ?? 0}
        open={card !== null}
        onOpenChange={(next) => {
          if (!next) setCard(null);
        }}
        onIndexChange={(index) =>
          setCard((current) => (current ? { ...current, index } : current))
        }
        renderFullProfile={(entry, onNavigate) => (
          <FullProfileLink entry={entry} onNavigate={onNavigate} />
        )}
      />
    </div>
  );
}
