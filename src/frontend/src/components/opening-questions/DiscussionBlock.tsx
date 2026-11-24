import type { Comment, Suggestion } from "@/backend";
import { SuggestionState } from "@/backend";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import {
  OQ_LIMITS,
  discussionTimeLeft,
  isDiscussionOpen,
} from "@/lib/openingQuestions";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

/**
 * A character counter plus an over-limit message for one field. The textarea
 * itself carries `maxLength`, so the cap is enforced as the person types; this
 * makes the limit visible and explains why a save is blocked.
 */
export function LengthHint({
  value,
  max,
  ocid,
}: {
  value: string;
  max: number;
  ocid: string;
}) {
  const { t } = useI18n();
  const over = value.length > max;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span
        data-ocid={`${ocid}.counter`}
        className={cn(
          "font-mono text-[11px] tabular-nums",
          over ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
      >
        {t("oq.length.counter", { count: value.length, max })}
      </span>
      {over && (
        <span
          data-ocid={`${ocid}.too_long`}
          role="alert"
          className="text-[11px] font-medium text-destructive"
        >
          {t("oq.length.tooLong", { max })}
        </span>
      )}
    </div>
  );
}

/**
 * The discussion block for a question: the suggestions with their 48-hour
 * discussion windows and replies, plus the plain comments. The caller owns the
 * mutations and passes them in, so this block stays presentational and can be
 * reused by the page and the admin panel.
 *
 * Replies are accepted only while a suggestion is still pending: once it is
 * accepted or declined the reply box is replaced by a clear message. Every
 * field shows and enforces its character cap.
 */
export function DiscussionBlock({
  suggestions,
  comments,
  canPost,
  onReply,
  onComment,
  onDecide,
  canDecide,
  canAccept = true,
  isPending,
  isLoading,
  isError,
  onRetry,
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
  /** Whether Accept is allowed; the backend refuses it on a Final question. */
  canAccept?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  ocid?: string;
}) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<bigint | null>(null);
  const [reply, setReply] = useState("");

  const commentTooLong = comment.length > OQ_LIMITS.comment;
  const replyTooLong = reply.length > OQ_LIMITS.reply;

  const submitComment = () => {
    const text = comment.trim();
    if (!text || commentTooLong) return;
    setComment("");
    onComment(text);
  };

  const submitReply = (suggestionId: bigint) => {
    const text = reply.trim();
    if (!text || replyTooLong) return;
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

      {isLoading ? (
        <div data-ocid="oq.discussion.loading_state" className="space-y-2">
          {Array.from(
            { length: 2 },
            (_, i) => `oq-discussion-skeleton-${i}`,
          ).map((id) => (
            <Skeleton key={id} className="h-16 w-full rounded-md" />
          ))}
          <p className="text-sm text-muted-foreground">
            {t("oq.discussion.loading")}
          </p>
        </div>
      ) : isError ? (
        <div
          data-ocid="oq.discussion.error_state"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center"
        >
          <p className="text-sm text-foreground">{t("oq.discussion.error")}</p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              className="touch-target mt-3"
              data-ocid="oq.discussion.retry_button"
              onClick={onRetry}
            >
              {t("oq.discussion.retry")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {suggestions.length === 0 && comments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("oq.discussion.empty")}
            </p>
          )}

          {suggestions.length > 0 && (
            <ul className="space-y-3">
              {suggestions.map((suggestion) => {
                const open = isDiscussionOpen(suggestion.discussionEndsAt);
                // A pending suggestion stays decidable until it is accepted or
                // declined; the 48-hour window only drives the countdown.
                const pending = suggestion.state === SuggestionState.open;
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
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                      {suggestion.proposedAnswer}
                    </p>
                    {suggestion.note && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {suggestion.note}
                      </p>
                    )}

                    {replies.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-border pl-3">
                        {replies.map((r) => (
                          <li
                            key={r.id.toString()}
                            className="whitespace-pre-wrap break-words text-sm text-foreground"
                          >
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    )}

                    {canPost && pending && (
                      <div className="mt-2">
                        {replyTo === suggestion.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={reply}
                              maxLength={OQ_LIMITS.reply}
                              onChange={(e) => setReply(e.target.value)}
                              placeholder={t("oq.discussion.replyPlaceholder")}
                              aria-label={t("oq.discussion.replyPlaceholder")}
                              data-ocid="oq.discussion.reply_input"
                              className="min-h-16"
                            />
                            <LengthHint
                              value={reply}
                              max={OQ_LIMITS.reply}
                              ocid="oq.discussion.reply"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="touch-target"
                                data-ocid="oq.discussion.reply_submit_button"
                                disabled={
                                  isPending || !reply.trim() || replyTooLong
                                }
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

                    {canPost && !pending && (
                      <p
                        data-ocid="oq.discussion.reply_closed"
                        className="mt-2 text-xs text-muted-foreground"
                      >
                        {t("oq.discussion.replyClosed")}
                      </p>
                    )}

                    {canDecide && pending && onDecide && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="touch-target"
                          data-ocid="oq.discussion.accept_button"
                          disabled={isPending || !canAccept}
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
                        {!canAccept && (
                          <span
                            data-ocid="oq.discussion.accept_locked"
                            className="text-xs text-muted-foreground"
                          >
                            {t("oq.card.reopenToChange")}
                          </span>
                        )}
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
                  <li
                    key={c.id.toString()}
                    className="whitespace-pre-wrap break-words text-sm text-foreground"
                  >
                    {c.text}
                  </li>
                ))}
            </ul>
          )}

          {canPost && (
            <div className="space-y-2">
              <Textarea
                value={comment}
                maxLength={OQ_LIMITS.comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("oq.discussion.commentPlaceholder")}
                aria-label={t("oq.discussion.commentPlaceholder")}
                data-ocid="oq.discussion.comment_input"
                className="min-h-16"
              />
              <LengthHint
                value={comment}
                max={OQ_LIMITS.comment}
                ocid="oq.discussion.comment"
              />
              <Button
                type="button"
                size="sm"
                className="touch-target"
                data-ocid="oq.discussion.comment_submit_button"
                disabled={isPending || !comment.trim() || commentTooLong}
                onClick={submitComment}
              >
                {t("oq.discussion.comment")}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
