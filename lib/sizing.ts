/**
 * Confidence-weighted sizing — a pure helper the decision brain uses to size a buy
 * by conviction, always UNDER the per-position cap. Higher confidence sizes closer
 * to the cap; lower confidence sizes near a small floor. This lives on the PROPOSAL
 * side (the model) — the compliance desk still only trims/blocks and never upsizes.
 *
 * The curve is intentionally conservative: even max confidence never exceeds the
 * cap, and a confidence below `minConfidence` maps to the floor (a probe position).
 * A gentle convex ramp (confidence²-ish) keeps mediocre signals small.
 */
export interface SizingInput {
  confidence: number; // 0..1
  maxPerPosition: number; // the hard per-position cap
  cashAvailable: number; // don't suggest more than is spendable
  dayRemaining?: number; // optional per-day headroom
}

export interface SizingGuide {
  floor: number; // smallest sensible probe
  suggested: number; // confidence-weighted target, ≤ cap/cash/day
  cap: number; // the effective ceiling used
}

/** Below this confidence, only a floor-sized probe is warranted. */
export const MIN_SIZING_CONFIDENCE = 0.35;

/** Fraction of the cap used for the smallest (probe) position. */
const FLOOR_FRACTION = 0.25;

/** Map confidence → a suggested dollar size within all ceilings. Pure. */
export function confidenceSize(input: SizingInput): SizingGuide {
  const cap = Math.max(
    0,
    Math.min(
      input.maxPerPosition,
      input.cashAvailable,
      input.dayRemaining ?? Infinity,
    ),
  );
  const floor = Number((cap * FLOOR_FRACTION).toFixed(2));
  const c = Math.max(0, Math.min(1, input.confidence));
  if (cap <= 0) return { floor: 0, suggested: 0, cap: 0 };
  if (c < MIN_SIZING_CONFIDENCE) return { floor, suggested: floor, cap };

  // Convex ramp from floor→cap over [MIN_SIZING_CONFIDENCE, 1]. Squaring the
  // normalized confidence keeps middling conviction meaningfully below the cap.
  const t = (c - MIN_SIZING_CONFIDENCE) / (1 - MIN_SIZING_CONFIDENCE);
  const ramp = t * t;
  const suggested = Number((floor + (cap - floor) * ramp).toFixed(2));
  return { floor, suggested: Math.min(suggested, cap), cap };
}
