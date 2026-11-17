---
name: worknote-session
description: Record a substantive ChatGPT task in the user's WorkNote AI session and daily log when the WorkNote connection is available. Use for completed work with decisions, research, or artifacts; skip casual conversation and simple factual answers.
---

# WorkNote AI session recording

When a substantive task reaches a useful result, call the connected WorkNote `log_ai_session` tool near the end of the turn. The WorkNote MCP tool owns storage, duplicate prevention, and daily log insertion. Do not write directly to the database.

- Set `source` to `chatgpt`. Use a stable conversation ID if the runtime exposes one. Otherwise create a session ID once and reuse it for later updates in the same conversation. Never invent a new ID for a retry.
- Use `worknote_today` for the current Asia/Seoul time. Set `started_at` to the first relevant task time and `last_active_at` to the latest work time. Supply `active_dates` when a task crosses dates.
- Summarize only observed work: short Korean title and one-line summary, with decisions and next actions in `detail`. Do not send the raw chat transcript. Exclude names when unnecessary and redact credentials, tokens, and private identifiers.
- Choose `category` from the user's task context: `work` for company work, `personal` for personal matters. If unclear, use `personal` and let the user change the note later.
- Include a conversation URL in `pointer` only when actually available. List artifact links or file names when useful. Use `post_daily: false` while work is continuing and `post_daily: true` once the result is settled.
- The same `source` and `session_id` update one note. If WorkNote returns `user_edited` or `deleted_by_user`, respect the user's edit or deletion. If a tool call fails, disclose that the record was not saved; do not claim automatic logging succeeded.
- If WorkNote is disconnected or authentication is needed, complete the user's task and explain the connection step. Do not request credentials in chat.

Only log work the user authorized in this conversation. Installing this plugin does not authorize recording earlier conversations or copying entire transcripts.

