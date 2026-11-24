import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

/**
 * The "Final" badge shown on a question that is locked. It names who finalized
 * it — the Admin who marked it final, or "all owners approved" when every
 * current owner approved.
 */
export function FinalBadge({
  finalizedByName,
  className,
  ocid,
}: {
  finalizedByName?: string;
  className?: string;
  ocid?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      data-ocid={ocid}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-accent-foreground",
        className,
      )}
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      {t("oq.card.final")}
      {finalizedByName && (
        <span className="font-body font-normal normal-case tracking-normal text-accent-foreground/80">
          · {finalizedByName}
        </span>
      )}
    </span>
  );
}
