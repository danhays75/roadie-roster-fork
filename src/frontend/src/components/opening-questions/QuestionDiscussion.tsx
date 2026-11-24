import type { QuestionView, SuggestionId } from "@/backend";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { useOpeningQuestionDiscussion } from "@/hooks/useQueries";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { DiscussionBlock } from "./DiscussionBlock";

/**
 * One question's discussion, loaded only while its card is open. The question
 * list carries comment and reply counts instead of every comment and reply, so
 * the block stays collapsed until the person asks for it and the read fires
 * only then. The caller owns the mutations and passes them in.
 *
 * Replies are accepted only while a suggestion is still pending; the block
 * hides the reply box and explains why once a suggestion is decided. Accept is
 * refused on a Final question (the backend allows declining one), so the block
 * gates Accept alone on `isFinal`.
 */
export function QuestionDiscussion({
  view,
  isPending,
  canDecide,
  onReply,
  onComment,
  onDecide,
}: {
  view: QuestionView;
  isPending: boolean;
  canDecide: boolean;
  onReply: (suggestionId: SuggestionId, text: string) => void;
  onComment: (text: string) => void;
  onDecide: (suggestionId: SuggestionId, accept: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const discussion = useOpeningQuestionDiscussion(view.question.id, open);

  const count = Number(view.commentCount + view.replyCount);
  const label = open
    ? t("oq.discussion.hide")
    : t("oq.discussion.show", { count });

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="touch-target -ml-2"
        data-ocid="oq.discussion.toggle_button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>

      {open && (
        <DiscussionBlock
          ocid="oq.discussion.block"
          suggestions={discussion.data?.suggestions ?? []}
          comments={discussion.data?.comments ?? []}
          canPost
          canDecide={canDecide}
          canAccept={!view.isFinal}
          isPending={isPending}
          isLoading={discussion.isLoading}
          isError={discussion.isError}
          onRetry={() => void discussion.refetch()}
          onReply={onReply}
          onComment={onComment}
          onDecide={onDecide}
        />
      )}
    </div>
  );
}
