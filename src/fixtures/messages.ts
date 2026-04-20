import type { Intent, UnifiedMessage, Urgency } from "../types.ts";

/**
 * Gold-labeled fixture of 10 realistic founder-inbox messages. Used by:
 *   - scripts/eval-classifier.ts to measure classifier accuracy
 *   - agents/*.test.ts for deterministic agent behaviour tests
 *   - end-to-end pipeline runs without Gmail OAuth
 *
 * Identity coverage:
 *   - 2 messages match existing seed cards (sarah@ribbit.vc, marcus@acmecorp.io)
 *   - 8 messages are from unknown contacts (exercise "new card" path)
 *
 * Intent coverage:
 *   - 2 investor, 2 customer, 1 partner, 1 press, 2 noise, 1 LinkedIn
 *     notification, 1 X notification
 */

export interface GoldMessage {
  msg: UnifiedMessage;
  expected: {
    intent: Intent;
    urgency: Urgency;
    risk: "low" | "medium" | "high";
    matchesSeedCard: boolean;
    notes: string;
  };
}

const ISO = (yyyyMmDd: string, hhMm = "10:00"): string =>
  new Date(`${yyyyMmDd}T${hhMm}:00Z`).toISOString();

export const GOLD: GoldMessage[] = [
  {
    msg: {
      id: "fix-001",
      threadId: "thread-001",
      receivedAt: ISO("2026-04-20", "09:12"),
      channel: "gmail",
      from: { name: "Sarah Chen", email: "sarah@ribbit.vc" },
      subject: "Re: Following up after Paris AI Summit",
      body:
        "Hi Adel,\n\nGood to reconnect. I've been thinking about our conversation in Paris. " +
        "Could you send the updated deck and current MRR? I'd like to discuss a seed check " +
        "once our partnership sees it.\n\nBest,\nSarah",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "investor",
      urgency: "today",
      risk: "high",
      matchesSeedCard: true,
      notes: "Warm investor follow-up with explicit open ask in memory card",
    },
  },
  {
    msg: {
      id: "fix-002",
      threadId: "thread-002",
      receivedAt: ISO("2026-04-20", "10:45"),
      channel: "gmail",
      from: { name: "Marcus Webb", email: "marcus@acmecorp.io" },
      subject: "Quick question about Electron support",
      body:
        "Hey! Loving the product. One thing — does it work with Slack and Discord yet? " +
        "We're evaluating for our 40-person team and that's a dealbreaker.",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "customer",
      urgency: "today",
      risk: "medium",
      matchesSeedCard: true,
      notes:
        "Existing pilot customer asking FAQ-style question that's also a sales signal",
    },
  },
  {
    msg: {
      id: "fix-003",
      threadId: "thread-003",
      receivedAt: ISO("2026-04-20", "11:30"),
      channel: "gmail",
      from: { name: "Priya Deshmukh", email: "priya@neonflux.capital" },
      subject: "Seed investor intro — via Jason",
      body:
        "Hi Adel,\n\nJason Bigman suggested we connect. I partner at Neon Flux Capital " +
        "where we write $500k-$1.5M first checks into developer tools. " +
        "Would you be open to a 20-minute intro next week?",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "investor",
      urgency: "this_week",
      risk: "high",
      matchesSeedCard: false,
      notes:
        "Cold investor — unknown contact, creates new card; drafter must not invent prior history",
    },
  },
  {
    msg: {
      id: "fix-004",
      threadId: "thread-004",
      receivedAt: ISO("2026-04-20", "12:05"),
      channel: "gmail",
      from: { name: "Tom Liang", email: "tom.liang@gmail.com" },
      subject: "Bug: agent drops replies on investor-tier emails",
      body:
        "Found a reproducible bug. When I label an email as 'investor' in my Gmail " +
        "manually, the agent archives without a draft. Steps: (1) forward ~/tests/bug.eml, " +
        "(2) label as investor, (3) watch the logs.\n\n— Tom",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "customer",
      urgency: "today",
      risk: "high",
      matchesSeedCard: false,
      notes: "Bug report from power user — high urgency despite customer intent",
    },
  },
  {
    msg: {
      id: "fix-005",
      threadId: "thread-005",
      receivedAt: ISO("2026-04-19", "18:22"),
      channel: "gmail",
      from: { name: "Elena Vasquez", email: "elena@verdanthq.com" },
      subject: "Integration partnership — Verdant × Founder Inbox",
      body:
        "Hi Adel,\n\nWe run Verdant, a CRM used by ~300 solo founders. Several customers " +
        "asked about your product. Would you be open to discussing a two-way integration " +
        "(we enrich your contacts, you classify their inbox)?\n\nElena",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "partner",
      urgency: "this_week",
      risk: "medium",
      matchesSeedCard: false,
      notes: "Partnership proposal — requires human review, no auto-send",
    },
  },
  {
    msg: {
      id: "fix-006",
      threadId: "thread-006",
      receivedAt: ISO("2026-04-20", "14:15"),
      channel: "gmail",
      from: { name: "Daniel Park", email: "daniel.park@theverge.com" },
      subject: "Story idea — AI agents for founder workflows",
      body:
        "Hi,\n\nI'm working on a story about AI agents that manage founder inboxes. " +
        "Saw your launch on Product Hunt. Any chance of a 15-min call this week? " +
        "Happy to share questions in advance.\n\nDaniel Park, The Verge",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "press",
      urgency: "this_week",
      risk: "high",
      matchesSeedCard: false,
      notes: "Press inquiry — must escalate, never auto-send",
    },
  },
  {
    msg: {
      id: "fix-007",
      threadId: "thread-007",
      receivedAt: ISO("2026-04-20", "07:00"),
      channel: "gmail",
      from: { name: "SaaS Weekly", email: "hi@saasweekly.com" },
      subject: "Top 10 AI tools for founders this week",
      body:
        "Your weekly digest is here. This week: voice clones, AI CRMs, and agent " +
        "frameworks worth watching. [View online] [Unsubscribe]",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "noise",
      urgency: "defer",
      risk: "low",
      matchesSeedCard: false,
      notes: "Newsletter — archive without reply",
    },
  },
  {
    msg: {
      id: "fix-008",
      threadId: "thread-008",
      receivedAt: ISO("2026-04-20", "08:30"),
      channel: "gmail",
      from: { name: "GrowthHacker Pro", email: "sales@growthhackerpro.biz" },
      subject: "Adel — 3 warm B2B leads waiting for you",
      body:
        "Quick note — we run outbound for 200+ SaaS founders and I noticed your " +
        "product. We guarantee 10 qualified meetings per month for $2k flat. " +
        "Interested in a 10-min demo?",
      isLinkedInNotification: false,
      isXNotification: false,
    },
    expected: {
      intent: "noise",
      urgency: "defer",
      risk: "low",
      matchesSeedCard: false,
      notes: "Cold sales spam — classic noise, archive",
    },
  },
  {
    msg: {
      id: "fix-009",
      threadId: "thread-009",
      receivedAt: ISO("2026-04-20", "16:40"),
      channel: "gmail",
      from: { name: "LinkedIn", email: "messaging-digest-noreply@linkedin.com" },
      subject: "You have 3 new messages on LinkedIn",
      body:
        "Jane Ashford: Hey Adel, loved your post on agent teams. Would love to chat " +
        "about our seed round. --- Carlos Rueda: Fellow YC founder here, saw your " +
        "Product Hunt launch. Want to compare notes? --- [View all on LinkedIn]",
      isLinkedInNotification: true,
      isXNotification: false,
    },
    expected: {
      intent: "investor",
      urgency: "this_week",
      risk: "high",
      matchesSeedCard: false,
      notes:
        "LinkedIn digest with 3 messages inside — Jane's message is investor, Carlos is partner. " +
        "Highest-risk one wins; urgency is this_week because LinkedIn DMs cool fast.",
    },
  },
  {
    msg: {
      id: "fix-010",
      threadId: "thread-010",
      receivedAt: ISO("2026-04-20", "19:05"),
      channel: "gmail",
      from: { name: "X", email: "no-reply@x.com" },
      subject: "Someone replied to your post",
      body:
        "@founderinbox replied: 'Yo does this work with custom Gmail labels?' " +
        "— [View on X]",
      isLinkedInNotification: false,
      isXNotification: true,
    },
    expected: {
      intent: "customer",
      urgency: "today",
      risk: "low",
      matchesSeedCard: false,
      notes:
        "X reply from a stranger asking a feature question — public, low-risk, " +
        "should draft a reply with proactive research step (check their X profile)",
    },
  },
];
