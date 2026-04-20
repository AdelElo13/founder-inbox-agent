"use strict";

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

function esc(s) {
  return (s || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v);
  });
  children.forEach((c) => {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  });
  return node;
}

async function loadEvents() {
  try {
    const res = await fetch("./events.jsonl?ts=" + Date.now(), {
      cache: "no-store",
    });
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

function renderKpi(label, value, unit) {
  const big = el("p", { class: "big" }, [String(value)]);
  if (unit) {
    big.appendChild(el("span", { class: "unit" }, [String(unit)]));
  }
  return el("div", { class: "card" }, [
    el("h2", {}, [label]),
    big,
  ]);
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
    bar.appendChild(
      el("span", { style: `width:${pct}%;background:${color}` }, []),
    );
    legend.appendChild(
      el("span", {}, [
        el("span", { class: "dot", style: `background:${color}` }, []),
        `${k} · ${v}`,
      ]),
    );
  });
}

function renderTable(events) {
  const host = document.getElementById("events-table");
  if (!host) return;
  clearChildren(host);

  if (events.length === 0) {
    host.appendChild(el("div", { class: "empty" }, ["nothing to show"]));
    return;
  }

  const table = el("table", {}, [
    el("thead", {}, [
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
    ]),
  ]);
  const tbody = el("tbody", {}, []);
  events
    .slice(-20)
    .reverse()
    .forEach((e) => {
      let verify;
      if (e.verifierPass) {
        verify = el("span", { class: "ok" }, ["✓"]);
      } else if (e.draftClaims > 0) {
        verify = el("span", { class: "fail" }, ["✗"]);
      } else {
        verify = el("span", { style: "color:var(--muted)" }, ["–"]);
      }
      tbody.appendChild(
        el("tr", {}, [
          el("td", { class: "num" }, [new Date(e.ts).toLocaleTimeString()]),
          el("td", {}, [
            el("span", { class: "tag " + e.intent }, [e.intent]),
          ]),
          el(
            "td",
            {
              style:
                "max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
            },
            [e.from || ""],
          ),
          el(
            "td",
            {
              style:
                "max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
            },
            [e.subject || ""],
          ),
          el("td", { class: "num" }, [e.classifierConfidence.toFixed(2)]),
          el("td", { class: "num" }, [String(e.draftClaims)]),
          el("td", {}, [verify]),
          el("td", {}, [
            el("span", { class: "tag " + e.decision }, [e.decision]),
          ]),
          el("td", { class: "num" }, [(e.elapsedMs / 1000).toFixed(1) + "s"]),
        ]),
      );
    });
  table.appendChild(tbody);
  host.appendChild(table);
}

function render(events) {
  const sub = document.getElementById("sub");
  if (!events || events.length === 0) {
    setText("#sub", "No events yet — run pnpm start to populate.");
    clearChildren(document.getElementById("kpis"));
    renderTable([]);
    return;
  }

  const total = events.length;
  const timestamps = events
    .map((e) => new Date(e.ts).getTime())
    .sort((a, b) => a - b);
  const firstTs = new Date(timestamps[0]).toLocaleString();
  const lastTs = new Date(timestamps[timestamps.length - 1]).toLocaleString();
  clearChildren(sub);
  sub.appendChild(
    el("span", {}, [
      `${total} events · first `,
      el("code", {}, [firstTs]),
      ` · latest `,
      el("code", {}, [lastTs]),
    ]),
  );

  const autoSends = events.filter((e) => e.decision === "auto_send").length;
  const escalates = events.filter((e) => e.decision === "escalate").length;
  const drops = events.filter((e) => e.decision === "drop").length;
  const verifierPass = events.filter((e) => e.verifierPass).length;
  const verifierFail = events.filter(
    (e) => !e.verifierPass && e.draftClaims > 0,
  ).length;
  const researchRuns = events.filter((e) => e.researchAttempted).length;
  const sortedLatency = events.map((e) => e.elapsedMs).sort((a, b) => a - b);
  const medianMs = percentile(sortedLatency, 0.5);
  const p95Ms = percentile(sortedLatency, 0.95);

  const kpis = document.getElementById("kpis");
  clearChildren(kpis);
  kpis.appendChild(renderKpi("Total processed", total));
  kpis.appendChild(renderKpi("Auto-sent", autoSends, "/ " + total));
  kpis.appendChild(renderKpi("Escalated", escalates, "/ " + total));
  kpis.appendChild(renderKpi("Dropped (noise)", drops, "/ " + total));
  kpis.appendChild(
    renderKpi(
      "Verifier rejections",
      verifierFail,
      verifierPass + verifierFail > 0
        ? "/ " + (verifierPass + verifierFail) + " drafts"
        : "",
    ),
  );
  kpis.appendChild(renderKpi("Research runs", researchRuns));
  kpis.appendChild(
    renderKpi("Median latency", (medianMs / 1000).toFixed(1), "s"),
  );
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

  renderTable(events);
}

loadEvents().then(render);
setInterval(() => loadEvents().then(render), 5000);
