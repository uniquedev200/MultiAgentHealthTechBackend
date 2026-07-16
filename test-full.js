#!/usr/bin/env node
const BASE = process.env.BASE_URL || process.argv[2] || "https://multiagenthealthtechbackend.onrender.com";
const DEMO_KEY = "gh-live-key-001";
const results = [];

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function pad(s, n) { while (s.length < n) s += " "; return s; }
function repeat(ch, n) { var s = ""; for (var i = 0; i < n; i++) s += ch; return s; }
function pass(name, detail) { results.push({ name: name, passed: true, error: null }); console.log("  [OK]   " + name + (detail ? " -- " + detail : "")); }
function fail(name, error) { results.push({ name: name, passed: false, error: error }); console.log("  [FAIL] " + name + " -- " + error); }
function section(num, title) { console.log("\n" + repeat("=", 60)); console.log("  " + num + ". " + title); console.log(repeat("=", 60)); }

async function api(method, path, opts) {
  opts = opts || {};
  var h = { "Content-Type": "application/json" };
  if (opts.apiKey) h.Authorization = "Bearer " + opts.apiKey;
  var f = { method: method, headers: h };
  if (opts.body) f.body = JSON.stringify(opts.body);
  for (var att = 0; att <= 2; att++) {
    try {
      var res = await fetch(BASE + path, Object.assign({}, f, { signal: AbortSignal.timeout(30000) }));
      var text = await res.text();
      var data; try { data = JSON.parse(text); } catch (e) { data = text; }
      return { status: res.status, ok: res.ok, data: data };
    } catch (e) {
      if (att < 2) { await sleep(3000); } else { return { status: 0, ok: false, data: { error: e.message } }; }
    }
  }
}

async function sseConnect(emergencyId, apiKey, events, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return new Promise(function(resolve) {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); resolve(); }, timeoutMs);
    fetch(BASE + "/emergencies/" + emergencyId + "/stream", {
      headers: { Authorization: "Bearer " + apiKey }, signal: ctrl.signal
    }).then(async function(res) {
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        var ev = null, dt = null;
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf("event: ") === 0) ev = lines[i].slice(7).trim();
          else if (lines[i].indexOf("data: ") === 0) dt = lines[i].slice(6);
          else if (lines[i] === "" && ev && dt) {
            var p; try { p = JSON.parse(dt); } catch (e2) { p = dt; }
            events.push({ event: ev, data: p });
            ev = null; dt = null;
          }
        }
      }
    }).catch(function() {});
  });
}

async function run() {
  var t0 = Date.now();
  console.log("\n" + repeat("=", 60));
  console.log("  FULL BACKEND TEST SUITE");
  console.log("  Target: " + BASE);
  console.log(repeat("=", 60));

  // 1. Health
  section(1, "Health Check (no auth)");
  try {
    var r = await api("GET", "/health");
    if (r.ok && r.data.status === "ok") pass("GET /health", "server is up");
    else fail("GET /health", "HTTP " + r.status);
  } catch (e) { fail("GET /health", e.message); }

  // 2. Auth errors
  section(2, "Auth -- Validation Errors");
  try {
    var t1 = await api("POST", "/auth/login", { body: {} });
    if (t1.status === 400) pass("Login empty body -> 400", JSON.stringify(t1.data));
    else fail("Login empty body -> 400", "HTTP " + t1.status);

    var t2 = await api("POST", "/auth/login", { body: { email: "x@y.com", password: "z" } });
    if (t2.status === 401) pass("Login wrong creds -> 401", JSON.stringify(t2.data));
    else fail("Login wrong creds -> 401", "HTTP " + t2.status);

    var t3 = await api("GET", "/resources");
    if (t3.status === 401) pass("GET /resources no auth -> 401", JSON.stringify(t3.data));
    else fail("GET /resources no auth -> 401", "HTTP " + t3.status);

    var t4 = await api("GET", "/resources", { apiKey: "bad-key" });
    if (t4.status === 401) pass("GET /resources bad key -> 401", JSON.stringify(t4.data));
    else fail("GET /resources bad key -> 401", "HTTP " + t4.status);
  } catch (e) { fail("Auth validation", e.message); }

  // 3. Register + Login
  section(3, "Registration & Login");
  var jwtToken = null;
  try {
    var reg = await api("POST", "/hospitals/register", {
      body: { name: "Test Hospital", email: "test-" + Date.now() + "@fulltest.com", password: "testpass123" }
    });
    if (reg.ok && reg.data.api_key) pass("POST /hospitals/register", "key=" + reg.data.api_key);
    else fail("POST /hospitals/register", JSON.stringify(reg.data));

    var login = await api("POST", "/auth/login", { body: { email: "admin@generalhospital.demo", password: "demo1234" } });
    if (login.ok && login.data.token) { jwtToken = login.data.token; pass("POST /auth/login", "JWT=" + jwtToken.slice(0, 20) + "..."); }
    else fail("POST /auth/login", JSON.stringify(login.data));

    if (jwtToken) {
      var rJwt = await api("GET", "/resources", { apiKey: jwtToken });
      if (rJwt.ok) pass("GET /resources with JWT", rJwt.data.length + " resources");
      else fail("GET /resources with JWT", JSON.stringify(rJwt.data));
    }
  } catch (e) { fail("Registration/Login", e.message); }

  // 4. Resources
  section(4, "Resources");
  var resourceList = [];
  try {
    var rr = await api("GET", "/resources", { apiKey: DEMO_KEY });
    if (rr.ok && Array.isArray(rr.data) && rr.data.length > 0) {
      resourceList = rr.data;
      pass("GET /resources", rr.data.length + " loaded");
    } else fail("GET /resources", JSON.stringify(rr.data).slice(0, 100));

    if (resourceList.length > 0) {
      var rid = resourceList[0].id;
      var rp = await api("PATCH", "/resources/" + rid, { body: { status: "offline" }, apiKey: DEMO_KEY });
      if (rp.ok && rp.data.status === "offline") pass("PATCH /resources -> offline", rp.data.label);
      else fail("PATCH /resources -> offline", JSON.stringify(rp.data));
      await api("PATCH", "/resources/" + rid, { body: { status: "available" }, apiKey: DEMO_KEY });

      var rb = await api("PATCH", "/resources/" + rid, { body: { status: "INVALID" }, apiKey: DEMO_KEY });
      if (rb.status === 400) pass("PATCH /resources invalid -> 400", JSON.stringify(rb.data));
      else fail("PATCH /resources invalid -> 400", "HTTP " + rb.status);

      var rf = await api("PATCH", "/resources/00000000-0000-0000-0000-000000000000", { body: { status: "available" }, apiKey: DEMO_KEY });
      if (rf.status === 404) pass("PATCH /resources fake -> 404", JSON.stringify(rf.data));
      else fail("PATCH /resources fake -> 404", "HTTP " + rf.status);
    }
  } catch (e) { fail("Resources", e.message); }

  // 5. Emergency validation
  section(5, "Emergency -- Validation Errors");
  try {
    var ev1 = await api("POST", "/emergencies", { body: { department_reach: ["ICU"] }, apiKey: DEMO_KEY });
    if (ev1.status === 400) pass("Emergency no scope -> 400", JSON.stringify(ev1.data));
    else fail("Emergency no scope -> 400", "HTTP " + ev1.status);

    var ev2 = await api("POST", "/emergencies", { body: { scope: "bad", department_reach: ["ICU"] }, apiKey: DEMO_KEY });
    if (ev2.status === 400) pass("Emergency bad scope -> 400", JSON.stringify(ev2.data));
    else fail("Emergency bad scope -> 400", "HTTP " + ev2.status);

    var ev3 = await api("POST", "/emergencies", { body: { scope: "individual" }, apiKey: DEMO_KEY });
    if (ev3.status === 400) pass("Emergency no dept -> 400", JSON.stringify(ev3.data));
    else fail("Emergency no dept -> 400", "HTTP " + ev3.status);

    var ev4 = await api("POST", "/emergencies", { body: { scope: "individual", department_reach: [] }, apiKey: DEMO_KEY });
    if (ev4.status === 400) pass("Emergency empty dept -> 400", JSON.stringify(ev4.data));
    else fail("Emergency empty dept -> 400", "HTTP " + ev4.status);

    var ev5 = await api("GET", "/emergencies/00000000-0000-0000-0000-000000000000", { apiKey: DEMO_KEY });
    if (ev5.status === 404) pass("GET /emergencies fake -> 404", JSON.stringify(ev5.data));
    else fail("GET /emergencies fake -> 404", "HTTP " + ev5.status);
  } catch (e) { fail("Emergency validation", e.message); }

  // 6. Full negotiation flow
  section(6, "Full Multi-Agent Negotiation Flow");
  var emergencyId = null;
  try {
    var er = await api("POST", "/emergencies", {
      body: { scope: "individual", department_reach: ["Emergency", "ICU", "Surgery", "Cardiology", "Radiology", "Lab"] },
      apiKey: DEMO_KEY
    });
    if (er.ok && er.data.id) { emergencyId = er.data.id; pass("Declare emergency", "id=" + emergencyId.slice(0, 8) + "..."); }
    else { fail("Declare emergency", JSON.stringify(er.data)); throw new Error("No emergency"); }

    var payloads = [
      { acuity_score: 5, required_resource_types: ["icu_bed", "staff"] },
      { acuity_score: 3, required_resource_types: ["er_bay"] },
      { acuity_score: 4, required_resource_types: ["or_slot", "equipment"] }
    ];
    for (var i = 0; i < payloads.length; i++) {
      var p = payloads[i];
      var c = await api("POST", "/emergencies/" + emergencyId + "/cases", { body: p, apiKey: DEMO_KEY });
      if (c.ok && c.data.id) pass("Add case acuity=" + p.acuity_score, "id=" + c.data.id.slice(0, 8));
      else fail("Add case acuity=" + p.acuity_score, JSON.stringify(c.data));
      await sleep(500);
    }

    var bc1 = await api("POST", "/emergencies/" + emergencyId + "/cases", { body: { acuity_score: 10, required_resource_types: ["icu_bed"] }, apiKey: DEMO_KEY });
    if (bc1.status === 400) pass("Case acuity>5 -> 400", JSON.stringify(bc1.data));
    else fail("Case acuity>5 -> 400", "HTTP " + bc1.status);

    var bc2 = await api("POST", "/emergencies/" + emergencyId + "/cases", { body: { acuity_score: 3, required_resource_types: [] }, apiKey: DEMO_KEY });
    if (bc2.status === 400) pass("Case empty types -> 400", JSON.stringify(bc2.data));
    else fail("Case empty types -> 400", "HTTP " + bc2.status);

    console.log("\n  Waiting for Groq negotiation via SSE...");
    var capturedRoundId = null;
    var capturedAllocations = null;
    var capturedExplanation = null;

    // Start SSE connection with shared events array
    var sseEvents = [];
    var sseDone = sseConnect(emergencyId, DEMO_KEY, sseEvents, 25000);

    // Poll for round:completed event
    var waited = 0;
    while (waited < 23000) {
      await sleep(1000);
      waited += 1000;
      for (var si = 0; si < sseEvents.length; si++) {
        if (sseEvents[si].event === "round:completed" && sseEvents[si].data) {
          capturedRoundId = sseEvents[si].data.roundId;
          capturedAllocations = sseEvents[si].data.allocations;
          capturedExplanation = sseEvents[si].data.explanation;
          break;
        }
      }
      if (capturedRoundId) break;
    }
    await sseDone;

    var st = await api("GET", "/emergencies/" + emergencyId, { apiKey: DEMO_KEY });
    if (st.ok && st.data.cases) {
      var alloc = st.data.cases.filter(function(c) { return c.status === "allocated"; }).length;
      var pend = st.data.cases.filter(function(c) { return c.status === "pending"; }).length;
      pass("Negotiation result", alloc + " allocated, " + pend + " pending");
      console.log("\n  +--------------------+--------+-----------+--------------------+");
      console.log("  | CASE ID            | ACUITY | STATUS    | RESOURCE TYPES     |");
      console.log("  +--------------------+--------+-----------+--------------------+");
      for (var j = 0; j < st.data.cases.length; j++) {
        var cs = st.data.cases[j];
        var ico = cs.status === "allocated" ? "[OK]" : "[--]";
        console.log("  | " + ico + " " + pad(cs.id.slice(0, 16), 17) + "| " + pad(String(cs.acuity_score), 5) + "  | " + pad(cs.status, 9) + " | " + pad(cs.required_resource_types.join(",").slice(0, 18), 18) + "|");
      }
      console.log("  +--------------------+--------+-----------+--------------------+");
    } else fail("Negotiation result", JSON.stringify(st.data).slice(0, 100));

    // Print SSE-captured round data
    if (capturedRoundId) {
      pass("SSE round:completed", "roundId=" + capturedRoundId.slice(0, 8));
      if (capturedAllocations && capturedAllocations.length > 0) {
        console.log("\n  ALLOCATIONS (via SSE):");
        console.log("  +--------------------+----+--------------------+--------------------+");
        for (var a = 0; a < capturedAllocations.length; a++) {
          var al = capturedAllocations[a];
          console.log("  | " + pad(al.case_id.slice(0, 16), 16) + " | -> | " + pad(al.resource_id.slice(0, 16), 16) + " | " + pad((al.explanation || "n/a").slice(0, 16), 16) + " |");
        }
        console.log("  +--------------------+----+--------------------+--------------------+");
      }
      if (capturedExplanation) console.log("  Explanation: " + capturedExplanation);

      // Also fetch full round details via API
      var det = await api("GET", "/emergencies/" + emergencyId + "/rounds/" + capturedRoundId, { apiKey: DEMO_KEY });
      if (det.ok) {
        pass("Round details (API)", det.data.bids.length + " bids, " + det.data.allocations.length + " allocations");
        if (det.data.bids.length > 0) {
          console.log("\n  BIDS (Groq agents):");
          console.log("  +--------------------+--------------------+-------+--------------+");
          for (var b = 0; b < det.data.bids.length; b++) {
            var bd = det.data.bids[b];
            console.log("  | " + pad(bd.resource_id.slice(0, 16), 16) + " | " + pad(bd.case_id.slice(0, 16), 16) + " | " + pad(String(bd.bid_score).slice(0, 5), 5) + " | " + pad((bd.reasoning || "n/a").slice(0, 12), 12) + " |");
          }
          console.log("  +--------------------+--------------------+-------+--------------+");
        }
      } else if (det.status === 404) {
        pass("Round details (API)", "round completed with 0 bids/allocations (404 by design)");
      } else fail("Round details (API)", JSON.stringify(det.data));
    } else {
      fail("SSE round:completed", "not captured in " + waited + "ms");
    }
  } catch (e) { fail("Negotiation flow", e.message); }

  // 7. Cross-hospital
  section(7, "Cross-Hospital Guard");
  try {
    var reg2 = await api("POST", "/hospitals/register", { body: { name: "Hospital B", email: "hospB-" + Date.now() + "@test.com", password: "pass123" } });
    if (reg2.ok) {
      var keyB = reg2.data.api_key;
      pass("Register Hospital B", "key=" + keyB);
      if (emergencyId) {
        var xc = await api("GET", "/emergencies/" + emergencyId, { apiKey: keyB });
        if (xc.status === 404) pass("Hospital B -> Hospital A emergency -> 404", JSON.stringify(xc.data));
        else fail("Hospital B -> Hospital A emergency -> 404", "HTTP " + xc.status);
      }
      var xr = await api("GET", "/resources", { apiKey: keyB });
      if (xr.ok && xr.data.length === 0) pass("Hospital B has 0 resources", "isolated");
      else fail("Hospital B has 0 resources", "got " + xr.data.length);
    }
  } catch (e) { fail("Cross-hospital", e.message); }

  // 8. Resolve
  section(8, "Resolve Emergency");
  try {
    if (emergencyId) {
      var rr = await api("PATCH", "/emergencies/" + emergencyId + "/resolve", { apiKey: DEMO_KEY });
      if (rr.ok && rr.data.status === "resolved") pass("Resolve emergency", "resolved_at=" + rr.data.resolved_at);
      else fail("Resolve emergency", JSON.stringify(rr.data));

      var rr2 = await api("PATCH", "/emergencies/" + emergencyId + "/resolve", { apiKey: DEMO_KEY });
      if (rr2.status === 400) pass("Double resolve -> 400", JSON.stringify(rr2.data));
      else fail("Double resolve -> 400", "HTTP " + rr2.status);

      var rr3 = await api("GET", "/emergencies/" + emergencyId, { apiKey: DEMO_KEY });
      if (rr3.ok && rr3.data.cases) pass("Resolved state", "got " + rr3.data.cases.length + " cases");
      else fail("Resolved state", JSON.stringify(rr3.data).slice(0, 100));
    }
  } catch (e) { fail("Resolve", e.message); }

  // 9. LLM Keys CRUD
  section(9, "LLM Keys CRUD");
  try {
    var ls = await api("GET", "/settings/llm-keys", { apiKey: DEMO_KEY });
    if (ls.ok) pass("GET /settings/llm-keys", JSON.stringify(ls.data));
    else fail("GET /settings/llm-keys", JSON.stringify(ls.data));

    var lp = await api("PUT", "/settings/llm-keys/groq", { body: { api_key: "gsk_test_abc123" }, apiKey: DEMO_KEY });
    if (lp.ok && lp.data.configured) pass("PUT llm-keys/groq", JSON.stringify(lp.data));
    else fail("PUT llm-keys/groq", JSON.stringify(lp.data));

    var lm = await api("PUT", "/settings/llm-keys/mistral", { body: { api_key: "test-mistral-key" }, apiKey: DEMO_KEY });
    if (lm.ok && lm.data.configured) pass("PUT llm-keys/mistral", JSON.stringify(lm.data));
    else fail("PUT llm-keys/mistral", JSON.stringify(lm.data));

    var lb = await api("GET", "/settings/llm-keys", { apiKey: DEMO_KEY });
    if (lb.ok && lb.data.groq && lb.data.mistral) pass("GET llm-keys (both set)", "ok");
    else fail("GET llm-keys (both set)", JSON.stringify(lb.data));

    var li = await api("PUT", "/settings/llm-keys/openai", { body: { api_key: "sk-x" }, apiKey: DEMO_KEY });
    if (li.status === 400) pass("PUT llm-keys/openai -> 400", JSON.stringify(li.data));
    else fail("PUT llm-keys/openai -> 400", "HTTP " + li.status);

    var ln = await api("PUT", "/settings/llm-keys/groq", { body: {}, apiKey: DEMO_KEY });
    if (ln.status === 400) pass("PUT llm-keys/groq (no key) -> 400", JSON.stringify(ln.data));
    else fail("PUT llm-keys/groq (no key) -> 400", "HTTP " + ln.status);

    var ld = await api("DELETE", "/settings/llm-keys/groq", { apiKey: DEMO_KEY });
    if (ld.ok && !ld.data.configured) pass("DELETE llm-keys/groq", JSON.stringify(ld.data));
    else fail("DELETE llm-keys/groq", JSON.stringify(ld.data));

    var ld2 = await api("DELETE", "/settings/llm-keys/mistral", { apiKey: DEMO_KEY });
    if (ld2.ok && !ld2.data.configured) pass("DELETE llm-keys/mistral", JSON.stringify(ld2.data));
    else fail("DELETE llm-keys/mistral", JSON.stringify(ld2.data));
  } catch (e) { fail("LLM Keys", e.message); }

  // 10. Audit log
  section(10, "Audit Log");
  try {
    var al = await api("GET", "/audit-log?limit=5", { apiKey: DEMO_KEY });
    if (al.ok && al.data.entries) {
      pass("GET /audit-log", al.data.total + " total, " + al.data.entries.length + " returned");
      for (var i = 0; i < Math.min(3, al.data.entries.length); i++) {
        var e = al.data.entries[i];
        console.log("    [" + (e.event_type || "?") + "] hash=" + (e.hash || "?").slice(0, 12) + "...");
      }
    } else fail("GET /audit-log", JSON.stringify(al.data));

    var ap = await api("GET", "/audit-log?page=1&limit=2", { apiKey: DEMO_KEY });
    if (ap.ok && ap.data.entries.length <= 2) pass("Audit pagination", "page=" + ap.data.page + " limit=" + ap.data.limit);
    else fail("Audit pagination", JSON.stringify(ap.data));
  } catch (e) { fail("Audit log", e.message); }

  // 11. SSE
  section(11, "SSE Stream");
  try {
    var se = await api("POST", "/emergencies", { body: { scope: "individual", department_reach: ["Emergency"] }, apiKey: DEMO_KEY });
    if (se.ok) {
      var seId = se.data.id;
      pass("Declare SSE emergency", "id=" + seId.slice(0, 8));
      var sseEvents = [];
      var sseDone = sseConnect(seId, DEMO_KEY, sseEvents, 12000);
      await sleep(1000);
      await api("POST", "/emergencies/" + seId + "/cases", { body: { acuity_score: 2, required_resource_types: ["er_bay"] }, apiKey: DEMO_KEY });
      await sseDone;
      var types = sseEvents.map(function(e) { return e.event; });
      if (types.indexOf("connected") >= 0) pass("SSE connected", JSON.stringify(sseEvents[0] && sseEvents[0].data));
      else fail("SSE connected", "not received");
      if (types.indexOf("case_added") >= 0) pass("SSE case_added", "received");
      else fail("SSE case_added", "not received");
      await api("PATCH", "/emergencies/" + seId + "/resolve", { apiKey: DEMO_KEY });
      console.log("  Events: [" + types.join(", ") + "]");
    }
  } catch (e) { fail("SSE", e.message); }

  // 12. 404 catch-all
  section(12, "404 Catch-All");
  try {
    var nf = await api("GET", "/nonexistent/route", { apiKey: DEMO_KEY });
    if (nf.status === 404) pass("GET /nonexistent -> 404", JSON.stringify(nf.data));
    else fail("GET /nonexistent -> 404", "HTTP " + nf.status);
  } catch (e) { fail("404", e.message); }

  // SUMMARY
  var elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  var passed = results.filter(function(r) { return r.passed; }).length;
  var failed = results.filter(function(r) { return !r.passed; }).length;

  console.log("\n" + repeat("=", 60));
  console.log("  RESULTS: " + passed + " passed, " + failed + " failed -- " + elapsed + "s");
  console.log(repeat("=", 60));

  console.log("\n  +------+--------+----------------------------------------------+");
  console.log("  |  #   | STATUS | TEST                                         |");
  console.log("  +------+--------+----------------------------------------------+");
  for (var idx = 0; idx < results.length; idx++) {
    var res = results[idx];
    var ic = res.passed ? "OK" : "!!";
    console.log("  | " + pad(String(idx + 1), 4) + " |  " + ic + "   | " + pad(res.name, 44) + " |");
  }
  console.log("  +------+--------+----------------------------------------------+");

  if (failed > 0) {
    console.log("\n  Failed:");
    for (var fi = 0; fi < results.length; fi++) {
      if (!results[fi].passed) console.log("    [!!] " + results[fi].name + ": " + results[fi].error);
    }
  }

  console.log("\n  ENDPOINT REFERENCE:");
  console.log("  +----------------------------------+--------+---------------------------+");
  console.log("  | ENDPOINT                        | METHOD | RETURNS                   |");
  console.log("  +----------------------------------+--------+---------------------------+");
  console.log("  | /health                         | GET    | { status }                |");
  console.log("  | /hospitals/register             | POST   | { hospital_id, api_key }  |");
  console.log("  | /auth/login                     | POST   | { token, hospital_id }    |");
  console.log("  | /resources                      | GET    | Resource[]                |");
  console.log("  | /resources/:id                  | PATCH  | Resource                  |");
  console.log("  | /emergencies                    | POST   | Emergency                 |");
  console.log("  | /emergencies/:id                | GET    | { emergency, cases, ... } |");
  console.log("  | /emergencies/:id/cases          | POST   | Case                      |");
  console.log("  | /emergencies/:id/resolve        | PATCH  | Emergency                 |");
  console.log("  | /emergencies/:id/rounds/:r      | GET    | { bids, allocations }     |");
  console.log("  | /emergencies/:id/stream         | GET    | SSE events                |");
  console.log("  | /audit-log                      | GET    | { entries, total }        |");
  console.log("  | /settings/llm-keys              | GET    | { groq, mistral }         |");
  console.log("  | /settings/llm-keys/:p           | PUT    | { ok, provider }          |");
  console.log("  | /settings/llm-keys/:p           | DELETE | { ok, provider }          |");
  console.log("  +----------------------------------+--------+---------------------------+");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(function(err) { console.error("\nFATAL:", err); process.exit(1); });
