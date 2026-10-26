/* PR07 · Capa de dades compartida.
   - Mode Supabase: si config.js té supabaseUrl i supabaseKey, totes les dades es comparteixen en temps real.
   - Mode demostració: sense configuració, tot es guarda en aquest navegador (útil per provar-ho). */
(function () {
  "use strict";

  var CFG = window.PR07_CONFIG || {};
  var DEMO_PIN = "1234";

  function normRoom(r) { return String(r || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24).toUpperCase(); }
  function newToken() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("").toUpperCase();
  }
  function prettyToken(t) { return String(t || "").replace(/(.{4})(?=.)/g, "$1-"); }
  function nowIso() { return new Date().toISOString(); }
  function clamp(v, lo, hi, def) { v = parseInt(v, 10); if (isNaN(v)) v = def; return Math.max(lo, Math.min(hi, v)); }

  // ------------------------------------------------------------------ Mode demostració (local)
  function LocalBackend(room) {
    this.mode = "demo";
    this.room = normRoom(room);
    this.key = "pr07_demo_" + this.room;
    this.listeners = [];
    var self = this;
    try {
      this.bc = new BroadcastChannel(this.key);
      this.bc.onmessage = function () { self._emit(); };
    } catch (e) { this.bc = null; }
    window.addEventListener("storage", function (ev) { if (ev.key === self.key) self._emit(); });
  }
  LocalBackend.prototype._load = function () {
    var db = null;
    try { db = JSON.parse(localStorage.getItem(this.key) || "null"); } catch (e) { db = null; }
    if (!db) db = { claims: {}, tokens: {}, jobs: [], events: [], printer: { toner: 87, pages_total: 0, online: true, updated_at: nowIso() }, seq: 1 };
    return db;
  };
  LocalBackend.prototype._save = function (db) {
    try { localStorage.setItem(this.key, JSON.stringify(db)); } catch (e) { /* ple o bloquejat */ }
    if (this.bc) { try { this.bc.postMessage("change"); } catch (e) { /* ignore */ } }
    this._emit();
  };
  LocalBackend.prototype._emit = function () {
    var ls = this.listeners.slice();
    setTimeout(function () { ls.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }, 0);
  };
  LocalBackend.prototype._tokOk = function (db, device, token) { return !!token && token.length >= 16 && db.tokens[device] === token; };
  LocalBackend.prototype._event = function (db, device, kind, msg) {
    db.events.push({ id: db.seq++, room: this.room, device_id: device, kind: kind, message: String(msg).slice(0, 220), created_at: nowIso() });
    if (db.events.length > 200) db.events = db.events.slice(-200);
  };
  LocalBackend.prototype.claim = function (device, name, token) {
    var db = this._load(); name = String(name || "").trim().slice(0, 60);
    if (!this.room) return Promise.resolve({ ok: false, error: "sala" });
    if (name.length < 3) return Promise.resolve({ ok: false, error: "nom" });
    if (!/^[A-Z]{3}-PC0[1-9]$/.test(device)) return Promise.resolve({ ok: false, error: "dispositiu" });
    if (db.claims[device]) {
      if (this._tokOk(db, device, token)) return Promise.resolve({ ok: true, resumed: true });
      return Promise.resolve({ ok: false, error: "ocupat" });
    }
    for (var k in db.claims) if (db.claims[k].student_name.toLowerCase() === name.toLowerCase()) return Promise.resolve({ ok: false, error: "ja_tens", device: k });
    db.claims[device] = { room: this.room, device_id: device, student_name: name, claimed_at: nowIso(), updated_at: nowIso(), progress: {}, state: {} };
    db.tokens[device] = token;
    this._event(db, device, "info", name + " s'ha connectat a " + device);
    this._save(db);
    return Promise.resolve({ ok: true, resumed: false });
  };
  LocalBackend.prototype.resume = function (device, token) {
    var db = this._load();
    if (!this._tokOk(db, device, token)) return Promise.resolve({ ok: false, error: "token" });
    var c = db.claims[device];
    if (!c) return Promise.resolve({ ok: false, error: "alliberat" });
    return Promise.resolve({ ok: true, student_name: c.student_name, state: c.state, progress: c.progress });
  };
  LocalBackend.prototype.save = function (device, token, state, progress) {
    var db = this._load();
    if (!this._tokOk(db, device, token)) return Promise.resolve({ ok: false, error: "token" });
    var c = db.claims[device]; if (!c) return Promise.resolve({ ok: false, error: "alliberat" });
    if (state) c.state = state; if (progress) c.progress = progress; c.updated_at = nowIso();
    this._save(db);
    return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.submitJob = function (device, token, j) {
    var db = this._load();
    if (!this._tokOk(db, device, token)) return Promise.resolve({ ok: false, error: "token" });
    var c = db.claims[device]; if (!c) return Promise.resolve({ ok: false, error: "alliberat" });
    var pending = db.jobs.filter(function (x) { return x.device_id === device && (x.status === "queued" || x.status === "printing"); }).length;
    if (pending >= 5) return Promise.resolve({ ok: false, error: "cua_plena" });
    var job = { id: db.seq++, room: this.room, device_id: device, student_name: c.student_name,
      printer_name: String(j.printer || "").slice(0, 80), doc_name: String(j.doc || "document").slice(0, 80),
      pages: clamp(j.pages, 1, 20, 1), copies: clamp(j.copies, 1, 3, 1),
      duplex: ["none", "long", "short"].indexOf(j.duplex) !== -1 ? j.duplex : "none",
      paper: String(j.paper || "A4").slice(0, 60), protocol: String(j.protocol || "").slice(0, 10), method: String(j.method || "").slice(0, 12),
      driver_ok: j.driver_ok !== false, status: "queued", created_at: nowIso(), updated_at: nowIso() };
    db.jobs.push(job);
    if (db.jobs.length > 300) db.jobs = db.jobs.slice(-300);
    c.updated_at = nowIso();
    this._save(db);
    return Promise.resolve({ ok: true, id: job.id });
  };
  LocalBackend.prototype.logEvent = function (device, token, kind, message) {
    var db = this._load();
    if (!this._tokOk(db, device, token)) return Promise.resolve({ ok: false, error: "token" });
    var last = null;
    var msg = String(message).slice(0, 220);
    for (var i = db.events.length - 1; i >= 0; i--) if (db.events[i].device_id === device && db.events[i].kind === kind && db.events[i].message === msg) { last = db.events[i]; break; }
    if (last && Date.now() - new Date(last.created_at).getTime() < 5000) return Promise.resolve({ ok: true, skipped: true });
    this._event(db, device, kind, message);
    this._save(db);
    return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.fetchAll = function (opts) {
    var db = this._load(); opts = opts || {};
    var claims = Object.keys(db.claims).map(function (k) {
      var c = db.claims[k], o = { device_id: c.device_id, student_name: c.student_name, claimed_at: c.claimed_at, updated_at: c.updated_at, progress: c.progress };
      if (opts.withState) o.state = c.state;
      return o;
    });
    return Promise.resolve({
      claims: claims,
      jobs: db.jobs.slice(-80).reverse(),
      events: db.events.slice(-60).reverse(),
      printer: db.printer
    });
  };
  LocalBackend.prototype.subscribe = function (fn, opts) {
    var self = this; this.listeners.push(fn);
    var poll = setInterval(fn, (opts && opts.pollMs) || 5000);
    return function () { clearInterval(poll); self.listeners = self.listeners.filter(function (f) { return f !== fn; }); };
  };
  // --- docent (demo)
  LocalBackend.prototype._pin = function (pin) { return pin === DEMO_PIN; };
  LocalBackend.prototype.teacherCheck = function (pin) { return Promise.resolve(this._pin(pin) ? { ok: true } : { ok: false, error: "pin" }); };
  LocalBackend.prototype.teacherStep = function (pin) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    var db = this._load(), p = db.printer, changed = false;
    if (!p.online) return Promise.resolve({ ok: true, idle: "offline" });
    db.jobs.forEach(function (j) {
      if (j.status === "printing") {
        j.status = "done"; j.updated_at = nowIso();
        p.toner = Math.max(0, Math.round((p.toner - j.pages * j.copies * 0.25) * 10) / 10);
        p.pages_total += j.pages * j.copies; changed = true;
      }
    });
    var res = { ok: true, idle: "empty" };
    if (p.toner <= 0) res = { ok: true, idle: "toner" };
    else {
      for (var i = 0; i < db.jobs.length; i++) if (db.jobs[i].status === "queued") { db.jobs[i].status = "printing"; db.jobs[i].updated_at = nowIso(); res = { ok: true, printing: db.jobs[i].id }; changed = true; break; }
    }
    if (changed) { p.updated_at = nowIso(); this._save(db); }
    return Promise.resolve(res);
  };
  LocalBackend.prototype.teacherSetPrinter = function (pin, toner, online) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    var db = this._load();
    if (toner !== null && toner !== undefined) db.printer.toner = Math.max(0, Math.min(100, Number(toner)));
    if (online !== null && online !== undefined) db.printer.online = !!online;
    db.printer.updated_at = nowIso(); this._save(db);
    return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.teacherCancel = function (pin, id) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    var db = this._load();
    db.jobs.forEach(function (j) { if (j.id === id && (j.status === "queued" || j.status === "printing")) { j.status = "cancelled"; j.updated_at = nowIso(); } });
    this._save(db); return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.teacherClearQueue = function (pin) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    var db = this._load();
    db.jobs.forEach(function (j) { if (j.status === "queued" || j.status === "printing") { j.status = "cancelled"; j.updated_at = nowIso(); } });
    this._save(db); return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.teacherRelease = function (pin, device) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    var db = this._load(); delete db.claims[device]; delete db.tokens[device];
    this._event(db, device, "info", "El docent ha alliberat " + device);
    this._save(db); return Promise.resolve({ ok: true });
  };
  LocalBackend.prototype.teacherReset = function (pin) {
    if (!this._pin(pin)) return Promise.resolve({ ok: false, error: "pin" });
    try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ }
    this._save(this._load()); return Promise.resolve({ ok: true });
  };

  // ------------------------------------------------------------------ Mode Supabase (compartit)
  function SupabaseBackend(room) {
    this.mode = "supabase";
    this.room = normRoom(room);
    this.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  SupabaseBackend.prototype._rpc = function (fn, args) {
    return this.client.rpc(fn, args).then(function (r) {
      if (r.error) throw new Error(r.error.message || "Error del servidor");
      return r.data;
    });
  };
  SupabaseBackend.prototype.claim = function (device, name, token) { return this._rpc("pr07_claim", { p_room: this.room, p_device: device, p_name: name, p_token: token }); };
  SupabaseBackend.prototype.resume = function (device, token) { return this._rpc("pr07_resume", { p_room: this.room, p_device: device, p_token: token }); };
  SupabaseBackend.prototype.save = function (device, token, state, progress) { return this._rpc("pr07_save", { p_room: this.room, p_device: device, p_token: token, p_state: state, p_progress: progress }); };
  SupabaseBackend.prototype.submitJob = function (device, token, j) {
    return this._rpc("pr07_submit_job", { p_room: this.room, p_device: device, p_token: token, p_printer: j.printer, p_doc: j.doc,
      p_pages: j.pages, p_copies: j.copies, p_duplex: j.duplex, p_paper: j.paper, p_protocol: j.protocol, p_method: j.method, p_driver_ok: j.driver_ok !== false });
  };
  SupabaseBackend.prototype.logEvent = function (device, token, kind, message) { return this._rpc("pr07_log_event", { p_room: this.room, p_device: device, p_token: token, p_kind: kind, p_message: message }); };
  SupabaseBackend.prototype.fetchAll = function (opts) {
    opts = opts || {};
    var c = this.client, room = this.room;
    var claimCols = "device_id,student_name,claimed_at,updated_at,progress" + (opts.withState ? ",state" : "");
    function unwrap(r) { if (r.error) throw new Error(r.error.message); return r.data; }
    return Promise.all([
      c.from("pr07_claims").select(claimCols).eq("room", room).then(unwrap),
      c.from("pr07_jobs").select("*").eq("room", room).order("id", { ascending: false }).limit(80).then(unwrap),
      opts.noEvents ? Promise.resolve([]) : c.from("pr07_events").select("*").eq("room", room).order("id", { ascending: false }).limit(60).then(unwrap),
      c.from("pr07_printer").select("*").eq("room", room).maybeSingle().then(unwrap)
    ]).then(function (a) {
      return { claims: a[0] || [], jobs: a[1] || [], events: a[2] || [], printer: a[3] || { toner: 87, pages_total: 0, online: true } };
    });
  };
  SupabaseBackend.prototype.subscribe = function (fn, opts) {
    opts = opts || {};
    var tables = opts.tables || ["pr07_claims", "pr07_jobs", "pr07_events", "pr07_printer"];
    var t = null;
    function kick() { clearTimeout(t); t = setTimeout(fn, 250); }
    var ch = this.client.channel("pr07-" + this.room + "-" + Math.random().toString(36).slice(2, 8));
    var room = this.room;
    tables.forEach(function (tb) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: tb, filter: "room=eq." + room }, kick);
    });
    ch.subscribe();
    var poll = setInterval(fn, opts.pollMs || 8000);
    var client = this.client;
    return function () { clearInterval(poll); try { client.removeChannel(ch); } catch (e) { /* ignore */ } };
  };
  SupabaseBackend.prototype.teacherCheck = function (pin) { return this._rpc("pr07_teacher_check", { p_room: this.room, p_pin: pin }); };
  SupabaseBackend.prototype.teacherStep = function (pin) { return this._rpc("pr07_teacher_step", { p_room: this.room, p_pin: pin }); };
  SupabaseBackend.prototype.teacherSetPrinter = function (pin, toner, online) { return this._rpc("pr07_teacher_set_printer", { p_room: this.room, p_pin: pin, p_toner: toner, p_online: online }); };
  SupabaseBackend.prototype.teacherCancel = function (pin, id) { return this._rpc("pr07_teacher_cancel", { p_room: this.room, p_pin: pin, p_job: id }); };
  SupabaseBackend.prototype.teacherClearQueue = function (pin) { return this._rpc("pr07_teacher_clear_queue", { p_room: this.room, p_pin: pin }); };
  SupabaseBackend.prototype.teacherRelease = function (pin, device) { return this._rpc("pr07_teacher_release", { p_room: this.room, p_pin: pin, p_device: device }); };
  SupabaseBackend.prototype.teacherReset = function (pin) { return this._rpc("pr07_teacher_reset", { p_room: this.room, p_pin: pin }); };

  function isConfigured() { return !!(CFG.supabaseUrl && CFG.supabaseKey); }

  window.PR07_BACKEND = {
    normRoom: normRoom,
    newToken: newToken,
    prettyToken: prettyToken,
    isConfigured: isConfigured,
    create: function (room) {
      if (isConfigured()) {
        if (!window.supabase || !window.supabase.createClient) throw new Error("No s'ha pogut carregar la llibreria de Supabase.");
        return new SupabaseBackend(room);
      }
      return new LocalBackend(room);
    }
  };
})();
