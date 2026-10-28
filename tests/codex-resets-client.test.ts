import { describe, expect, it } from "vitest";
import { normalizeCodexResetsStatus } from "../src/codex-resets-client";

describe("codex-resets.com status normalization", () => {
  const now = new Date("2026-10-28T09:00:00.000Z");

  it("prefers a scheduled automatic reset", () => {
    const hint = normalizeCodexResetsStatus({
      data: {
        scheduled_reset: {
          id: "sched-1",
          reset_type: "regular",
          scheduled_for: "2026-10-28T12:00:00.000Z",
          text: "Reset lands in a few hours.",
          source: { url: "https://x.com/thsottiaux/status/1" },
        },
        latest_reset: {
          reset_type: "regular",
          announced_at: "2026-10-28T06:00:00.000Z",
          text: "Old reset",
        },
      },
    }, now);

    expect(hint).toMatchObject({
      source: "codex-resets",
      kind: "scheduled",
      start: "2026-10-28T12:00:00.000Z",
      sourceLabel: "Codex Resets",
    });
  });

  it("turns an active watch into an explicitly estimated window", () => {
    const hint = normalizeCodexResetsStatus({
      data: {
        active_watch: {
          reset_chance_percent: 62,
          observed_at: "2026-10-28T08:00:00.000Z",
          expires_at: "2026-10-29T08:00:00.000Z",
          text: "Tibo hinted at a reset.",
        },
      },
    }, now);

    expect(hint).toMatchObject({
      kind: "watch",
      start: "2026-10-28T08:00:00.000Z",
      end: "2026-10-29T08:00:00.000Z",
      chancePercent: 62,
    });
  });

  it("uses a recent completed reset when there is no forward-looking hint", () => {
    const hint = normalizeCodexResetsStatus({
      data: {
        latest_reset: {
          reset_type: "regular",
          announced_at: "2026-10-28T06:29:38.000Z",
          text: "And it's done.",
          source: { url: "https://x.com/thsottiaux/status/2115330127886463244" },
        },
      },
    }, now);

    expect(hint).toMatchObject({
      kind: "completed",
      start: "2026-10-28T06:29:38.000Z",
    });
  });

  it("does not treat a banked reset as an automatic usage reset", () => {
    expect(normalizeCodexResetsStatus({
      data: {
        latest_reset: {
          reset_type: "banked",
          announced_at: "2026-10-28T06:29:38.000Z",
          text: "One reset stored.",
        },
      },
    }, now)).toBeNull();
  });
});
