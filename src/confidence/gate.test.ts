import { describe, expect, it } from "vitest";
import { gate } from "./gate.ts";
import type { ActionPlan } from "../types.ts";

/**
 * The gate is the single source of decisions between draft and side-effects.
 * Round-4 adversarial review caught that auto_send decisions were emitted
 * but never actually sent — these tests lock in the decision matrix so the
 * upstream pipeline can't accidentally strand another branch again.
 */

function planOf(overrides: Partial<ActionPlan>): ActionPlan {
  return {
    intent: "customer",
    urgency: "today",
    riskTier: "low",
    confidence: 0.98,
    requiresApproval: false,
    steps: [{ type: "reply", body: "ok" }],
    ...overrides,
  };
}

describe("gate — decision matrix", () => {
  it("high-confidence customer → auto_send", () => {
    const d = gate(planOf({ intent: "customer", confidence: 0.98 }));
    expect(d.type).toBe("auto_send");
  });

  it("high-confidence partner → auto_send", () => {
    const d = gate(planOf({ intent: "partner", confidence: 0.97 }));
    expect(d.type).toBe("auto_send");
  });

  it("investor → always escalate (even at 0.99 confidence)", () => {
    const d = gate(planOf({ intent: "investor", confidence: 0.99 }));
    expect(d.type).toBe("escalate");
    if (d.type === "escalate") {
      expect(d.reason).toMatch(/high-stakes/);
    }
  });

  it("press → always escalate", () => {
    const d = gate(planOf({ intent: "press", confidence: 0.99 }));
    expect(d.type).toBe("escalate");
  });

  it("low-confidence (<0.95) → escalate", () => {
    const d = gate(planOf({ intent: "customer", confidence: 0.8 }));
    expect(d.type).toBe("escalate");
  });

  it("requiresApproval flag → escalate", () => {
    const d = gate(planOf({ requiresApproval: true, confidence: 0.99 }));
    expect(d.type).toBe("escalate");
  });

  it("archive step → drop", () => {
    const d = gate(
      planOf({
        intent: "noise",
        steps: [{ type: "archive", reason: "newsletter" }],
      }),
    );
    expect(d.type).toBe("drop");
  });

  it("empty plan → drop", () => {
    const d = gate(planOf({ steps: [] }));
    expect(d.type).toBe("drop");
  });
});
