import type { QuestionArea } from "@/backend";
import { useI18n } from "@/hooks/useI18n";
import { AREA_COLORS, areaLabelKey } from "@/lib/openingQuestions";
import { cn } from "@/lib/utils";

/**
 * A small pill naming a question's area in its brand colour. The colour is a
 * literal OKLCH value from `AREA_COLORS`, so the pill reads the same in light
 * and dark themes; the label is localized.
 */
export function AreaPill({
  area,
  className,
  ocid,
}: {
  area: QuestionArea;
  className?: string;
  ocid?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      data-ocid={ocid}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-white",
        className,
      )}
      style={{ backgroundColor: AREA_COLORS[area] }}
    >
      {t(areaLabelKey(area))}
    </span>
  );
}
