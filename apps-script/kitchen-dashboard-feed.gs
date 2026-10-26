/**
 * WSLR Kitchen Dashboard feed
 *
 * Reads the Meal Planner's own sheet (the "Functions Staff Roster" workbook)
 * and hands the kitchen app every saved plan: each meal's day, time, dish,
 * guests, notes, dietary counts and shopping lines, plus the planner's own
 * "Plan check" list (what no longer matches the group's confirmation form).
 * The kitchen Dashboard shows the next meal from this and flags any check
 * for that meal in a red box.
 *
 * People's names are never sent: dietary details go out as counts and
 * descriptions only, because the kitchen app is a public page.
 *
 * SETUP (once, about 3 minutes)
 *   1. Go to script.google.com and click New project.
 *   2. Delete what is there, paste this whole file in, and click Save.
 *   3. Click Deploy, New deployment, the cog next to "Select type", Web app.
 *      Execute as: Me. Who has access: Anyone. Click Deploy and allow access.
 *   4. Copy the Web app URL (it ends in /exec) and send it to Claude, or paste
 *      it in the kitchen app under Admin, Settings, Meal Planner feed.
 * After changing this code later: Deploy, Manage deployments, the pencil,
 * Version: New version, Deploy. The URL stays the same.
 */

var PLANNER_SHEET_ID = "1o9cK1klY8x2zqU4HTLAAUadluWbhinYsLCpqz2P6PpM";
var SHARED_KEY = "";          // optional: set a word here and in the kitchen app
var CACHE_SECONDS = 60;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.ping) return out_({ ping: "ok" });
  if (SHARED_KEY && p.key !== SHARED_KEY) return out_({ ok: false, error: "Wrong key" });
  var cache = CacheService.getScriptCache();
  var hit = p.fresh ? null : cache.get("feed");
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var body;
  try {
    body = JSON.stringify(buildFeed_());
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
  try { if (body.length < 90000) cache.put("feed", body, CACHE_SECONDS); } catch (err) {}
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function buildFeed_() {
  var ss = SpreadsheetApp.openById(PLANNER_SHEET_ID);
  var forms = readForms_(ss);
  return { ok: true, at: new Date().toISOString(), plans: readPlans_(ss, forms) };
}

/* Kitchen emails tab: Ref | Group | Form as last emailed (JSON) | Checked | Last email | Plan check (JSON) */
function readForms_(ss) {
  var out = {};
  var sh = ss.getSheetByName("Kitchen emails");
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
    var group = String(r[1] || "").trim();
    if (!group) return;
    var form = {}, checks = [];
    try { form = JSON.parse(r[2] || "{}"); } catch (err) {}
    try { checks = JSON.parse(r[5] || "[]"); } catch (err) {}
    out[group.toLowerCase()] = {
      ref: String(r[0] || ""),
      status: form.status || "",
      form: form.form || "",
      checks: Array.isArray(checks) ? checks.map(String) : []
    };
  });
  return out;
}

/* Plans tab: the plan JSON sits in column L; extra rows for later days carry no JSON */
function readPlans_(ss, forms) {
  var sh = ss.getSheetByName("Plans");
  if (!sh || sh.getLastRow() < 2) return [];
  var width = Math.max(12, sh.getLastColumn());
  var plans = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues().forEach(function (r) {
    var id = String(r[0] || "").trim();
    var json = r.slice(11).filter(function (x) { return x !== "" && x != null; }).join("");
    if (!id || !json) return;
    var plan;
    try { plan = JSON.parse(json); } catch (err) { return; }
    var name = String(plan.name || r[2] || "Group");
    var f = forms[name.trim().toLowerCase()] || {};
    plans.push({
      id: id,
      name: name,
      status: f.status || "",
      form: f.form || "",
      checks: f.checks || [],
      services: (plan.services || []).map(cleanService_),
      lines: ((plan.shopping && plan.shopping.lines) || []).map(function (l) {
        return { n: String(l.n || ""), qty: String(l.qty == null ? "" : l.qty), sup: l.sup || "", c: l.c || "", forWhat: String(l.forWhat || ""), est: !!l.est };
      })
    });
  });
  return plans;
}

function cleanService_(s) {
  var counts = {}, details = {};
  try { counts = typeof s.diets === "string" ? JSON.parse(s.diets) : (s.diets || {}); } catch (err) {}
  var info = {};
  try { info = typeof s.dietInfo === "string" ? JSON.parse(s.dietInfo) : (s.dietInfo || {}); } catch (err) {}
  Object.keys(info).forEach(function (k) {
    if (info[k] && info[k].nums) details[k] = stripListedAs_(String(info[k].nums));   // descriptions only, no names
  });
  return {
    id: s.id,
    day: String(s.day || ""),
    min: Number(s.svcMin) || 0,
    mealId: String(s.mealId || ""),
    mealName: String(s.mealName || ""),
    guests: Number(s.guests) || 0,
    note: stripListedAs_(stripNames_(String(s.note || ""))),
    diets: counts,
    dietNotes: details
  };
}

/* office notes like (listed as "Mia Eang" on form) name the person, so they go */
function stripListedAs_(s) {
  return s.replace(/\s*\((?:listed|named|called|spelt|spelled)\b[^)]*\)/gi, "");
}

/* "Other dietaries: Jo Bloggs: Shellfish allergy (No shellfish); ..." -> keep the needs, drop the names */
function stripNames_(note) {
  return note.split("\n").map(function (line) {
    var m = line.match(/^Other dietaries:\s*(.*)$/i);
    if (!m) return line;
    return "Other dietaries: " + m[1].split(/;\s*/).map(function (part) {
      var i = part.indexOf(": ");
      return i > -1 ? part.slice(i + 2) : part;
    }).join("; ");
  }).join("\n");
}
