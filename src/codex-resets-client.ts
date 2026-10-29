import type { PublicResetHint } from "./types";

const DEFAULT_STATUS_URL = "https://codex-resets.com/api/v1/status";
const ATTRIBUTION_URL = "https://codex-resets.com/";
const COMPLETED_RETENTION_MS = 48 * 60 * 60 * 1000;
const SCHEDULE_GRACE_MS = 2 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function itemSourceUrl(item: JsonRecord | null): string | null {
  return safeSourceUrl(record(item?.source)?.url);
}

function validResetType(item: JsonRecord | null): boolean {
  return text(item?.reset_type).toLowerCase() !== "banked";
}

function baseHint(
  kind: PublicResetHint["kind"],
  item: JsonRecord,
  start: string | null,
  end: string | null,
  validUntil: string,
  chancePercent: number | null = null,
): PublicResetHint {
  return {
    source: "codex-resets",
    kind,
    start,
    end,
    chancePercent,
    text: text(item.text) || "Codex usage reset",
    url: itemSourceUrl(item),
    sourceLabel: "Codex Resets",
    sourceUrl: ATTRIBUTION_URL,
    validUntil,
  };
}

export function normalizeCodexResetsStatus(
  payload: unknown,
  now = new Date(),
): PublicResetHint | null {
  const root = record(payload);
  const data = record(root?.data) ?? root;
  if (!data) return null;
  const nowMs = now.getTime();

  const scheduled = record(data.scheduled_reset);
  if (scheduled && validResetType(scheduled)) {
    const scheduledFor = iso(scheduled.scheduled_for);
    if (scheduledFor) {
      const scheduledMs = Date.parse(scheduledFor);
      if (scheduledMs + SCHEDULE_GRACE_MS > nowMs) {
        return baseHint(
          "scheduled",
          scheduled,
          scheduledFor,
          null,
          new Date(scheduledMs + SCHEDULE_GRACE_MS).toISOString(),
        );
      }
    }
  }

  const watch = record(data.active_watch);
  if (watch) {
    const observedAt = iso(watch.observed_at) ?? now.toISOString();
    const expiresAt = iso(watch.expires_at);
    const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
    if (expiresAt && Number.isFinite(expiresMs) && expiresMs > nowMs) {
      return baseHint(
        "watch",
        watch,
        observedAt,
        expiresAt,
        expiresAt,
        numberOrNull(watch.reset_chance_percent),
      );
    }
  }

  const latest = record(data.latest_reset);
  if (latest && validResetType(latest)) {
    const announcedAt = iso(latest.announced_at);
    if (announcedAt) {
      const announcedMs = Date.parse(announcedAt);
      if (
        announcedMs <= nowMs + 5 * 60 * 1000 &&
        nowMs - announcedMs <= COMPLETED_RETENTION_MS
      ) {
        return baseHint(
          "completed",
          latest,
          announcedAt,
          null,
          new Date(announcedMs + COMPLETED_RETENTION_MS).toISOString(),
        );
      }
    }
  }

  return null;
}

export async function fetchCodexResetsHint(
  now = new Date(),
  statusUrl = DEFAULT_STATUS_URL,
): Promise<PublicResetHint | null> {
  const response = await fetch(statusUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "gpt-usage-reset-signal/1.1 (+https://github.com/aminoacid72/GPT-usage-reset-signal)",
    },
  });
  if (!response.ok) throw new Error(`codex-resets.com status ${response.status}`);
  return normalizeCodexResetsStatus(await response.json(), now);
}
