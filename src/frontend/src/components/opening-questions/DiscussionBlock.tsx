import type { Comment, Suggestion } from "@/backend";
import { SuggestionState } from "@/backend";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { discussionTimeLeft, isDiscussionOpen } from "@/lib/openingQuestions";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

/**
 * The discussion block for a question: the suggestions with their 48-hour
 * discussion windows and replies, plus the plain comments. The caller owns the
 * mutations and passes them in, so this block stays presentational and can be
 * reused by the page and the admin panel.
 */
export function DiscussionBlock({
  suggestions,
  comments,
  canPost,
  onReply,
  onComment,
  onDecide,
  canDecide,
  isPending,
  className,
  ocid,
}: {
  suggestions: Suggestion[];
  comments: Comment[];
  canPost: boolean;
  onReply: (suggestionId: bigint, text: string) => void;
  onComment: (text: string) => void;
  onDecide?: (suggestionId: bigint, accept: boolean) => void;
  canDecide?: boolean;
  isPending?: boolean;
  className?: string;
  ocid?: string;
}) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<bigint | null>(null);
  const [reply, setReply] = useState("");

  const submitComment = () => {
    const text = comment.trim();
    if (!text) return;
    setComment("");
    onComment(text);
  };

  const submitReply = (suggestionId: bigint) => {
    const text = reply.trim();
    if (!text) return;
    setReply("");
    setReplyTo(null);
    onReply(suggestionId, text);
  };

  return (
    <section
      data-ocid={ocid}
      className={cn("space-y-4 border-t border-border pt-4", className)}
    >
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-foreground">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
        {t("oq.discussion.title")}
      </h3>

      {suggestions.length === 0 && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("oq.discussion.empty")}
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="space-y-3">
          {suggestions.map((suggestion) => {
            const open = isDiscussionOpen(suggestion.discussionEndsAt);
            const replies = comments.filter(
              (c) => c.suggestionId === suggestion.id,
            );
            return (
              <li
                key={suggestion.id.toString()}
                className="rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("oq.discussion.suggestion")}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                      suggestion.state === SuggestionState.accepted
                        ? "bg-accent text-accent-foreground"
                        : suggestion.state === SuggestionState.declined
                          ? "bg-muted text-muted-foreground"
                          : open
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                    )}
                  >
                    {suggestion.state === SuggestionState.accepted
                      ? t("oq.discussion.accepted")
                      : suggestion.state === SuggestionState.declined
                        ? t("oq.discussion.declined")
                        : open
                          ? t("oq.discussion.openFor", {
                              time: discussionTimeLeft(
                                suggestion.discussionEndsAt,
                              ),
                            })
                          : t("oq.discussion.closed")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {suggestion.proposedAnswer}
                </p>
                {suggestion.note && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {suggestion.note}
                  </p>
                )}

                {replies.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
                    {replies.map((r) => (
                      <li
                        key={r.id.toString()}
                        className="text-sm text-foreground"
                      >
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}

                {canPost && open && (
                  <div className="mt-2">
                    {replyTo === suggestion.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder={t("oq.discussion.replyPlaceholder")}
                          aria-label={t("oq.discussion.replyPlaceholder")}
                          data-ocid="oq.discussion.reply_input"
                          className="min-h-16"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="touch-target"
                            data-ocid="oq.discussion.reply_submit_button"
                            disabled={isPending || !reply.trim()}
                            onClick={() => submitReply(suggestion.id)}
                          >
                            {t("oq.discussion.reply")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="touch-target"
                            data-ocid="oq.discussion.reply_cancel_button"
                            onClick={() => {
                              setReply("");
                              setReplyTo(null);
                            }}
                          >
                            {t("oq.discussion.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="touch-target"
                        data-ocid="oq.discussion.reply_open_button"
                        onClick={() => {
                          setReply("");
                          setReplyTo(suggestion.id);
                        }}
                      >
                        {t("oq.discussion.reply")}
                      </Button>
                    )}
                  </div>
                )}

                {canDecide && open && onDecide && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="touch-target"
                      data-ocid="oq.discussion.accept_button"
                      disabled={isPending}
                      onClick={() => onDecide(suggestion.id, true)}
                    >
                      {t("oq.discussion.accept")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="touch-target"
                      data-ocid="oq.discussion.decline_button"
                      disabled={isPending}
                      onClick={() => onDecide(suggestion.id, false)}
                    >
                      {t("oq.discussion.decline")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {comments.filter((c) => c.suggestionId === undefined).length > 0 && (
        <ul className="space-y-1">
          {comments
            .filter((c) => c.suggestionId === undefined)
            .map((c) => (
              <li key={c.id.toString()} className="text-sm text-foreground">
                {c.text}
              </li>
            ))}
        </ul>
      )}

      {canPost && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("oq.discussion.commentPlaceholder")}
            aria-label={t("oq.discussion.commentPlaceholder")}
            data-ocid="oq.discussion.comment_input"
            className="min-h-16"
          />
          <Button
            type="button"
            size="sm"
            className="touch-target"
            data-ocid="oq.discussion.comment_submit_button"
            disabled={isPending || !comment.trim()}
            onClick={submitComment}
          >
            {t("oq.discussion.comment")}
          </Button>
        </div>
      )}
    </section>
  );
}
