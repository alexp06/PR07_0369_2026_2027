/* PR07 · Pantalla del docent (projector): mapa de xarxa en viu, cua compartida, motor d'impressió, tallafoc i progrés */
(function () {
  "use strict";
  var D = window.PR07_DATA, B = window.PR07_BACKEND, CFG = window.PR07_CONFIG || {};
  var SVGNS = "http://www.w3.org/2000/svg";

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v; else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
    }
    (Array.isArray(kids) ? kids : (kids == null ? [] : [kids])).forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function s(tag, attrs, kids) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) { if (k === "text") el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function $(sel) { return document.querySelector(sel); }
  function t2(iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); }
  function first(n) { return String(n || "").trim().split(/\s+/)[0]; }

  var T = {
    room: B.normRoom(new URLSearchParams(location.search).get("sala") || CFG.defaultRoom || "ASIXB"),
    pin: null, backend: null, data: { claims: [], jobs: [], events: [], printer: { toner: 87, pages_total: 0, online: true } },
    seenJobs: null, seenEvents: null, jobStatus: {}, engine: null, speed: 5, detail: null, tab: "progress"
  };

  // ------------------------------------------------------------------ entrada
  function login(msg) {
    document.body.className = "t-login";
    var app = $("#app"); app.innerHTML = "";
    var roomIn = h("input", { class: "t-input", value: T.room, maxlength: "24", "aria-label": "Sala" });
    var pinIn = h("input", { class: "t-input", type: "password", autocomplete: "off", "aria-label": "PIN del docent" });
    var err = h("div", { class: "t-err", role: "alert", text: msg || "" });
    function go() {
      T.room = B.normRoom(roomIn.value) || T.room;
      try { T.backend = B.create(T.room); } catch (e) { err.textContent = e.message; return; }
      T.backend.teacherCheck(pinIn.value).then(function (r) {
        if (!r || !r.ok) { err.textContent = "PIN incorrecte."; return; }
        T.pin = pinIn.value;
        try { sessionStorage.setItem("pr07_teacher_" + T.room, T.pin); } catch (e) { /* ignore */ }
        var u = new URL(location.href); u.searchParams.set("sala", T.room); history.replaceState(null, "", u.toString());
        start();
      }).catch(function (e) { err.textContent = "No es pot connectar amb el servidor: " + e.message; });
    }
    pinIn.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    app.appendChild(h("div", { class: "t-login-card" }, [
      h("div", { class: "t-brand" }, [h("span", { class: "t-mark", text: "BT" }), h("div", {}, [h("div", { class: "t-brand-name", text: D.company }), h("div", { class: "t-brand-sub", text: "Centre de control de la xarxa · Docent" })])]),
      h("label", { class: "t-field" }, ["Sala", roomIn]),
      h("label", { class: "t-field" }, ["PIN del docent", pinIn]),
      err,
      h("button", { class: "t-btn primary", type: "button", text: "Entra", onclick: go }),
      B.isConfigured() ? null : h("p", { class: "t-demo", text: "Mode demostració (sense servidor): el PIN de prova és 1234 i només veuràs l'alumnat que faci servir aquest mateix navegador." })
    ]));
    pinIn.focus();
  }

  // ------------------------------------------------------------------ pantalla principal
  function start() {
    document.body.className = "t-main";
    var app = $("#app"); app.innerHTML = "";
    var studentUrl = new URL("./?sala=" + encodeURIComponent(T.room), location.href).href;
    app.appendChild(h("header", { class: "t-head" }, [
      h("div", { class: "t-head-l" }, [h("span", { class: "t-mark sm", text: "BT" }), h("div", {}, [h("strong", { text: D.company + " · Centre de control" }), h("div", { class: "t-sub", text: "Sala " + T.room + " · alumnat: " + studentUrl })])]),
      h("div", { class: "t-head-r" }, [
        h("span", { class: "t-pill " + (T.backend.mode === "demo" ? "demo" : "live"), id: "tConn", text: T.backend.mode === "demo" ? "Mode demostració" : "En línia" }),
        h("button", { class: "t-btn", type: "button", text: "Mode projector", onclick: function () { document.body.classList.toggle("proj"); if (document.body.classList.contains("proj") && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } }),
        h("button", { class: "t-btn danger", type: "button", text: "Reinicia la partida", onclick: resetGame }),
        h("button", { class: "t-btn", type: "button", text: "Surt", onclick: function () { try { sessionStorage.removeItem("pr07_teacher_" + T.room); } catch (e) { /* ignore */ } location.reload(); } })
      ])
    ]));
    app.appendChild(h("main", { class: "t-grid" }, [
      h("section", { class: "t-card t-map", "aria-label": "Mapa de xarxa" }, [h("div", { id: "mapWrap" })]),
      h("aside", { class: "t-side" }, [
        h("section", { class: "t-card", id: "printerCard", "aria-label": "Impressora" }),
        h("section", { class: "t-card t-queue", "aria-label": "Cua d'impressió" }, [h("h2", { text: "Cua de la impressora" }), h("ol", { id: "queueList", class: "q-list" })])
      ]),
      h("section", { class: "t-card t-bottom" }, [
        h("div", { class: "t-tabs", role: "tablist" }, [
          tabBtn("progress", "Progrés de l'alumnat"), tabBtn("fw", "Registre del tallafoc"),
          h("button", { class: "t-btn sm csv", type: "button", text: "Exporta CSV", onclick: exportCsv })
        ]),
        h("div", { id: "bottomPanel" })
      ])
    ]));
    app.appendChild(h("div", { id: "detail", class: "t-detail", hidden: true }));
    buildMap();
    refresh();
    T.unsub = T.backend.subscribe(refresh, { pollMs: 6000 });
    setEngine();
  }
  function tabBtn(id, label) { return h("button", { class: "t-tab" + (T.tab === id ? " active" : ""), role: "tab", type: "button", "data-tab": id, text: label, onclick: function () { T.tab = id; document.querySelectorAll(".t-tab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === id); }); renderBottom(); } }); }

  function refresh() {
    return T.backend.fetchAll({ withState: true }).then(function (d) {
      var first = T.seenJobs === null;
      if (first) { T.seenJobs = {}; T.seenEvents = {}; d.jobs.forEach(function (j) { T.seenJobs[j.id] = 1; T.jobStatus[j.id] = j.status; }); d.events.forEach(function (e) { T.seenEvents[e.id] = 1; }); }
      else {
        d.jobs.slice().reverse().forEach(function (j) {
          if (!T.seenJobs[j.id]) { T.seenJobs[j.id] = 1; packet(j.device_id, j.driver_ok ? "ok" : "bad"); }
          if (T.jobStatus[j.id] !== j.status && j.status === "printing") pulsePrinter();
          T.jobStatus[j.id] = j.status;
        });
        d.events.slice().reverse().forEach(function (e) { if (!T.seenEvents[e.id]) { T.seenEvents[e.id] = 1; if (e.kind === "deny") packet(e.device_id, "deny"); } });
      }
      T.data = d;
      setConn(true);
      renderMap(); renderPrinter(); renderQueue(); renderBottom();
      if (T.detail) renderDetail();
    }).catch(function () { setConn(false); });
  }
  function setConn(ok) { var el = $("#tConn"); if (!el || T.backend.mode === "demo") return; el.textContent = ok ? "En línia" : "Sense connexió"; el.className = "t-pill " + (ok ? "live" : "off"); }

  // ------------------------------------------------------------------ motor de la impressora
  function setEngine() {
    if (T.engine) clearInterval(T.engine);
    T.engine = setInterval(function () {
      if (!T.data.printer || T.data.printer.online === false) return;
      var busy = T.data.jobs.some(function (j) { return j.status === "queued" || j.status === "printing"; });
      if (!busy) return;
      T.backend.teacherStep(T.pin).then(function (r) { if (r && r.ok === false && r.error === "pin") login("La sessió ha caducat. Torna a entrar."); else refresh(); }).catch(function () { setConn(false); });
    }, T.speed * 1000);
  }
  function act(promise) { return promise.then(function (r) { if (r && r.ok === false) alertMsg("No s'ha pogut fer l'acció (" + (r.error || "error") + ")."); refresh(); }).catch(function (e) { alertMsg("Error de connexió: " + e.message); }); }
  function alertMsg(m) { var el = $("#printerCard .t-msg"); if (el) el.textContent = m; }

  function resetGame() {
    var box = $("#detail");
    box.hidden = false; box.innerHTML = "";
    var input = h("input", { class: "t-input", "aria-label": "Escriu REINICIA per confirmar" });
    box.appendChild(h("div", { class: "t-dlg" }, [
      h("h2", { text: "Reiniciar la partida de la sala " + T.room }),
      h("p", { text: "S'esborraran tots els dispositius agafats, la cua, el registre del tallafoc i el progrés de l'alumnat d'aquesta sala. No es pot desfer." }),
      h("label", { class: "t-field" }, ["Escriu REINICIA per confirmar", input]),
      h("div", { class: "t-actions" }, [
        h("button", { class: "t-btn danger", type: "button", text: "Reinicia", onclick: function () { if (input.value.trim().toUpperCase() !== "REINICIA") { input.focus(); return; } T.seenJobs = null; box.hidden = true; T.detail = null; act(T.backend.teacherReset(T.pin)); } }),
        h("button", { class: "t-btn", type: "button", text: "Cancel·la", onclick: function () { box.hidden = true; } })
      ])
    ]));
    input.focus();
  }

  // ------------------------------------------------------------------ mapa de xarxa (SVG)
  var POS = { ADM: [30, 20], COM: [420, 20], RRH: [810, 20], LOG: [30, 510], DEV: [420, 510], DIR: [810, 510] };
  var BW = 360, BH = 170, FW = { x: 520, y: 305, w: 160, h: 90 }, ZC = { x: 790, y: 258, w: 380, h: 184 }, PRN = { x: 905, y: 352 };
  function deptAnchor(id) { var p = POS[id]; return p[1] < 300 ? [p[0] + BW / 2, p[1] + BH] : [p[0] + BW / 2, p[1]]; }
  function tileCenter(devId) {
    var dv = D.deviceById(devId); if (!dv) return null;
    var idx = D.devices.filter(function (x) { return x.dept === dv.dept; }).indexOf(dv);
    var p = POS[dv.dept]; return [p[0] + 15 + idx * 115 + 52, p[1] + 58 + 48];
  }
  function buildMap() {
    var svg = s("svg", { viewBox: "0 0 1200 700", class: "netsvg", role: "img", "aria-label": "Mapa de la xarxa de l'empresa" });
    var links = s("g", { class: "links" });
    D.departments.forEach(function (dp) {
      var a = deptAnchor(dp.id), fy = POS[dp.id][1] < 300 ? FW.y : FW.y + FW.h;
      links.appendChild(s("path", { d: "M" + a[0] + " " + a[1] + " L" + (FW.x + FW.w / 2) + " " + fy, class: "link", stroke: dp.color }));
    });
    links.appendChild(s("path", { d: "M" + (FW.x + FW.w) + " " + (FW.y + FW.h / 2) + " L" + ZC.x + " " + (FW.y + FW.h / 2), class: "link zc" }));
    svg.appendChild(links);
    // firewall
    svg.appendChild(s("g", { class: "fw", id: "fwNode" }, [
      s("rect", { x: FW.x, y: FW.y, width: FW.w, height: FW.h, rx: 14 }),
      s("text", { x: FW.x + FW.w / 2, y: FW.y + 38, "text-anchor": "middle", class: "fw-t", text: "FW-CORE" }),
      s("text", { x: FW.x + FW.w / 2, y: FW.y + 62, "text-anchor": "middle", class: "fw-s", text: "Router · Tallafoc" })
    ]));
    // estadístiques (esquerra)
    svg.appendChild(s("g", { class: "stats-bg" }, [
      s("rect", { x: 30, y: 258, width: 370, height: 184, rx: 16, class: "stats-r" }),
      s("text", { x: 46, y: 284, class: "zone-t", text: "Resum de la partida" })
    ]));
    svg.appendChild(s("g", { class: "stats", id: "statsNode" }));
    // zona comuna
    svg.appendChild(s("g", { class: "zone" }, [
      s("rect", { x: ZC.x, y: ZC.y, width: ZC.w, height: ZC.h, rx: 16, class: "zone-r" }),
      s("text", { x: ZC.x + 16, y: ZC.y + 26, class: "zone-t", text: "Zona comuna · VLAN 100 · " + D.commonZone.net + "/24" }),
      s("text", { x: PRN.x, y: PRN.y + 18, "text-anchor": "middle", class: "prn-ico", id: "prnIco", text: "🖨" }),
      s("text", { x: PRN.x, y: PRN.y + 44, "text-anchor": "middle", class: "zone-s", text: D.printer.host.toUpperCase() + " · " + D.printer.ip }),
      s("g", { id: "prnStatus" }),
      s("text", { x: ZC.x + ZC.w - 70, y: PRN.y + 4, "text-anchor": "middle", class: "dns-ico", text: "🗄" }),
      s("text", { x: ZC.x + ZC.w - 70, y: PRN.y + 36, "text-anchor": "middle", class: "zone-s", text: "DNS " + D.dns.ip })
    ]));
    // departaments
    D.departments.forEach(function (dp) {
      var p = POS[dp.id];
      var g = s("g", { class: "dept" }, [
        s("rect", { x: p[0], y: p[1], width: BW, height: BH, rx: 16, class: "dept-r", stroke: dp.color }),
        s("rect", { x: p[0], y: p[1], width: BW, height: 44, rx: 16, fill: dp.color, class: "dept-h" }),
        s("rect", { x: p[0], y: p[1] + 28, width: BW, height: 16, fill: dp.color }),
        s("text", { x: p[0] + 16, y: p[1] + 28, class: "dept-t", text: dp.name }),
        s("text", { x: p[0] + BW - 14, y: p[1] + 28, "text-anchor": "end", class: "dept-s", text: "VLAN " + dp.vlan + " · " + dp.proto + " " + dp.port })
      ]);
      g.appendChild(s("g", { id: "tiles-" + dp.id }));
      svg.appendChild(g);
    });
    svg.appendChild(s("g", { id: "packets" }));
    $("#mapWrap").innerHTML = ""; $("#mapWrap").appendChild(svg);
  }
  function progressCount(c) { return D.missions.filter(function (m) { return c && c.progress && c.progress[m.id]; }).length; }
  function renderMap() {
    var claims = {}; T.data.claims.forEach(function (c) { claims[c.device_id] = c; });
    D.departments.forEach(function (dp) {
      var g = document.getElementById("tiles-" + dp.id); if (!g) return;
      while (g.firstChild) g.removeChild(g.firstChild);
      var p = POS[dp.id];
      D.devices.filter(function (d) { return d.dept === dp.id; }).forEach(function (dv, i) {
        var c = claims[dv.id], x = p[0] + 15 + i * 115, y = p[1] + 58, n = progressCount(c), done = n === D.missions.length;
        var tile = s("g", { class: "tile" + (c ? " on" : "") + (done ? " done" : ""), tabindex: c ? "0" : null, role: c ? "button" : null, "aria-label": c ? dv.id + " " + c.student_name : dv.id + " lliure" }, [
          s("rect", { x: x, y: y, width: 105, height: 96, rx: 10, class: "tile-r", stroke: c ? dp.color : null }),
          s("text", { x: x + 52, y: y + 20, "text-anchor": "middle", class: "tile-id", text: dv.id }),
          s("text", { x: x + 52, y: y + 44, "text-anchor": "middle", class: "tile-name", text: c ? first(c.student_name).slice(0, 12) : "lliure" }),
          s("text", { x: x + 52, y: y + 62, "text-anchor": "middle", class: "tile-ip", text: dv.ip })
        ]);
        if (c) {
          D.missions.forEach(function (m, k) { tile.appendChild(s("circle", { cx: x + 22 + k * 12.2, cy: y + 80, r: 4.2, class: c.progress && c.progress[m.id] ? "pd on" : "pd" })); });
          tile.addEventListener("click", function () { T.detail = dv.id; renderDetail(); });
          tile.addEventListener("keydown", function (e) { if (e.key === "Enter") { T.detail = dv.id; renderDetail(); } });
        }
        g.appendChild(tile);
      });
    });
    // estadístiques
    var st = document.getElementById("statsNode"); while (st.firstChild) st.removeChild(st.firstChild);
    var q = T.data.jobs.filter(function (j) { return j.status === "queued" || j.status === "printing"; }).length;
    var done = T.data.jobs.filter(function (j) { return j.status === "done"; }).length;
    var deny = T.data.events.filter(function (e) { return e.kind === "deny"; }).length;
    var finished = T.data.claims.filter(function (c) { return progressCount(c) === D.missions.length; }).length;
    [["Alumnes connectats", T.data.claims.length], ["Documents a la cua", q], ["Documents impresos", done], ["Bloquejos del tallafoc", deny], ["Missions completes", finished + " / " + T.data.claims.length]].forEach(function (r, i) {
      st.appendChild(s("text", { x: 46, y: 314 + i * 27, class: "st-k", text: r[0] }));
      st.appendChild(s("text", { x: 384, y: 314 + i * 27, "text-anchor": "end", class: "st-v" + (i === 3 && r[1] ? " deny" : ""), text: String(r[1]) }));
    });
    // estat impressora al mapa
    var ps = document.getElementById("prnStatus"); while (ps.firstChild) ps.removeChild(ps.firstChild);
    var pr = T.data.printer || {}, toner = Math.max(0, Math.min(100, Number(pr.toner)));
    var printing = T.data.jobs.some(function (j) { return j.status === "printing"; });
    var label = pr.online === false ? "Fora de línia" : (toner <= 0 ? "Tòner esgotat" : (printing ? "Imprimint…" : "Preparada"));
    ps.appendChild(s("rect", { x: ZC.x + 16, y: ZC.y + ZC.h - 26, width: 200, height: 10, rx: 5, class: "tn-bg" }));
    ps.appendChild(s("rect", { x: ZC.x + 16, y: ZC.y + ZC.h - 26, width: 2 * toner, height: 10, rx: 5, class: "tn-fg" + (toner < 15 ? " low" : "") }));
    ps.appendChild(s("text", { x: ZC.x + 226, y: ZC.y + ZC.h - 16, class: "zone-s", text: "Tòner " + Math.round(toner) + "% · " + label }));
  }
  function packet(devId, kind) {
    var c = tileCenter(devId), g = document.getElementById("packets");
    if (!c || !g) return;
    var dv = D.deviceById(devId), a = deptAnchor(dv.dept), fx = FW.x + FW.w / 2, fy = FW.y + FW.h / 2;
    var d = "M" + c[0] + " " + c[1] + " L" + a[0] + " " + a[1] + " L" + fx + " " + fy + (kind === "deny" ? "" : " L" + ZC.x + " " + fy + " L" + PRN.x + " " + PRN.y);
    var dur = kind === "deny" ? 1.1 : 1.9;
    var dot = s("circle", { r: 9, class: "pk " + kind });
    var anim = s("animateMotion", { dur: dur + "s", fill: "freeze", path: d });
    dot.appendChild(anim); g.appendChild(dot);
    try { anim.beginElement(); } catch (e) { /* ignore */ }
    setTimeout(function () {
      dot.remove();
      if (kind === "deny") {
        var x = s("text", { x: fx, y: fy + 12, "text-anchor": "middle", class: "deny-x", text: "✕" });
        g.appendChild(x); setTimeout(function () { x.remove(); }, 1200);
        var fw = document.getElementById("fwNode"); fw.classList.add("hit"); setTimeout(function () { fw.classList.remove("hit"); }, 700);
      } else pulsePrinter();
    }, dur * 1000);
  }
  function pulsePrinter() { var p = document.getElementById("prnIco"); if (!p) return; p.classList.remove("pulse"); void p.getBBox(); p.classList.add("pulse"); }

  // ------------------------------------------------------------------ impressora i cua
  function renderPrinter() {
    var card = $("#printerCard"); if (!card) return;
    var pr = T.data.printer || {}, toner = Math.round(Number(pr.toner));
    card.innerHTML = "";
    card.appendChild(h("div", { class: "pc-head" }, [h("h2", { text: D.printer.model }), h("span", { class: "t-pill " + (pr.online === false ? "off" : "live"), text: pr.online === false ? "Fora de línia" : "En línia" })]));
    card.appendChild(h("div", { class: "pc-toner" }, [h("span", { text: "Tòner" }), h("div", { class: "tb" }, h("div", { class: toner < 15 ? "low" : "", style: "width:" + Math.max(0, Math.min(100, toner)) + "%" })), h("strong", { text: toner + "%" })]));
    card.appendChild(h("div", { class: "pc-meta", text: "Pàgines impreses: " + (pr.pages_total || 0) + " · IP " + D.printer.ip }));
    var speed = h("select", { class: "t-input sm", "aria-label": "Velocitat de la impressora", onchange: function (e) { T.speed = parseInt(e.target.value, 10); setEngine(); } },
      [[3, "Ràpida (3 s)"], [5, "Normal (5 s)"], [10, "Lenta (10 s)"]].map(function (o) { return h("option", { value: o[0], text: o[1], selected: o[0] === T.speed ? true : null }); }));
    card.appendChild(h("div", { class: "pc-actions" }, [
      h("button", { class: "t-btn", type: "button", text: pr.online === false ? "Encén la impressora" : "Posa fora de línia", onclick: function () { act(T.backend.teacherSetPrinter(T.pin, null, pr.online === false)); } }),
      h("button", { class: "t-btn", type: "button", text: "Recarrega el tòner", onclick: function () { act(T.backend.teacherSetPrinter(T.pin, 100, null)); } }),
      h("button", { class: "t-btn", type: "button", text: "Buida la cua", onclick: function () { act(T.backend.teacherClearQueue(T.pin)); } }),
      speed
    ]));
    card.appendChild(h("p", { class: "t-note", text: "La impressora només imprimeix mentre aquesta pantalla està oberta." }));
    card.appendChild(h("div", { class: "t-msg", role: "status" }));
  }
  var METHOD = { gui: "Aplicació", consola: "Consola", prova: "Pàgina de prova" };
  function renderQueue() {
    var ol = $("#queueList"); if (!ol) return;
    ol.innerHTML = "";
    var active = T.data.jobs.filter(function (j) { return j.status === "printing" || j.status === "queued"; }).sort(function (a, b) { return a.id - b.id; });
    var recent = T.data.jobs.filter(function (j) { return j.status === "done" || j.status === "cancelled"; }).slice(0, 8);
    if (!active.length && !recent.length) { ol.appendChild(h("li", { class: "q-empty", text: "Encara no ha arribat cap document." })); return; }
    active.concat(recent).forEach(function (j) {
      var dept = D.deptById((D.deviceById(j.device_id) || {}).dept) || { color: "#888" };
      ol.appendChild(h("li", { class: "qi st-" + j.status + (j.driver_ok ? "" : " bad") }, [
        h("span", { class: "qi-bar", style: "background:" + dept.color }),
        h("div", { class: "qi-main" }, [
          h("div", { class: "qi-doc", text: j.doc_name }),
          h("div", { class: "qi-who", text: first(j.student_name) + " · " + j.device_id + " · " + t2(j.created_at) }),
          h("div", { class: "qi-tags" }, [
            h("span", { class: "tag", text: j.protocol || "?" }), h("span", { class: "tag", text: METHOD[j.method] || j.method }),
            j.duplex !== "none" ? h("span", { class: "tag ok", text: "Doble cara" }) : null,
            j.paper && j.paper !== "A4" ? h("span", { class: "tag", text: j.paper }) : null,
            j.driver_ok ? null : h("span", { class: "tag bad", text: "Controlador incorrecte" }),
            j.copies > 1 ? h("span", { class: "tag", text: j.copies + " còpies" }) : null
          ])
        ]),
        h("div", { class: "qi-st" }, [
          h("span", { text: { queued: "En cua", printing: "Imprimint", done: j.driver_ok ? "Imprès" : "Imprès ⚠", cancelled: "Cancel·lat" }[j.status] }),
          j.status === "queued" || j.status === "printing" ? h("button", { class: "t-btn xs", type: "button", title: "Cancel·la", "aria-label": "Cancel·la " + j.doc_name, text: "✕", onclick: function () { act(T.backend.teacherCancel(T.pin, j.id)); } }) : null
        ])
      ]));
    });
  }

  // ------------------------------------------------------------------ progrés i tallafoc
  function renderBottom() {
    var panel = $("#bottomPanel"); if (!panel) return;
    panel.innerHTML = "";
    if (T.tab === "fw") {
      var ev = T.data.events;
      if (!ev.length) { panel.appendChild(h("p", { class: "q-empty", text: "Encara no hi ha cap esdeveniment." })); return; }
      panel.appendChild(h("ul", { class: "fw-log" }, ev.map(function (e) { return h("li", { class: e.kind }, [h("span", { class: "fw-t", text: t2(e.created_at) }), h("span", { class: "fw-k", text: e.kind === "deny" ? "BLOQUEIG" : "INFO" }), h("span", { class: "fw-m", text: e.message })]); })));
      return;
    }
    var claims = T.data.claims.slice().sort(function (a, b) { return a.device_id < b.device_id ? -1 : 1; });
    if (!claims.length) { panel.appendChild(h("p", { class: "q-empty", text: "Encara no s'ha connectat cap alumne. Comparteix l'enllaç de l'alumnat amb el codi de sala " + T.room + "." })); return; }
    var head = ["Alumne", "Dispositiu", "Departament"].concat(D.missions.map(function (m, i) { return "M" + (i + 1); })).concat(["★", "Última activitat", ""]);
    var tbody = h("tbody", {}, claims.map(function (c) {
      var dv = D.deviceById(c.device_id) || {}, dp = D.deptById(dv.dept) || {};
      return h("tr", {}, [
        h("td", {}, h("button", { class: "t-link", type: "button", text: c.student_name, onclick: function () { T.detail = c.device_id; renderDetail(); } })),
        h("td", { class: "mono", text: c.device_id }),
        h("td", {}, [h("span", { class: "dot", style: "background:" + dp.color }), dp.name || ""]),
      ].concat(D.missions.map(function (m) { var v = c.progress && c.progress[m.id]; return h("td", { class: "pm" + (v ? " on" : ""), title: v ? "Completada a les " + t2(v) : "Pendent", text: v ? "✓" : "·" }); }))
        .concat([h("td", { class: "pm" + (c.progress && c.progress.bonus ? " on" : ""), text: c.progress && c.progress.bonus ? "★" : "·" }), h("td", { class: "mono", text: t2(c.updated_at) }),
          h("td", {}, h("button", { class: "t-btn xs", type: "button", text: "Allibera", title: "Allibera el dispositiu (l'alumne en perd el progrés)", onclick: function () { if (confirmInline(this)) act(T.backend.teacherRelease(T.pin, c.device_id)); } }))]));
    }));
    panel.appendChild(h("div", { class: "t-table-wrap" }, h("table", { class: "t-table" }, [h("thead", {}, h("tr", {}, head.map(function (x) { return h("th", { text: x }); }))), tbody])));
    panel.appendChild(h("p", { class: "t-note", text: "M1 Xarxa · M2 Impressora instal·lada i pàgina de prova · M3 Doble cara · M4 Impressió per consola · M5 Mida «Carta de [nom]» · M6 Tòner a la interfície web · ★ Repte final" }));
  }
  function confirmInline(btn) {
    if (btn.getAttribute("data-c") === "1") return true;
    btn.setAttribute("data-c", "1"); btn.textContent = "Confirma"; btn.classList.add("danger");
    setTimeout(function () { if (btn.isConnected) { btn.setAttribute("data-c", "0"); btn.textContent = "Allibera"; btn.classList.remove("danger"); } }, 3500);
    return false;
  }
  function exportCsv() {
    var rows = [["Alumne", "Dispositiu", "Departament"].concat(D.missions.map(function (m, i) { return "M" + (i + 1) + " " + m.title.replace("[el teu nom]", "nom"); })).concat(["Repte final", "Missions completades", "Última activitat"])];
    T.data.claims.slice().sort(function (a, b) { return a.student_name.localeCompare(b.student_name); }).forEach(function (c) {
      var dp = D.deptById((D.deviceById(c.device_id) || {}).dept) || {};
      rows.push([c.student_name, c.device_id, dp.name || ""].concat(D.missions.map(function (m) { return c.progress && c.progress[m.id] ? t2(c.progress[m.id]) : ""; }))
        .concat([c.progress && c.progress.bonus ? t2(c.progress.bonus) : "", String(progressCount(c)), new Date(c.updated_at).toLocaleString("ca-ES")]));
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
    var a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: "PR07_progres_" + T.room + "_" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------ detall d'un alumne (per ajudar-lo o validar)
  function renderDetail() {
    var box = $("#detail"); if (!box) return;
    var c = T.data.claims.filter(function (x) { return x.device_id === T.detail; })[0];
    if (!c) { box.hidden = true; T.detail = null; return; }
    var dv = D.deviceById(c.device_id), dp = D.deptById(dv.dept), st = c.state || {}, net = st.net || {};
    box.hidden = false; box.innerHTML = "";
    var printers = (st.printers || []);
    var lastErr = (st.localJobs || []).filter(function (j) { return j.status === "error"; }).slice(0, 4);
    box.appendChild(h("div", { class: "t-dlg wide", role: "dialog", "aria-label": "Detall de " + c.student_name }, [
      h("div", { class: "dl-head" }, [h("div", {}, [h("h2", { text: c.student_name }), h("div", { class: "t-sub", text: c.device_id + " · " + dp.name + " · VLAN " + dp.vlan })]), h("button", { class: "t-btn", type: "button", text: "Tanca", onclick: function () { T.detail = null; box.hidden = true; } })]),
      h("div", { class: "dl-grid" }, [
        h("div", {}, [h("h3", { text: "Configuració IPv4" }), kvTable([
          ["Mode", net.mode === "static" ? "Estàtica" : "DHCP (APIPA)"], ["IP", (net.ip || "—") + (net.ip && net.ip !== dv.ip ? "  ✗ (assignada: " + dv.ip + ")" : "")],
          ["Màscara", (net.mask || "—") + (net.mask && net.mask !== dp.mask ? "  ✗ (" + dp.mask + ")" : "")], ["Passarel·la", (net.gw || "—") + (net.gw && net.gw !== dp.gw ? "  ✗ (" + dp.gw + ")" : "")],
          ["DNS", [net.dns1, net.dns2].filter(Boolean).join(", ") || "—"], ["Protocol permès", dp.proto + " (" + dp.port + "/tcp)"]
        ])]),
        h("div", {}, [h("h3", { text: "Impressores instal·lades" }), printers.length ? h("ul", { class: "dl-list" }, printers.map(function (p) {
          var port = p.port || {};
          return h("li", {}, [h("strong", { text: p.name + (p.isDefault ? " (predeterminada)" : "") }), h("div", { text: "Controlador: " + p.driver }),
            h("div", { class: "mono", text: port.proto === "IPP" ? "IPP · " + port.url : port.proto + " · " + port.host + (port.proto === "LPR" ? " · cua " + port.queue : " · port " + port.number) }),
            h("div", { text: "Unitat doble cara: " + (p.duplexUnit ? "instal·lada" : "no") + " · Preferència: " + ({ none: "una cara", long: "vora llarga", short: "vora curta" }[(p.prefs || {}).duplex] || "—") })]);
        })) : h("p", { class: "q-empty", text: "Cap." })]),
        h("div", {}, [h("h3", { text: "Formularis creats" }), (st.forms || []).length ? h("ul", { class: "dl-list" }, st.forms.map(function (f) { return h("li", { text: f.name + " · " + f.w + " × " + f.h + " cm" }); })) : h("p", { class: "q-empty", text: "Cap." }),
          h("h3", { text: "Altres" }), kvTable([["Client LPR activat", st.features && st.features.lpr ? "Sí" : "No"], ["Tòner que ha vist a la web", st.flags && st.flags.tonerSeen != null ? st.flags.tonerSeen + "%" : "—"]])]),
        h("div", {}, [h("h3", { text: "Últims errors d'impressió" }), lastErr.length ? h("ul", { class: "dl-list err" }, lastErr.map(function (j) { return h("li", { text: t2(j.at) + " · " + j.doc + ": " + j.error }); })) : h("p", { class: "q-empty", text: "Cap error recent." })])
      ])
    ]));
  }
  function kvTable(rows) { return h("table", { class: "kv" }, rows.map(function (r) { return h("tr", {}, [h("th", { text: r[0] }), h("td", { text: r[1] })]); })); }

  document.addEventListener("DOMContentLoaded", function () {
    var saved = null; try { saved = sessionStorage.getItem("pr07_teacher_" + T.room); } catch (e) { /* ignore */ }
    if (saved) {
      try { T.backend = B.create(T.room); } catch (e) { login(e.message); return; }
      T.backend.teacherCheck(saved).then(function (r) { if (r && r.ok) { T.pin = saved; start(); } else login(); }).catch(function () { login("No es pot connectar amb el servidor."); });
    } else login();
  });
})();
