import * as chrono from "chrono-node";
import { DateTime, FixedOffsetZone } from "luxon";
import type { XPost } from "./types";

export type EventTime = {
  kind: "exact" | "window" | "date" | "unknown" | "observed";
  start: string | null;
  end: string | null;
  evidence: string;
  note?: string;
};
export type ResetEvent = {
  type: "reset" | "bank_credit" | "bank_expiry" | "mention";
  status: "scheduled" | "completed" | "announced" | "uncertain";
  evidence: string;
  time: EventTime;
};

type ResetAssertion = "uncertain" | "completed" | "committed" | "mention";

const uncertainAssertion =
  /\?|\b(?:wish|hope|maybe|might|could|would|should|unless|if|may|please|not|never|won't|isn't|aren't|can't|cannot|don't|didn't|pending|waiting|failed|failing)\b|\bno\s+(?:schedule|plan|reset|confirmation)\b/i;
const completedAssertion =
  /\b(?:have|has|just|already)\s+(?:been\s+)?reset\b|\blimits?\s+(?:are|is|were|was)\s+(?:now\s+)?(?:fully\s+)?reset\b|\ball\s+(?:usage\s+)?reset\b|\breset(?:s|ting)?\b[^.!?]{0,80}\b(?:complete(?:d)?|done|finished|propagated|applied|landed)\b/i;
const committedAssertion =
  /\b(?:will|going\s+to|plan(?:ned|ning)?\s+to)\b[^.!?]{0,120}\breset(?:s|ting)?\b|\b(?:scheduled|expected)\b[^.!?]{0,40}\breset(?:s|ting)?\b|\breset(?:s|ting)?\b[^.!?]{0,120}\b(?:will|lands?|landing|scheduled|expected|propagating|rolling\s+out)\b|\bresetting\b|\breset(?:s|ting)?\b\s+(?:in|within|at|around|by|today|tonight|tomorrow)\b/i;

/**
 * Classify only whether a reset statement is asserted and its lifecycle state.
 * Temporal parsing must never make an otherwise non-actionable mention actionable.
 */
function classifyResetAssertion(clause: string): ResetAssertion {
  if (uncertainAssertion.test(clause)) return "uncertain";
  // Future/commitment language wins over result words, e.g. "will be propagated".
  if (committedAssertion.test(clause)) return "committed";
  if (completedAssertion.test(clause)) return "completed";
  return "mention";
}

const unknown = (evidence: string, note: string): EventTime => ({
  kind: "unknown",
  start: null,
  end: null,
  evidence,
  note,
});
const numbers: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half: 0.5,
};
const quantity = (s: string) => numbers[s.toLowerCase()] ?? Number(s);

/** Parse only event-local text. All relative expressions are anchored to publication. */
export function parseEventTime(
  text: string,
  createdAt: string | null,
  sourceTimezone?: string,
): EventTime {
  const ref = createdAt ? DateTime.fromISO(createdAt, { setZone: true }) : null;
  if (!ref?.isValid || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAt!))
    return unknown(text, "缺少有效的發文時間");
  if (
    /\bor\b/i.test(text) ||
    [
      ...text.matchAll(
        /\b(?:in|within|over)\s+(?:the\s+next\s+)?(?:\d+(?:\.\d+)?|an?|one|two|three|four|five|six|half)\s+(?:minutes?|hours?|days?)\b/gi,
      ),
    ].length > 1
  )
    return unknown(text, "包含多個候選時間或備選時間，需要核對原文");
  const relative =
    text.match(
      /\b(within(?:\s+the\s+next)?|in(?:\s+the\s+next)?|over\s+the\s+next)\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|half)\s+(minutes?|hours?|days?)\b/i,
    ) ?? text.match(/\b(within|in)\s+the\s+next\s+()(hour|minute|day)\b/i);
  if (relative) {
    const n = relative[2] ? quantity(relative[2]) : 1;
    const end = ref
      .plus({ [relative[3].toLowerCase().replace(/s$/, "") + "s"]: n })
      .toUTC()
      .toISO();
    if (!end) return unknown(relative[0], "相對時間超出可表示範圍");
    const window =
      /within|next|over/i.test(relative[1]) || /the next/i.test(relative[0]);
    return {
      kind: window ? "window" : "exact",
      start: window ? ref.toUTC().toISO() : end,
      end: window ? end : null,
      evidence: relative[0],
    };
  }
  const pacific = /\b(?:PT|Pacific(?:\s+Time)?)\b/i.test(text);
  const sourceZone = pacific ? "America/Los_Angeles" : sourceTimezone;
  const midnightDeadline = text.match(/\bby\s+midnight\s+(?:today|tonight)\b/i);
  if (midnightDeadline) {
    if (!sourceZone)
      return unknown(
        midnightDeadline[0],
        "原文未說明時區；可設定 SOURCE_TIMEZONE，並在通知中標示假設",
      );
    const localRef = ref.setZone(sourceZone);
    const deadline = localRef.startOf("day").plus({ days: 1 });
    if (!deadline.isValid)
      return unknown(midnightDeadline[0], "midnight 截止時間無法解析");
    return {
      kind: "exact",
      start: deadline.toUTC().toISO(),
      end: null,
      evidence: midnightDeadline[0],
      note: `「by midnight」依 ${sourceZone} 當日本地日終解讀；這是截止時間，不代表實際重置一定發生在該時刻`,
    };
  }
  const base = sourceZone ? ref.setZone(sourceZone) : ref.toUTC();
  // chrono supplies candidate calendar fields; Luxon applies IANA rules on the event date.
  const parsed = chrono.en.casual.parse(
    text.replace(/\bPacific(?:\s+Time)?\b/gi, "PT"),
    { instant: ref.toJSDate(), timezone: base.offset },
    { forwardDate: /\b(?:will|expires|scheduled|lands?|landing|tomorrow|next)\b/i.test(text) },
  );
  if (!parsed.length) return unknown(text, "原文沒有可確定的時間");
  if (parsed.length > 1)
    return unknown(text, "同一事件包含多個時間，需要核對原文");
  const result = parsed[0];
  // chrono can read product/technical tokens such as "3D" as a calendar date when
  // a source timezone is configured. A compact number+letter token is not safe
  // timing evidence; rejecting it also lets a dedicated follow-up clause such as
  // "Lands around 6pm PST today" become the authoritative event time.
  if (/^\d+[A-Za-z]$/.test(result.text))
    return unknown(result.text, "緊湊英數 token 不作為事件時間解析");
  const c = result.start;
  const explicitOffset = c.isCertain("timezoneOffset");
  if (!pacific && !explicitOffset && !sourceZone)
    return unknown(
      result.text,
      "原文未說明時區；可設定 SOURCE_TIMEZONE，並在通知中標示假設",
    );
  if (/\b(?:CST|IST|BST)\b/i.test(result.text))
    return unknown(result.text, "時區縮寫有歧義，請核對原文");
  const zone = pacific
    ? "America/Los_Angeles"
    : explicitOffset
      ? FixedOffsetZone.instance(c.get("timezoneOffset")!)
      : sourceZone!;
  const convert = (component: chrono.ParsedComponents) => {
    const parts = {
      year: component.get("year")!,
      month: component.get("month")!,
      day: component.get("day")!,
      hour: component.isCertain("hour") ? component.get("hour")! : 0,
      minute: component.get("minute") ?? 0,
      second: component.get("second") ?? 0,
    };
    const date = DateTime.fromObject(parts, { zone });
    if (
      !date.isValid ||
      date.hour !== parts.hour ||
      date.minute !== parts.minute ||
      date.getPossibleOffsets().length > 1
    )
      return null;
    return date;
  };
  const start = convert(c);
  const end = result.end ? convert(result.end) : null;
  if (!start || (result.end && !end))
    return unknown(result.text, "時間無效或處於日光節約時間跳變／重複區間");
  const assumed =
    !explicitOffset && !pacific
      ? `依設定假設原文時區為 ${sourceZone}`
      : undefined;
  if (!c.isCertain("hour"))
    return {
      kind: "date",
      start: start.toUTC().toISO(),
      end: start.plus({ days: 1 }).toUTC().toISO(),
      evidence: result.text,
      note: assumed,
    };
  if (end && end < start) return unknown(result.text, "時間範圍順序無效");
  return {
    kind: end ? "window" : "exact",
    start: start.toUTC().toISO(),
    end: end?.toUTC().toISO() ?? null,
    evidence: result.text,
    note: assumed,
  };
}

function nearbyTimingClause(clauses: string[], index: number): string | null {
  // Keep cross-sentence linking intentionally narrow. Some announcements put the
  // actual clock in a short follow-up sentence such as "Lands around 6pm PST today."
  for (let offset = 1; offset <= 2; offset += 1) {
    const candidate = clauses[index + offset];
    if (!candidate) break;
    if (/\b(?:reset(?:s|ting)?|bank(?:ed)?)\b/i.test(candidate)) break;
    if (/^(?:lands?|landing|eta|expected|scheduled)\b/i.test(candidate))
      return candidate;
  }
  return null;
}

function pushMention(events: ResetEvent[], clause: string, note: string): void {
  events.push({
    type: "mention",
    status: "uncertain",
    evidence: clause,
    time: unknown(clause, note),
  });
}

export function extractEvents(
  post: XPost,
  sourceTimezone?: string,
): ResetEvent[] {
  if (!/\breset(?:s|ting)?\b/i.test(post.text)) return [];
  const clauses = post.text
    .split(/(?:[;\n]|\.(?=\s+[A-Z]|$)|\s+and\s+(?=we\b|your\b|you\b|one\b))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const events: ResetEvent[] = [];
  for (const [index, clause] of clauses.entries()) {
    const bank = /\bbank(?:ed)?\b/i.test(clause);
    if (
      !/\breset(?:s|ting)?\b/i.test(clause) &&
      !(bank && /\breset/i.test(post.text))
    )
      continue;
    if (/\b(?:password|factory|router|database)\b/i.test(clause)) continue;

    const assertion = classifyResetAssertion(clause);
    if (assertion === "uncertain") {
      pushMention(events, clause, "討論、請求、弱判斷或否定，不代表已確認的重置");
      continue;
    }
    // For ordinary reset events, assertion state decides whether an event exists.
    // Bank events retain their existing grant/expiry semantics in this refactor.
    if (!bank && assertion === "mention") {
      pushMention(events, clause, "未形成明確的重置承諾或完成確認");
      continue;
    }

    const expiry =
      bank && /\b(?:expire[sd]?|expiry|expiration)\b/i.test(clause);
    const completed =
      bank
        ? /\b(?:have|has|just|already)\s+(?:been\s+)?reset\b|\breset\s+(?:is\s+)?(?:complete|done)|\blimits?\s+(?:are|is|were|was)\s+(?:now\s+)?(?:fully\s+)?reset\b|\ball\s+(?:usage\s+)?reset\b/i.test(
            clause,
          )
        : assertion === "completed";
    let type: ResetEvent["type"] = expiry
      ? "bank_expiry"
      : bank
        ? "bank_credit"
        : "reset";
    let timingText = clause;
    // A credit's validity is not its grant time. Keep that duration as a separate unknown expiry.
    const validity =
      bank && !expiry
        ? clause.match(
            /\b(?:(?:valid|available|usable|use it|usage)\s+)?(?:for|over)\s+(?:the\s+next\s+)?(\d+|one|two)\s+(hours?|days?)\b/i,
          )
        : null;
    if (validity) timingText = clause.slice(0, validity.index);
    let time = parseEventTime(timingText, post.createdAt, sourceTimezone);
    if (time.kind === "unknown" && type === "reset") {
      const linked = nearbyTimingClause(clauses, index);
      if (linked) {
        const linkedTime = parseEventTime(linked, post.createdAt, sourceTimezone);
        if (linkedTime.kind !== "unknown") time = linkedTime;
      }
    }
    if (
      time.kind === "unknown" &&
      completed &&
      !/\b(?:at|tomorrow|yesterday|ago|next)\b/i.test(clause) &&
      post.createdAt &&
      DateTime.fromISO(post.createdAt).isValid
    ) {
      time = {
        kind: "observed",
        start: DateTime.fromISO(post.createdAt).toUTC().toISO(),
        end: null,
        evidence: clause,
        note: "使用公告發文時間；不代表帳戶實際重置時刻",
      };
    }

    if (!bank) {
      events.push({
        type: "reset",
        status:
          assertion === "completed"
            ? "completed"
            : ["exact", "window", "date"].includes(time.kind)
              ? "scheduled"
              : "announced",
        evidence: clause,
        time,
      });
      continue;
    }

    // Preserve bank behavior: this refactor is intentionally scoped to reset assertions.
    const actionable =
      completed ||
      /\b(?:will|resetting|now|lands?|landing|credit|credited|adding|added|grant|granted|expire|expires)\b/i.test(
        clause,
      ) ||
      time.kind !== "unknown";
    if (!actionable) type = "mention";
    events.push({
      type,
      status:
        type === "mention"
          ? "uncertain"
          : completed
            ? "completed"
            : ["exact", "window", "date"].includes(time.kind)
              ? "scheduled"
              : "announced",
      evidence: clause,
      time,
    });
    if (validity)
      events.push({
        type: "bank_expiry",
        status: "announced",
        evidence: validity[0],
        time: unknown(
          validity[0],
          "有效期已說明，但起算點未明確；不推算精確到期時間",
        ),
      });
  }
  return events;
}

export function formatTime(time: EventTime, timezone: string): string {
  if (!time.start) return `時間未確定（${time.note ?? time.evidence}）`;
  const format = (s: string) =>
    DateTime.fromISO(s).setZone(timezone).toFormat("yyyy-MM-dd HH:mm ZZ");
  const label = {
    exact: "原文事件时刻",
    window: "原文事件時間範圍",
    date: "日期範圍（未指定具體時間）",
    observed: "公告發文時間",
    unknown: "時間未確定",
  }[time.kind];
  return `${label}：${format(time.start)}${time.end ? ` ～ ${format(time.end)}` : ""} [${timezone}]${time.note ? `（${time.note}）` : ""}`;
}
