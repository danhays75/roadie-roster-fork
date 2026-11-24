import type { OwnerView } from "@/backend";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/**
 * The approval chips for a question: one chip per current owner, filled when
 * that owner has approved and outlined when they have not. Owners are resolved
 * live on the backend, so the chips always reflect who owns the question now.
 */
export function ApprovalChips({
  owners,
  approved,
  className,
  ocid,
}: {
  owners: OwnerView[];
  approved: OwnerView[];
  className?: string;
  ocid?: string;
}) {
  const { t } = useI18n();
  const approvedPrincipals = new Set(
    approved.map((owner) => owner.principal.toText()),
  );

  if (owners.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("oq.card.noOwners")}
      </p>
    );
  }

  return (
    <ul
      data-ocid={ocid}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {owners.map((owner) => {
        const isApproved = approvedPrincipals.has(owner.principal.toText());
        return (
          <li key={owner.principal.toText()}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                isApproved
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {isApproved && <Check className="h-3 w-3" aria-hidden="true" />}
              {owner.displayName}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
