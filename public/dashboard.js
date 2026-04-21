"use strict";

// ---- constants ----

const INTENT_COLORS = {
  investor: "#fbbf24",
  customer: "#38bdf8",
  partner: "#4ade80",
  press: "#f472b6",
  noise: "#64748b",
  unknown: "#f87171",
};
const DECISION_COLORS = {
  auto_send: "#34d399",
  escalate: "#fbbf24",
  drop: "#64748b",
};

const INTENT_ORDER = ["investor", "customer", "partner", "press", "noise", "unknown"];
const DECISION_ORDER = ["auto_send", "escalate", "drop"];

const SOURCE_LABEL = {
  interaction: "prior interaction",
  inbound_message: "this email",
  context: "context",
  ask: "open ask",
  research: "public research",
};

// ---- state (single source of truth) ----

const state = {
  events: [],
  filters: {
    intents: new Set(),   // empty = no filter
    decisions: new Set(), // empty = no filter
    search: "",
  },
};

// ---- helpers ----

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else if (k === "on" && typeof v === "object") {
      Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn));
    } else if (v !== undefined && v !== null) {
      node.setAttribute(k, v);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    if (typeof c === "string" || typeof c === "number") {
      node.appendChild(document.createTextNode(String(c)));
    } else {
      node.appendChild(c);
    }
  });
  return node;
}

function setText(selector, text) {
  const n = document.querySelector(selector);
  if (n) n.textContent = text;
}

// ---- data loading ----

async function loadEvents() {
  try {
    const res = await fetch("./events.jsonl?ts=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

// ---- filtering ----

function applyFilters(events, filters) {
  const q = filters.search.trim().toLowerCase();
  return events.filter((e) => {
    if (filters.intents.size > 0 && !filters.intents.has(e.intent)) return false;
    if (filters.decisions.size > 0 && !filters.decisions.has(e.decision)) return false;
    if (q.length > 0) {
      // Search hits every text surface a judge might look for during a demo
      // — including the actual draft and cited claims, so queries like
      // "hallucinated X" or "verdanthq" find the evidence row directly.
      const claimsText = (e.claims || [])
        .map((c) => {
          const cites = (c.cites || [])
            .map((ct) => (ct.excerpt || "") + " " + (ct.refId || ""))
            .join(" ");
          return (c.textMatch || "") + " " + cites;
        })
        .join(" ");
      const hay =
        (e.subject || "") + " " +
        (e.from || "") + " " +
        (e.classifierReasoning || "") + " " +
        (e.draftBody || "") + " " +
        (e.inboundPreview || "") + " " +
        claimsText;
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ---- rendering: KPIs / bars (all events, unfiltered) ----

function renderKpi(label, value, unit) {
  const big = el("p", { class: "big" }, [String(value)]);
  if (unit) big.appendChild(el("span", { class: "unit" }, [String(unit)]));
  return el("div", { class: "card" }, [el("h2", {}, [label]), big]);
}

function renderBar(parentId, legendId, counts, colors, total) {
  const bar = document.getElementById(parentId);
  const legend = document.getElementById(legendId);
  if (!bar || !legend) return;
  clearChildren(bar);
  clearChildren(legend);
  Object.entries(counts).forEach(([k, v]) => {
    const pct = total ? (v / total) * 100 : 0;
    const color = colors[k] || "#555";
    bar.appendChild(el("span", { style: `width:${pct}%;background:${color}` }));
    legend.appendChild(
      el("span", {}, [
        el("span", { class: "dot", style: `background:${color}` }),
        `${k} · ${v}`,
      ]),
    );
  });
}

function renderKpis(events) {
  const kpis = document.getElementById("kpis");
  if (!kpis) return;
  clearChildren(kpis);
  const total = events.length;
  const autoSends = events.filter((e) => e.decision === "auto_send").length;
  const escalates = events.filter((e) => e.decision === "escalate").length;
  const drops = events.filter((e) => e.decision === "drop").length;
  const verifierPass = events.filter((e) => e.verifierPass).length;
  const verifierFail = events.filter((e) => !e.verifierPass && e.draftClaims > 0).length;
  const researchRuns = events.filter((e) => e.researchAttempted).length;
  const sortedLatency = events.map((e) => e.elapsedMs).sort((a, b) => a - b);
  const medianMs = percentile(sortedLatency, 0.5);
  const p95Ms = percentile(sortedLatency, 0.95);

  kpis.appendChild(renderKpi("Total processed", total));
  kpis.appendChild(renderKpi("Auto-sent", autoSends, "/ " + total));
  kpis.appendChild(renderKpi("Escalated", escalates, "/ " + total));
  kpis.appendChild(renderKpi("Dropped (noise)", drops, "/ " + total));
  kpis.appendChild(
    renderKpi(
      "Verifier rejections",
      verifierFail,
      verifierPass + verifierFail > 0 ? "/ " + (verifierPass + verifierFail) + " drafts" : "",
    ),
  );
  kpis.appendChild(renderKpi("Research runs", researchRuns));
  kpis.appendChild(renderKpi("Median latency", (medianMs / 1000).toFixed(1), "s"));
  kpis.appendChild(renderKpi("p95 latency", (p95Ms / 1000).toFixed(1), "s"));

  renderBar(
    "decision-bar",
    "decision-legend",
    { auto_send: autoSends, escalate: escalates, drop: drops },
    DECISION_COLORS,
    total,
  );
  const intents = {};
  events.forEach((e) => {
    intents[e.intent] = (intents[e.intent] || 0) + 1;
  });
  renderBar("intent-bar", "intent-legend", intents, INTENT_COLORS, total);
}

// ---- rendering: filter chips ----

function renderChips() {
  renderChipGroup({
    containerId: "intent-chips",
    label: "Intent",
    values: INTENT_ORDER,
    colors: INTENT_COLORS,
    activeSet: state.filters.intents,
    onToggle: (v) => {
      if (state.filters.intents.has(v)) state.filters.intents.delete(v);
      else state.filters.intents.add(v);
      rerender();
    },
  });
  renderChipGroup({
    containerId: "decision-chips",
    label: "Decision",
    values: DECISION_ORDER,
    colors: DECISION_COLORS,
    activeSet: state.filters.decisions,
    onToggle: (v) => {
      if (state.filters.decisions.has(v)) state.filters.decisions.delete(v);
      else state.filters.decisions.add(v);
      rerender();
    },
  });
}

function renderChipGroup({ containerId, label, values, activeSet, onToggle }) {
  const host = document.getElementById(containerId);
  if (!host) return;
  clearChildren(host);

  // counts use the UNFILTERED set so numbers stay stable as filters change
  const counts = {};
  state.events.forEach((e) => {
    const key =
      containerId === "intent-chips" ? e.intent : e.decision;
    counts[key] = (counts[key] || 0) + 1;
  });

  host.appendChild(el("span", { class: "filters-label" }, [label + ":"]));
  values.forEach((v) => {
    const count = counts[v] || 0;
    if (count === 0) return; // hide chips with zero events
    const chip = el(
      "button",
      {
        class: "chip" + (activeSet.has(v) ? " active" : ""),
        type: "button",
        on: { click: () => onToggle(v) },
      },
      [v, el("span", { class: "count" }, ["(" + count + ")"])],
    );
    host.appendChild(chip);
  });
}

// ---- rendering: table ----

function renderTable(events) {
  const host = document.getElementById("events-table");
  if (!host) return;
  clearChildren(host);

  if (events.length === 0) {
    host.appendChild(
      el("div", { class: "empty" }, [
        state.events.length === 0
          ? "no events yet"
          : "no events match filters — click reset",
      ]),
    );
    return;
  }

  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", {}, ["Time"]),
      el("th", {}, ["Intent"]),
      el("th", {}, ["From"]),
      el("th", {}, ["Subject"]),
      el("th", {}, ["Cls c"]),
      el("th", {}, ["Claims"]),
      el("th", {}, ["Verify"]),
      el("th", {}, ["Decision"]),
      el("th", {}, ["Latency"]),
    ]),
  ]);
  const tbody = el("tbody", {});

  events
    .slice(-40)
    .reverse()
    .forEach((ev) => {
      let verify;
      if (ev.verifierPass) {
        verify = el("span", { class: "ok" }, ["✓"]);
      } else if (ev.draftClaims > 0) {
        verify = el("span", { class: "fail" }, ["✗"]);
      } else {
        verify = el("span", { style: "color:var(--muted)" }, ["–"]);
      }
      const subjectCell = el(
        "td",
        {
          style:
            "max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
        },
        [ev.subject || ""],
      );
      if (ev.injectionFlagged) {
        subjectCell.appendChild(el("span", { class: "flag" }, ["🛡 flagged"]));
      }
      const row = el(
        "tr",
        {
          class: "row",
          on: { click: () => openModal(ev) },
          title: "Click for full drill-down",
        },
        [
          el("td", { class: "num" }, [new Date(ev.ts).toLocaleTimeString()]),
          el("td", {}, [el("span", { class: "tag " + ev.intent }, [ev.intent])]),
          el(
            "td",
            {
              style:
                "max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
            },
            [ev.from || ""],
          ),
          subjectCell,
          el("td", { class: "num" }, [Number(ev.classifierConfidence).toFixed(2)]),
          el("td", { class: "num" }, [String(ev.draftClaims)]),
          el("td", {}, [verify]),
          el("td", {}, [el("span", { class: "tag " + ev.decision }, [ev.decision])]),
          el("td", { class: "num" }, [(ev.elapsedMs / 1000).toFixed(1) + "s"]),
        ],
      );
      tbody.appendChild(row);
    });

  const table = el("table", {}, [thead, tbody]);
  host.appendChild(table);
}

// ---- rendering: sub header ----

function renderSub() {
  const sub = document.getElementById("sub");
  if (!sub) return;
  clearChildren(sub);
  if (state.events.length === 0) {
    sub.appendChild(document.createTextNode("No events yet — run `pnpm start` or `pnpm daemon` to populate."));
    return;
  }
  const filtered = applyFilters(state.events, state.filters);
  const firstTs = new Date(
    Math.min(...state.events.map((e) => new Date(e.ts).getTime())),
  ).toLocaleString();
  const lastTs = new Date(
    Math.max(...state.events.map((e) => new Date(e.ts).getTime())),
  ).toLocaleString();
  const filteredHint =
    filtered.length === state.events.length
      ? ""
      : ` · ${filtered.length} match filter`;
  sub.appendChild(
    el("span", {}, [
      `${state.events.length} events${filteredHint} · first `,
      el("code", {}, [firstTs]),
      " · latest ",
      el("code", {}, [lastTs]),
    ]),
  );
}

// ---- modal ----

function openModal(ev) {
  const content = document.getElementById("modal-content");
  const backdrop = document.getElementById("modal-backdrop");
  if (!content || !backdrop) return;

  clearChildren(content);

  // Head: subject + tags
  const head = el("div", { class: "modal-head" }, [
    el("span", { class: "tag " + ev.intent }, [ev.intent]),
    el("span", { class: "tag " + ev.decision }, [ev.decision]),
    ev.injectionFlagged
      ? el("span", { class: "tag unknown" }, ["🛡 injection flagged"])
      : null,
    ev.verifierPass
      ? el("span", { class: "tag auto_send" }, ["verifier ✓"])
      : ev.draftClaims > 0
        ? el("span", { class: "tag unknown" }, ["verifier ✗"])
        : null,
  ]);
  content.appendChild(head);
  content.appendChild(
    el("h3", { id: "modal-subject", class: "modal-subject" }, [ev.subject || "(no subject)"]),
  );
  content.appendChild(
    el("div", { class: "modal-meta" }, [
      ev.from || "(no sender)",
      el("span", { class: "sep" }, ["·"]),
      new Date(ev.ts).toLocaleString(),
      el("span", { class: "sep" }, ["·"]),
      (ev.elapsedMs / 1000).toFixed(1) + "s latency",
      el("span", { class: "sep" }, ["·"]),
      "urgency " + ev.urgency,
      el("span", { class: "sep" }, ["·"]),
      "risk " + ev.risk,
    ]),
  );

  // Classifier
  content.appendChild(
    section("Classifier reasoning", ev.classifierReasoning || "(no reasoning recorded)"),
  );

  // Inbound preview
  content.appendChild(
    section("Inbound preview", ev.inboundPreview || "(no preview)"),
  );

  // Draft body
  const draftBody = ev.draftBody && ev.draftBody.trim().length > 0
    ? ev.draftBody
    : ev.intent === "noise"
      ? "(noise — drafter skipped)"
      : "(no draft generated)";
  const draftSection = section("Draft reply", draftBody);
  if (!ev.draftBody || ev.draftBody.trim().length === 0) {
    draftSection.querySelector(".section-body").classList.add("muted");
  }
  content.appendChild(draftSection);

  // Evidence / claims
  content.appendChild(renderClaimsSection(ev));

  // Decision
  content.appendChild(renderDecisionSection(ev));

  backdrop.classList.add("open");
}

function section(title, body) {
  return el("div", { class: "section" }, [
    el("div", { class: "section-title" }, [title]),
    el("div", { class: "section-body" }, [body]),
  ]);
}

function renderClaimsSection(ev) {
  const wrap = el("div", { class: "section" }, [
    el("div", { class: "section-title" }, [
      ev.claims && ev.claims.length > 0
        ? `Evidence (${ev.claims.length} claim${ev.claims.length === 1 ? "" : "s"})`
        : "Evidence",
    ]),
  ]);
  if (!ev.claims || ev.claims.length === 0) {
    wrap.appendChild(
      el("div", { class: "section-body muted" }, [
        ev.verifierNotes || "No claims — pure conversational draft or skipped.",
      ]),
    );
    return wrap;
  }
  ev.claims.forEach((c, i) => {
    const claim = el("div", { class: "claim" }, [
      el("div", { class: "claim-match" }, [
        String(i + 1) + ". ",
        el("strong", {}, ['"' + (c.textMatch || "") + '"']),
      ]),
    ]);
    (c.cites || []).forEach((ct) => {
      const label = SOURCE_LABEL[ct.source] || ct.source;
      claim.appendChild(
        el("div", { class: "claim-cite" }, [
          "← ",
          el("b", {}, [label]),
          " · ",
          el("code", {}, [ct.refId || "?"]),
          ct.excerpt ? ` · "${ct.excerpt}"` : "",
        ]),
      );
    });
    wrap.appendChild(claim);
  });
  return wrap;
}

function renderDecisionSection(ev) {
  const rows = [];
  rows.push(["Decision", ev.decision]);
  if (ev.decisionReason) rows.push(["Reason", ev.decisionReason]);
  if (ev.approvalReason) rows.push(["Approval reason", ev.approvalReason]);
  rows.push(["Classifier confidence", Number(ev.classifierConfidence).toFixed(2)]);
  rows.push(["Draft confidence", Number(ev.draftConfidence).toFixed(2)]);
  rows.push([
    "Memory card",
    ev.cardMatched ? "matched" : "new contact",
  ]);
  if (ev.researchAttempted) {
    rows.push(["Research", `${ev.researchUrls} URL${ev.researchUrls === 1 ? "" : "s"} scraped`]);
  }
  if (ev.telegramCardId) rows.push(["Telegram card id", ev.telegramCardId]);
  if (ev.verifierNotes) rows.push(["Verifier notes", ev.verifierNotes]);

  const dl = el("dl", { class: "kv" });
  rows.forEach(([k, v]) => {
    dl.appendChild(el("dt", {}, [k]));
    dl.appendChild(el("dd", {}, [String(v)]));
  });

  return el("div", { class: "section" }, [
    el("div", { class: "section-title" }, ["Decision + metadata"]),
    dl,
  ]);
}

function closeModal() {
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) backdrop.classList.remove("open");
}

// ---- orchestration ----

function rerender() {
  renderSub();
  renderKpis(state.events);
  renderChips();
  renderTable(applyFilters(state.events, state.filters));
}

function wireControls() {
  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", (e) => {
      state.filters.search = e.target.value;
      renderSub();
      renderTable(applyFilters(state.events, state.filters));
    });
  }
  const reset = document.getElementById("reset");
  if (reset) {
    reset.addEventListener("click", () => {
      state.filters.intents.clear();
      state.filters.decisions.clear();
      state.filters.search = "";
      if (search) search.value = "";
      rerender();
    });
  }
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
  const close = document.getElementById("modal-close");
  if (close) close.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// Monotonic generation counter — protects the UI from a stale fetch landing
// after a newer one during the 5s poll. Without this, a slow fetch from
// tick #N can overwrite the (newer) state set by tick #N+1 once it finally
// resolves, which causes jitter visible during interaction-heavy demos.
let pollGeneration = 0;

async function tick() {
  const myGen = ++pollGeneration;
  const events = await loadEvents();
  // Discard result if another poll has started — its response is authoritative.
  if (myGen !== pollGeneration) return;
  if (events) {
    state.events = events;
    rerender();
  } else if (state.events.length === 0) {
    setText("#sub", "Could not load events.jsonl — is pnpm dashboard running?");
  }
}

wireControls();
tick();
setInterval(tick, 5000);
