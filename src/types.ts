export interface UnifiedMessage {
  id: string;
  receivedAt: string;
  channel: "gmail";
  from: { name: string; email: string };
  subject: string;
  body: string;
  threadId: string;
  isLinkedInNotification: boolean;
  isXNotification: boolean;
}

export type Intent =
  | "investor"
  | "customer"
  | "partner"
  | "press"
  | "noise"
  | "unknown";

export type Urgency = "now" | "today" | "this_week" | "defer";

export interface IntentResult {
  label: Intent;
  urgency: Urgency;
  risk: "low" | "medium" | "high";
  confidence: number;
  reasoning: string;
}

export interface Identity {
  type: "email" | "x_handle" | "linkedin_url" | "phone" | "name";
  value: string;
  provenance: string;
  confidence: number;
}

export interface RelationshipContext {
  role:
    | "investor"
    | "customer"
    | "partner"
    | "press"
    | "friend"
    | "ex-colleague";
  company?: string;
  established: string;
  evidenceIds: string[];
}

export interface Interaction {
  id: string;
  at: string;
  channel: string;
  summary: string;
  rawRef?: string;
  outcome?: string;
}

export interface OpenAsk {
  id: string;
  askedAt: string;
  request: string;
  status: "open" | "in-progress" | "closed";
  resolution?: string;
}

export interface RelationshipCard {
  id: string;
  identities: Identity[];
  contexts: RelationshipContext[];
  interactions: Interaction[];
  openAsks: OpenAsk[];
  importance: 1 | 2 | 3 | 4 | 5;
  lastInteractionAt?: string;
}

export interface Citation {
  source: "interaction" | "inbound_message" | "context" | "ask";
  refId: string;
  excerpt: string;
}

export interface EvidenceClaim {
  /**
   * A verbatim substring of the draft body that represents the factual claim.
   * Verifier does a case-insensitive `body.includes(textMatch)` check.
   * Robust across LLM char-offset mistakes — previous `textRange: [number, number]`
   * shape caused 3/10 false rejections due to off-by-N counting errors.
   */
  textMatch: string;
  cites: Citation[];
}

export interface DraftWithEvidence {
  body: string;
  claims: EvidenceClaim[];
  confidence: number;
  verifierPass: boolean;
  verifierNotes?: string;
}

export type Action =
  | { type: "reply"; threadId?: string; body: string }
  | { type: "archive"; reason: string }
  | { type: "route_to"; target: "telegram"; note: string };

export interface ActionPlan {
  intent: Intent;
  urgency: Urgency;
  confidence: number;
  riskTier: "low" | "medium" | "high";
  steps: Action[];
  requiresApproval: boolean;
  approvalReason?: string;
}

export type GateDecision =
  | { type: "auto_send"; action: Action }
  | { type: "escalate"; plan: ActionPlan; reason: string }
  | { type: "drop"; reason: string };
