import { RoadieStatus } from "@/backend";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { FlipCard } from "@/components/roadie/FlipCard";
import { ManagerTab } from "@/components/roadie/ManagerTab";
import { RoadieActions } from "@/components/roadie/RoadieActions";
import {
  RoadieStageBadge,
  useLeaderTalkLineMap,
} from "@/components/roadie/RoadieTile";
import { TrainerNotesTab } from "@/components/roadie/TrainerNotesTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canArchive,
  canEditRoadie,
  canLeaderTalks,
  canManageCheckIns,
  canReadTrainerNotes,
  canSeeContactInfo,
  useAccessState,
} from "@/hooks/useAccess";
import { useI18n } from "@/hooks/useI18n";
import {
  useCheckInRoadie,
  useCrews,
  useFinalSignOff,
  usePositions,
  useRoadie,
  useStoreInfo,
} from "@/hooks/useQueries";
import { formatTimestamp } from "@/lib/format";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Component, type ReactNode, useState } from "react";

/**
 * Parse a route param into a roadie id. Only a non-empty run of digits is a
 * valid id; anything else (a slug, a negative number, an empty segment) is
 * rejected before `BigInt` so a malformed URL cannot throw during render.
 */
function parseRoadieId(raw: string | undefined): bigint | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

/**
 * Catches render errors in the roadie card subtree (for example a malformed
 * route param) and shows a recoverable message instead of a blank screen.
 */
class RoadieCardErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * The Checked in button for one roadie: saves today's store-local date and time
 * to the roadie's weekly check-in list and shows the most recent check-in date
 * beside it. Rendered only for a role that may check this roadie in, so the
 * backend never rejects the write.
 */
function CheckInControl({
  roadieId,
  checkIns,
  timeZone,
}: {
  roadieId: bigint;
  checkIns: Array<{ at: bigint }>;
  timeZone: string | undefined;
}) {
  const { t } = useI18n();
  const checkIn = useCheckInRoadie();
  const [error, setError] = useState<string | null>(null);
  const latest = checkIns[0];

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-ocid="roadie.checkIn.panel"
    >
      <Button
        type="button"
        className="touch-target"
        data-ocid="roadie.checkIn.button"
        disabled={checkIn.isPending}
        onClick={() => {
          setError(null);
          checkIn.mutate(roadieId, {
            onError: (err) =>
              setError(err instanceof Error ? err.message : t("common.error")),
          });
        }}
      >
        {checkIn.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {t("today.checkIn.checkedIn")}
      </Button>
      <span
        data-ocid="roadie.checkIn.last"
        className="text-sm text-muted-foreground"
      >
        {latest
          ? t("today.checkIn.last", {
              date: formatTimestamp(latest.at, timeZone),
            })
          : t("today.checkIn.none")}
      </span>
      {error && (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function RoadieCardContent() {
  const { t } = useI18n();
  const { roadieId } = useParams({ from: "/roster/$roadieId" });
  const id = parseRoadieId(roadieId);
  const { data: roadie, isLoading, isError, refetch } = useRoadie(id);
  const { data: positions } = usePositions();
  const { data: crews } = useCrews();
  const { data: store } = useStoreInfo();
  const access = useAccessState();
  const role = access.kind === "granted" ? access.grant.role : undefined;

  const isManager = canSeeContactInfo(role);
  const mayEdit = canEditRoadie(role);
  const mayArchive = canArchive(role);
  const canReadNotes = canReadTrainerNotes(role);
  const { data: signOff } = useFinalSignOff(id, canReadNotes);
  const leaderTalkLines = useLeaderTalkLineMap(canLeaderTalks(role));

  // The six manager roles may check in any roadie; a crew leader only roadies
  // in their own crew. The backend enforces the same rule, so the button is
  // shown only when the write would succeed.
  const callerPrincipal =
    access.kind === "granted" ? access.grant.principal.toText() : undefined;
  const leadsRoadieCrew =
    roadie?.crewId !== undefined &&
    crews?.some(
      (crew) =>
        crew.id === roadie.crewId &&
        crew.leaderPrincipal?.toText() === callerPrincipal,
    ) === true;
  const mayCheckIn = canManageCheckIns(role) || leadsRoadieCrew;

  const positionList = positions ?? [];
  const positionById = (positionId: bigint | undefined) =>
    positionId === undefined
      ? undefined
      : positionList.find((position) => position.id === positionId);

  if (id === undefined) {
    return (
      <div className="space-y-6" data-ocid="roadie.page">
        <Button
          asChild
          variant="ghost"
          className="touch-target -ml-2"
          data-ocid="roadie.back_button"
        >
          <Link to="/roster">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("roadie.back")}
          </Link>
        </Button>
        <EmptyState title={t("roadie.notFound")} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ocid="roadie.page">
      <Button
        asChild
        variant="ghost"
        className="touch-target -ml-2"
        data-ocid="roadie.back_button"
      >
        <Link to="/roster">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("roadie.back")}
        </Link>
      </Button>

      {isLoading && <LoadingState label={t("roadie.loading")} />}
      {isError && (
        <ErrorState
          message={t("roadie.error")}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !isError && !roadie && (
        <EmptyState title={t("roadie.notFound")} />
      )}

      {roadie && (
        <>
          <PageHeader
            title={roadie.profile.preferredName || roadie.profile.name}
            subtitle={positionById(roadie.mainPositionId)?.name}
            action={
              <div className="flex flex-wrap items-center gap-3">
                {mayCheckIn && roadie.status !== RoadieStatus.archived && (
                  <CheckInControl
                    roadieId={roadie.id}
                    checkIns={roadie.checkIns}
                    timeZone={store?.timeZone}
                  />
                )}
                <RoadieStageBadge
                  stage={roadie.stage}
                  paperworkStep={roadie.paperworkStep}
                  ocid="roadie.status"
                />
              </div>
            }
          />

          <RoadieActions
            roadie={roadie}
            positions={positionList}
            crews={crews ?? []}
            canEdit={mayEdit}
            canArchive={mayArchive}
          />

          <Tabs defaultValue="card" data-ocid="roadie.tabs">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
              <TabsTrigger
                value="card"
                className="touch-target"
                data-ocid="roadie.card.tab"
              >
                {t("roadie.section.card")}
              </TabsTrigger>
              {isManager && (
                <TabsTrigger
                  value="manager"
                  className="touch-target"
                  data-ocid="roadie.manager.tab"
                >
                  {t("roadie.section.manager")}
                </TabsTrigger>
              )}
              {canReadNotes && (
                <TabsTrigger
                  value="trainer-notes"
                  className="touch-target"
                  data-ocid="roadie.trainerNotes.tab"
                >
                  {t("roadie.section.trainerNotes")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="card" className="mt-4">
              <FlipCard
                roadie={roadie}
                position={positionById(roadie.mainPositionId)}
                secondPosition={positionById(roadie.secondPositionId)}
                crossTrainedPosition={positionById(
                  roadie.crossTrainedPositionId,
                )}
                crew={
                  roadie.crewId === undefined
                    ? undefined
                    : crews?.find((crew) => crew.id === roadie.crewId)
                }
                futureTrainer={signOff?.futureTrainer ?? false}
                leaderTalkLine={leaderTalkLines.get(roadie.id.toString())}
              />
            </TabsContent>

            {isManager && (
              <TabsContent value="manager" className="mt-4">
                <ManagerTab roadie={roadie} />
              </TabsContent>
            )}

            {canReadNotes && (
              <TabsContent value="trainer-notes" className="mt-4">
                <TrainerNotesTab roadieId={roadie.id} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}

export default function RoadieCardPage() {
  const { t } = useI18n();
  return (
    <RoadieCardErrorBoundary
      fallback={
        <div className="space-y-6" data-ocid="roadie.page">
          <ErrorState
            title={t("roadie.error")}
            message={t("roadie.notFound")}
          />
        </div>
      }
    >
      <RoadieCardContent />
    </RoadieCardErrorBoundary>
  );
}
