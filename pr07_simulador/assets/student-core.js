/* PR07 · Aplicació de l'alumne · Nucli: sessió, estat, finestres, missions, cua d'impressió */
(function () {
  "use strict";
  var D = window.PR07_DATA, N = window.PR07_NET, B = window.PR07_BACKEND, CFG = window.PR07_CONFIG || {};

  // ------------------------------------------------------------------ utilitats DOM
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "style") el.setAttribute("style", v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids])).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’'"“”«»]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function fmtTime(iso) { var d = new Date(iso); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  // ------------------------------------------------------------------ estat global
  var App = window.PR07_APP = {
    h: h, $: $, norm: norm, fmtTime: fmtTime,
    apps: {},
    room: B.normRoom(new URLSearchParams(location.search).get("sala") || CFG.defaultRoom || "ASIXB"),
    backend: null, device: null, dept: null, token: null, name: "", user: "",
    state: null,
    shared: { jobs: [], printer: { toner: 87, online: true }, claims: [] },
    connected: false
  };

  function defaultState() {
    return { v: 1, net: { mode: "dhcp", ip: "", mask: "", gw: "", dns1: "", dns2: "" }, features: { lpr: false },
      ports: [], printers: [], forms: [], localJobs: [], flags: {}, progress: {}, tonerAnswer: "" };
  }
  function sanitizeState(s) {
    var d = defaultState();
    if (!s || typeof s !== "object") return d;
    for (var k in d) if (s[k] === undefined) s[k] = d[k];
    if (!s.net || typeof s.net !== "object") s.net = d.net;
    return s;
  }
  App.firstName = function () { return (App.name || "").trim().split(/\s+/)[0] || ""; };

  // ------------------------------------------------------------------ desar (amb retard)
  var saveTimer = null;
  App.touch = function () {
    App.evaluateMissions();
    App.renderMissions();
    App.renderTaskbarNet();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(App.saveNow, 1200);
  };
  App.saveNow = function () {
    if (!App.backend || !App.device) return Promise.resolve();
    clearTimeout(saveTimer);
    return App.backend.save(App.device.id, App.token, App.state, App.state.progress).then(function (r) {
      if (r && r.ok === false && (r.error === "token" || r.error === "alliberat")) App.lostDevice();
    }).catch(function () { App.setConn(false); });
  };

  // ------------------------------------------------------------------ missions
  App.myFormNames = function () {
    var out = ["carta de " + norm(App.firstName())];
    if (norm(App.name) !== norm(App.firstName())) out.push("carta de " + norm(App.name));
    return out;
  };
  App.formMatches = function (name) { return App.myFormNames().indexOf(norm(name)) !== -1; };
  App.driverInfo = function (name) { for (var i = 0; i < D.drivers.length; i++) if (D.drivers[i].name === name) return D.drivers[i]; return null; };

  App.evaluateMissions = function () {
    var st = App.state, p = st.progress, now = new Date().toISOString(), f = st.flags;
    if (!p.t1 && N.diagnose(App.device, st.net).ok) p.t1 = now;
    if (!p.t2 && f.t2) p.t2 = f.t2;
    if (!p.t3 && st.printers.some(function (pr) { var di = App.driverInfo(pr.driver); return di && di.ok && pr.duplexUnit && pr.prefs && pr.prefs.duplex !== "none"; })) p.t3 = now;
    if (!p.t4 && f.t4) p.t4 = f.t4;
    if (!p.t5 && st.forms.some(function (fm) { return App.formMatches(fm.name) && fm.w >= 1 && fm.h >= 1 && fm.w <= 100 && fm.h <= 100; })) p.t5 = now;
    if (!p.t6 && f.t6) p.t6 = f.t6;
    if (!p.bonus && f.bonus) p.bonus = f.bonus;
  };

  function missionStatusText(id) {
    var st = App.state;
    if (st.progress[id]) return "Completada a les " + fmtTime(st.progress[id]);
    if (id === "t1") { var dg = N.diagnose(App.device, st.net); return dg.code === "dhcp" ? "Pendent" : dg.msg; }
    return "Pendent";
  }

  App.renderMissions = function () {
    var box = $("#missionList"); if (!box || !App.state) return;
    box.innerHTML = "";
    var done = 0;
    D.missions.forEach(function (m, i) {
      var ok = !!App.state.progress[m.id]; if (ok) done++;
      var helpOpen = box.getAttribute("data-help-" + m.id) === "1";
      var li = h("li", { class: "mission" + (ok ? " done" : "") }, [
        h("div", { class: "m-head" }, [
          h("span", { class: "m-check", "aria-hidden": "true", text: ok ? "✓" : String(i + 1) }),
          h("div", { class: "m-title" }, [
            h("div", { text: m.title.replace("[el teu nom]", App.firstName() || "el teu nom") }),
            h("div", { class: "m-status", text: missionStatusText(m.id) })
          ])
        ]),
        h("button", { class: "m-help-btn", type: "button", onclick: function () {
          box.setAttribute("data-help-" + m.id, helpOpen ? "0" : "1"); App.renderMissions();
        }, text: helpOpen ? "Amaga la pista" : "Pista" }),
        helpOpen ? h("div", { class: "m-help", text: m.help }) : null
      ]);
      if (m.id === "t6" && !ok) {
        var inp = h("input", { class: "w-input m-toner", type: "number", min: "0", max: "100", placeholder: "%", value: App.state.tonerAnswer || "", "aria-label": "Percentatge de tòner" });
        var msg = h("div", { class: "m-msg" });
        li.appendChild(h("div", { class: "m-answer" }, [
          h("label", { text: "Tòner que marca la impressora:" }), inp,
          h("button", { class: "w-btn primary", type: "button", text: "Comprova", onclick: function () {
            var v = parseFloat(inp.value);
            App.state.tonerAnswer = inp.value;
            var seen = App.state.flags.tonerSeen;
            var cur = Number(App.shared.printer.toner);
            if (isNaN(v)) { msg.textContent = "Escriu un número."; return; }
            if (seen === undefined || seen === null) { msg.textContent = "Encara no has obert la pàgina de consumibles de la impressora."; return; }
            if (Math.abs(v - seen) <= 1 || Math.abs(v - cur) <= 2) { App.state.flags.t6 = new Date().toISOString(); App.touch(); App.toast("Missió completada", "Has consultat el tòner a la interfície web."); }
            else msg.textContent = "No coincideix amb el que marca ara la impressora. Torna-ho a mirar.";
          } }), msg
        ]));
      }
      box.appendChild(li);
    });
    var bOk = !!App.state.progress.bonus;
    box.appendChild(h("li", { class: "mission bonus" + (bOk ? " done" : "") }, [
      h("div", { class: "m-head" }, [
        h("span", { class: "m-check", text: bOk ? "✓" : "★" }),
        h("div", { class: "m-title" }, [
          h("div", { text: D.bonus.title.replace("[el teu nom]", App.firstName()) }),
          h("div", { class: "m-status", text: bOk ? "Completat a les " + fmtTime(App.state.progress.bonus) : "Opcional" })
        ])
      ])
    ]));
    var pct = Math.round(done / D.missions.length * 100);
    $("#missionBar").style.width = pct + "%";
    $("#missionCount").textContent = done + " de " + D.missions.length + " missions";
    App.renderMyQueue();
  };

  App.jobStatusText = function (sj) {
    if (!sj) return "Enviant…";
    if (sj.status === "queued") return "A la cua de la impressora";
    if (sj.status === "printing") return "S'està imprimint…";
    if (sj.status === "cancelled") return "Cancel·lat pel docent";
    if (sj.status === "done") return sj.driver_ok ? "Imprès" : "Imprès amb caràcters estranys (controlador incorrecte)";
    return sj.status;
  };
  App.renderMyQueue = function () {
    var ul = $("#myQueue"); if (!ul) return;
    ul.innerHTML = "";
    var mine = App.shared.jobs.filter(function (j) { return App.device && j.device_id === App.device.id; }).slice(0, 6);
    if (!mine.length) { ul.appendChild(h("li", { class: "q-empty", text: "Encara no tens cap document a la impressora comuna." })); return; }
    mine.forEach(function (j) {
      ul.appendChild(h("li", { class: "q-item st-" + j.status + (j.driver_ok ? "" : " bad") }, [
        h("span", { class: "q-doc", text: j.doc_name }),
        h("span", { class: "q-st", text: App.jobStatusText(j) })
      ]));
    });
  };

  // ------------------------------------------------------------------ notificacions
  App.toast = function (title, body, kind) {
    var wrap = $("#toasts"); if (!wrap) return;
    var t = h("div", { class: "toast" + (kind ? " " + kind : ""), role: "status" }, [h("strong", { text: title }), body ? h("div", { text: body }) : null]);
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, 5200);
  };

  // ------------------------------------------------------------------ gestor de finestres
  var WM = { z: 20, wins: {}, n: 0 };
  App.openApp = function (id, arg) {
    var appKey = id.split(":")[0];
    var def = App.apps[appKey];
    if (!def) return;
    if (WM.wins[id]) { App.focusWin(id); if (def.reopen) def.reopen(WM.wins[id].body, arg, id); return WM.wins[id]; }
    var area = $("#desktop");
    var w = Math.min(def.w || 640, area.clientWidth - 16), hgt = Math.min(def.h || 460, area.clientHeight - 16);
    var off = (WM.n++ % 6) * 26;
    var left = Math.max(8, Math.min(area.clientWidth - w - 8, 128 + off)), top = Math.max(8, Math.min(area.clientHeight - hgt - 8, 24 + off));
    var title = typeof def.title === "function" ? def.title(arg, id) : def.title;
    var body = h("div", { class: "win-body" + (def.bodyClass ? " " + def.bodyClass : "") });
    var win = h("section", { class: "win", role: "dialog", "aria-label": title, style: "left:" + left + "px;top:" + top + "px;width:" + w + "px;height:" + hgt + "px;z-index:" + (++WM.z) }, [
      h("header", { class: "win-title" }, [
        h("span", { class: "win-ico", text: def.icon || "▫" }),
        h("span", { class: "win-name", text: title }),
        h("button", { class: "win-close", type: "button", title: "Tanca", "aria-label": "Tanca", onclick: function () { App.closeWin(id); } }, "✕")
      ]),
      body
    ]);
    win.addEventListener("mousedown", function () { App.focusWin(id); });
    makeDraggable(win, $(".win-title", win));
    area.appendChild(win);
    WM.wins[id] = { el: win, body: body, def: def, arg: arg, title: title };
    def.render(body, arg, id);
    App.focusWin(id);
    renderTaskApps();
    return WM.wins[id];
  };
  App.closeWin = function (id) {
    var w = WM.wins[id]; if (!w) return;
    if (w.def.onclose) w.def.onclose(id);
    w.el.remove(); delete WM.wins[id]; renderTaskApps();
  };
  App.focusWin = function (id) {
    var w = WM.wins[id]; if (!w) return;
    w.el.style.zIndex = ++WM.z;
    Object.keys(WM.wins).forEach(function (k) { WM.wins[k].el.classList.toggle("focused", k === id); });
    renderTaskApps();
  };
  App.refreshWin = function (id) { var w = WM.wins[id]; if (w) { w.body.innerHTML = ""; w.def.render(w.body, w.arg, id); } };
  App.refreshWhere = function (prefix) { Object.keys(WM.wins).forEach(function (k) { if (k === prefix || k.indexOf(prefix + ":") === 0) { var w = WM.wins[k]; if (!w.def.keepOnRefresh) App.refreshWin(k); } }); };
  App.isOpen = function (id) { return !!WM.wins[id]; };
  App.setWinTitle = function (id, t) { var w = WM.wins[id]; if (w) { w.title = t; $(".win-name", w.el).textContent = t; renderTaskApps(); } };

  function makeDraggable(win, handle) {
    var sx, sy, ox, oy, drag = false;
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".win-close") || window.innerWidth < 900) return;
      drag = true; sx = e.clientX; sy = e.clientY; ox = win.offsetLeft; oy = win.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var area = $("#desktop");
      var nx = Math.max(-win.offsetWidth + 80, Math.min(area.clientWidth - 80, ox + e.clientX - sx));
      var ny = Math.max(0, Math.min(area.clientHeight - 40, oy + e.clientY - sy));
      win.style.left = nx + "px"; win.style.top = ny + "px";
    });
    handle.addEventListener("pointerup", function () { drag = false; });
  }

  function renderTaskApps() {
    var bar = $("#taskApps"); if (!bar) return;
    bar.innerHTML = "";
    var top = null, topZ = -1;
    Object.keys(WM.wins).forEach(function (k) { var z = +WM.wins[k].el.style.zIndex; if (z > topZ) { topZ = z; top = k; } });
    Object.keys(WM.wins).forEach(function (k) {
      var w = WM.wins[k];
      bar.appendChild(h("button", { class: "task-app" + (k === top ? " active" : ""), type: "button", title: w.title, onclick: function () { App.focusWin(k); } }, [
        h("span", { class: "ta-ico", text: w.def.icon || "▫" }), h("span", { class: "ta-name", text: w.title })
      ]));
    });
  }

  // ------------------------------------------------------------------ escriptori
  var DESKTOP_ICONS = [
    ["fitxa", "Fitxa del dispositiu"], ["intranet", "Intranet IT"], ["network", "Configuració de xarxa"],
    ["printers", "Impressores i escàners"], ["console", "Símbol del sistema"], ["browser", "Navegador"], ["documents", "Documents"]
  ];
  var START_ITEMS = DESKTOP_ICONS.concat([["console:ps", "Windows PowerShell"], ["features", "Característiques del Windows"]]);

  App.renderTaskbarNet = function () {
    var el = $("#netIcon"); if (!el || !App.state) return;
    var gwOk = N.connect(App.device, App.state.net, App.dept.gw, "icmp", 0).ok;
    var e = N.effective(App.device, App.state.net);
    el.textContent = gwOk ? "🖧 Connectat" : (e.apipa ? "🖧 Xarxa no identificada" : "🖧 Sense accés a la xarxa");
    el.className = "tb-net " + (gwOk ? "ok" : "ko");
  };

  function buildDesktop() {
    document.body.className = "desk";
    var root = $("#app"); root.innerHTML = "";
    var icons = h("nav", { class: "desk-icons", "aria-label": "Aplicacions" });
    DESKTOP_ICONS.forEach(function (it) {
      var def = App.apps[it[0]];
      icons.appendChild(h("button", { class: "desk-icon", type: "button", onclick: function () { App.openApp(it[0]); } }, [
        h("span", { class: "di-ico", text: def ? def.icon : "▫" }), h("span", { class: "di-name", text: it[1] })
      ]));
    });
    var start = h("div", { class: "startmenu", id: "startMenu", hidden: true }, [
      h("div", { class: "sm-title", text: "Aplicacions" }),
      h("div", { class: "sm-grid" }, START_ITEMS.map(function (it) {
        var def = App.apps[it[0].split(":")[0]];
        return h("button", { class: "sm-item", type: "button", onclick: function () { $("#startMenu").hidden = true; App.openApp(it[0]); } }, [
          h("span", { class: "di-ico", text: def ? def.icon : "▫" }), h("span", { text: it[1] })
        ]);
      })),
      h("div", { class: "sm-user" }, [h("span", { class: "sm-avatar", text: (App.firstName()[0] || "?").toUpperCase() }), h("span", { text: App.name + " · " + App.device.id })])
    ]);
    var desktop = h("main", { id: "desktop", class: "desktop" }, [icons, h("div", { class: "toasts", id: "toasts", "aria-live": "polite" })]);
    var taskbar = h("footer", { class: "taskbar" }, [
      h("button", { class: "tb-start", type: "button", title: "Inici", "aria-label": "Inici", onclick: function (e) { e.stopPropagation(); var m = $("#startMenu"); m.hidden = !m.hidden; } }, h("span", { class: "win-logo" }, [h("i"), h("i"), h("i"), h("i")])),
      h("div", { class: "task-apps", id: "taskApps" }),
      h("div", { class: "tb-right" }, [
        h("span", { class: "tb-mode " + (App.backend.mode === "demo" ? "demo" : "live"), id: "connBadge", text: App.backend.mode === "demo" ? "Mode demostració" : "En línia" }),
        h("span", { class: "tb-net", id: "netIcon" }),
        h("span", { class: "tb-clock", id: "clock" })
      ])
    ]);
    var missions = h("aside", { class: "missions", id: "missions", "aria-label": "Missions" }, [
      h("button", { class: "mis-toggle", type: "button", onclick: function () { $("#missions").classList.toggle("open"); }, text: "Missions" }),
      h("div", { class: "mis-inner" }, [
        h("div", { class: "mis-head" }, [
          h("div", { class: "mis-company", text: D.company }),
          h("div", { class: "mis-who", text: App.name }),
          h("div", { class: "mis-dev" }, [
            h("span", { class: "dept-chip", style: "background:" + App.dept.color, text: App.dept.name + (D.level === "basic" ? "" : " · VLAN " + App.dept.vlan) }),
            h("span", { class: "dev-chip", text: App.device.id })
          ]),
          h("div", { class: "mis-progress" }, [h("div", { class: "mis-bar" }, h("div", { id: "missionBar" })), h("span", { id: "missionCount" })])
        ]),
        h("ol", { class: "mission-list", id: "missionList" }),
        h("h3", { class: "mis-sub", text: "Els meus documents a la impressora comuna" }),
        h("ul", { class: "my-queue", id: "myQueue" }),
        h("div", { class: "mis-foot" }, [
          h("div", { text: "Codi de recuperació (per si canvies d'ordinador):" }),
          h("code", { class: "rec-code", text: App.device.id + " · " + B.prettyToken(App.token) }),
          h("div", { class: "mis-room", text: "Sala: " + App.room })
        ])
      ])
    ]);
    root.appendChild(h("div", { class: "desk-wrap" }, [desktop, missions]));
    root.appendChild(start);
    root.appendChild(taskbar);
    document.addEventListener("click", function (e) { var m = $("#startMenu"); if (m && !m.hidden && !e.target.closest("#startMenu")) m.hidden = true; });
    tickClock(); setInterval(tickClock, 15000);
    App.renderMissions(); App.renderTaskbarNet();
    if (!App.state.progress.t1 && !App.state._welcomed) { App.state._welcomed = true; App.openApp("fitxa"); App.touch(); }
  }
  function tickClock() { var c = $("#clock"); if (c) { var d = new Date(); c.innerHTML = ""; c.appendChild(h("span", { text: ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) })); c.appendChild(h("span", { text: d.toLocaleDateString("ca-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) })); } }

  App.setConn = function (ok) {
    App.connected = ok;
    var b = $("#connBadge"); if (!b || App.backend.mode === "demo") return;
    b.textContent = ok ? "En línia" : "Sense connexió amb el servidor";
    b.className = "tb-mode " + (ok ? "live" : "off");
  };

  // ------------------------------------------------------------------ dades compartides
  var unsub = null;
  App.refreshShared = function () {
    return App.backend.fetchAll({ noEvents: true }).then(function (d) {
      App.shared = d; App.setConn(true);
      if (App.device && !d.claims.some(function (c) { return c.device_id === App.device.id; })) { App.lostDevice(); return; }
      App.renderMyQueue();
      App.refreshWhere("queue");
      App.refreshWhere("printers");
      if (App.apps.browser && App.apps.browser.onShared) App.apps.browser.onShared();
    }).catch(function () { App.setConn(false); });
  };
  App.lostDevice = function () {
    if (App._lost) return; App._lost = true;
    try { localStorage.removeItem("pr07_session_" + App.room); } catch (e) { /* ignore */ }
    if (unsub) unsub();
    document.body.className = "landing";
    $("#app").innerHTML = "";
    $("#app").appendChild(h("div", { class: "land-card" }, [
      h("h1", { text: "El dispositiu s'ha alliberat" }),
      h("p", { text: "El docent ha alliberat " + (App.device ? App.device.id : "el dispositiu") + " o s'ha reiniciat la partida. Torna a entrar i agafa un dispositiu." }),
      h("button", { class: "w-btn primary", type: "button", text: "Torna a l'inici", onclick: function () { location.reload(); } })
    ]));
  };

  // ------------------------------------------------------------------ cua d'impressió (spooler)
  function parseIppUrl(url) {
    var m = /^(ipps?|https?):\/\/([^\/:\s]+)(?::(\d+))?(\/[^\s]*)?$/i.exec(String(url || "").trim());
    if (!m) return null;
    var scheme = m[1].toLowerCase();
    var def = { ipp: 631, ipps: 443, http: 80, https: 443 }[scheme];
    return { scheme: scheme, host: m[2], port: m[3] ? parseInt(m[3], 10) : def, path: (m[4] || "/").replace(/\/+$/, "") || "/" };
  }
  App.parseIppUrl = parseIppUrl;

  function routeMsg(reason) {
    return {
      no_net: "La xarxa no està disponible (configuració IP no vàlida)",
      no_gw: "No hi ha cap ruta cap a la impressora (falta la passarel·la o no és vàlida)",
      isolated: "L'equip no es pot comunicar amb la xarxa (la IP no correspon a la xarxa on està connectat)",
      arp: "La impressora no respon (l'equip la creu a la seva xarxa local: revisa la màscara)",
      bad_gw: "La passarel·la configurada no respon",
      router_arp: "El router no troba l'equip de destinació",
      no_route: "No hi ha cap ruta cap a aquesta adreça",
      conflict: "Conflicte d'adreces IP: la interfície de xarxa s'ha desactivat"
    }[reason] || "Error de xarxa";
  }
  App.routeMsg = routeMsg;

  // Comprova si un port d'impressora arriba a la impressora. port = {proto, host, number, queue, url}
  App.checkPort = function (port) {
    var dev = App.device, net = App.state.net, host, tcp, path = null;
    if (port.proto === "IPP") {
      var u = parseIppUrl(port.url);
      if (!u) return { ok: false, msg: "L'adreça de la impressora IPP no és vàlida" };
      host = u.host; tcp = u.port; path = u.path;
    } else { host = port.host; tcp = port.proto === "LPR" ? 515 : parseInt(port.number, 10) || 9100; }
    var r = N.resolve(dev, net, host);
    if (!r.ok) return { ok: false, msg: r.reason === "nxdomain" ? "No es troba l'equip '" + host + "'" : "No es pot resoldre el nom '" + host + "' (cal un servidor DNS accessible)" };
    var c = N.connect(dev, net, r.ip, "tcp", tcp);
    if (!c.ok) {
      if (c.stage === "route") return { ok: false, msg: routeMsg(c.reason) };
      if (c.stage === "acl") return { ok: false, msg: "S'ha esgotat el temps d'espera connectant amb " + r.ip + ":" + tcp, deny: c.deny, ip: r.ip, tcp: tcp };
      return { ok: false, msg: "L'equip " + r.ip + " ha rebutjat la connexió al port " + tcp };
    }
    var t = N.hostAt(r.ip);
    if (!t || t.kind !== "printer") return { ok: false, msg: "L'equip " + r.ip + " no és una impressora" };
    if (port.proto === "RAW" && tcp !== D.printer.rawPort) return { ok: false, msg: "La impressora no accepta impressió RAW pel port " + tcp };
    if (port.proto === "LPR" && norm(port.queue) !== norm(D.printer.lprQueue)) return { ok: false, msg: "La impressora ha rebutjat la cua LPR '" + (port.queue || "") + "' (no existeix)" };
    if (port.proto === "IPP" && (tcp !== D.printer.ippPort || ["/ipp/print", "/ipp"].indexOf(path.toLowerCase()) === -1)) return { ok: false, msg: "No s'ha trobat el servei IPP de la impressora en aquesta adreça" };
    return { ok: true, ip: r.ip, tcp: tcp };
  };

  App.logDeny = function (deny) {
    if (!deny) return;
    var msg = "DENY " + deny.proto + " " + deny.src + " → " + deny.dst + (deny.port ? ":" + deny.port : "") + " · " + deny.why;
    App.backend.logEvent(App.device.id, App.token, "deny", msg).catch(function () { /* ignore */ });
  };

  function pushLocalJob(j) {
    App.state.localJobs.unshift(j);
    App.state.localJobs = App.state.localJobs.slice(0, 12);
  }

  // Imprimeix a través d'una impressora instal·lada (o directament per LPR si printer = null)
  // opts: { doc, pages, copies, duplex, paper, method, direct:{host,queue} }
  App.printJob = function (printer, opts) {
    var st = App.state, now = new Date().toISOString();
    var port, driver, printerName;
    if (printer && printer.id === "pdf") {
      App.toast("Microsoft Print to PDF", "S'ha desat " + opts.doc.replace(/\.txt$/, "") + ".pdf a Documents. (No s'ha enviat a cap impressora de xarxa.)");
      return Promise.resolve({ ok: false, pdf: true });
    }
    if (printer) { port = printer.port; driver = App.driverInfo(printer.driver) || { ok: false }; printerName = printer.name; }
    else { port = { proto: "LPR", host: opts.direct.host, queue: opts.direct.queue }; driver = { ok: true, name: "lpr" }; printerName = "lpr " + opts.direct.host; }
    var duplex = opts.duplex || "none", paper = opts.paper || "A4";
    if (printer && (driver.generic || !printer.duplexUnit)) duplex = "none";
    if (driver.generic) paper = "A4";
    var lj = { id: "j" + Date.now() + Math.floor(Math.random() * 1000), printerId: printer ? printer.id : null, printer: printerName, doc: opts.doc, pages: opts.pages || 1,
      copies: opts.copies || 1, duplex: duplex, paper: paper, method: opts.method, at: now, status: "sending", sharedId: null, error: "" };
    pushLocalJob(lj);
    var ck = App.checkPort(port);
    if (!ck.ok) {
      lj.status = "error"; lj.error = ck.msg;
      App.logDeny(ck.deny);
      App.toast(printerName, "Error d'impressió: " + ck.msg, "error");
      App.touch(); App.refreshWhere("queue");
      return Promise.resolve({ ok: false, msg: ck.msg });
    }
    return App.backend.submitJob(App.device.id, App.token, {
      printer: printerName, doc: opts.doc, pages: lj.pages, copies: lj.copies, duplex: duplex, paper: paper,
      protocol: port.proto, method: opts.method, driver_ok: driver.ok || false
    }).then(function (r) {
      if (!r || !r.ok) {
        lj.status = "error";
        lj.error = (r && r.error === "cua_plena") ? "Tens 5 documents pendents a la impressora: espera que s'imprimeixin" : "La impressora no ha acceptat el treball";
        if (r && (r.error === "token" || r.error === "alliberat")) App.lostDevice();
        App.toast(printerName, lj.error, "error");
      } else {
        lj.status = "sent"; lj.sharedId = r.id;
        var f = st.flags;
        if (printer && driver.ok && !f.t2) f.t2 = now;
        if (opts.method === "consola" && driver.ok && !f.t4) f.t4 = now;
        if (printer && driver.ok && duplex !== "none" && App.formMatches(paper) && !f.bonus) f.bonus = now;
        if (!driver.ok && !driver.generic) App.toast(printerName, "El document ha arribat a la impressora, però amb aquest controlador s'imprimeixen caràcters estranys.", "warn");
        else if (driver.generic) App.toast(printerName, opts.doc + " enviat. Amb el controlador genèric no hi ha doble cara ni mides personalitzades.", "warn");
        else App.toast(printerName, opts.doc + " s'ha enviat a la impressora comuna.");
        App.refreshShared();
      }
      App.touch(); App.refreshWhere("queue");
      return { ok: r && r.ok, msg: lj.error };
    }).catch(function () {
      lj.status = "error"; lj.error = "No hi ha connexió amb el servidor del joc";
      App.toast(printerName, lj.error, "error"); App.touch(); App.refreshWhere("queue");
      return { ok: false, msg: lj.error };
    });
  };

  App.defaultPrinter = function () {
    var p = App.state.printers.filter(function (x) { return x.isDefault; })[0];
    return p || null;
  };
  App.findPrinter = function (name) {
    var n = norm(name);
    if (n === "microsoft print to pdf") return App.pdfPrinter;
    return App.state.printers.filter(function (p) { return norm(p.name) === n; })[0] || null;
  };
  App.pdfPrinter = { id: "pdf", name: "Microsoft Print to PDF", driver: "Microsoft Print To PDF", port: { proto: "PORTPROMPT" }, prefs: { duplex: "none", paper: "A4" } };
  App.docByName = function (file) {
    var docs = D.docs[App.dept.id] || [];
    var n = norm(file).replace(/^.*[\\\/]/, "");
    return docs.filter(function (d) { return norm(d.file) === n; })[0] || null;
  };

  // ------------------------------------------------------------------ entrada / selecció de dispositiu
  function sessionKey() { return "pr07_session_" + App.room; }
  function loadSession() { try { return JSON.parse(localStorage.getItem(sessionKey()) || "null"); } catch (e) { return null; } }
  function storeSession(s) { try { localStorage.setItem(sessionKey(), JSON.stringify(s)); } catch (e) { /* ignore */ } }

  function enterDevice(deviceId, token, name, state) {
    App.device = D.deviceById(deviceId); App.dept = D.deptById(App.device.dept);
    App.token = token; App.name = name;
    App.user = norm(App.firstName()).replace(/[^a-z0-9]/g, "") || "usuari";
    App.state = sanitizeState(state);
    storeSession({ device: deviceId, token: token, name: name });
    buildDesktop();
    App.refreshShared();
    unsub = App.backend.subscribe(App.refreshShared, { tables: ["pr07_jobs", "pr07_printer"], pollMs: 10000 });
  }

  function landing(message) {
    document.body.className = "landing";
    var root = $("#app"); root.innerHTML = "";
    var nameIn = h("input", { class: "w-input", id: "lName", autocomplete: "name", placeholder: "Nom i cognoms", maxlength: "60" });
    var roomIn = h("input", { class: "w-input", id: "lRoom", value: App.room, maxlength: "24", "aria-label": "Codi de sala" });
    var err = h("div", { class: "land-err", role: "alert" }, message || "");
    var grid = h("div", { class: "pick-grid", id: "pickGrid" });
    var claims = [];
    function draw() {
      grid.innerHTML = "";
      D.departments.forEach(function (dp) {
        var devs = D.devices.filter(function (d) { return d.dept === dp.id; });
        grid.appendChild(h("div", { class: "pick-dept", style: "--dc:" + dp.color }, [
          h("div", { class: "pd-head" }, [h("strong", { text: dp.name }), h("span", { text: D.level === "basic" ? dp.net + "/24" : "VLAN " + dp.vlan })]),
          h("div", { class: "pd-devs" }, devs.map(function (dv) {
            var c = claims.filter(function (x) { return x.device_id === dv.id; })[0];
            return h("button", { class: "pick-dev" + (c ? " taken" : ""), type: "button", disabled: c ? true : null, onclick: function () { claim(dv.id); } }, [
              h("span", { class: "pk-ico", text: "🖥" }), h("span", { class: "pk-id", text: dv.id }),
              h("span", { class: "pk-who", text: c ? c.student_name : "Lliure" })
            ]);
          }))
        ]));
      });
    }
    function refresh() { App.backend.fetchAll({ noEvents: true }).then(function (d) { claims = d.claims; draw(); }).catch(function () { err.textContent = "No es pot connectar amb el servidor del joc. Avisa el docent."; }); }
    function claim(id) {
      var name = nameIn.value.trim();
      if (name.length < 3 || name.split(/\s+/).length < 2) { err.textContent = "Escriu el teu nom i almenys un cognom abans de triar el dispositiu."; nameIn.focus(); return; }
      var tok = B.newToken();
      err.textContent = "";
      App.backend.claim(id, name, tok).then(function (r) {
        if (r.ok) { if (pollT) clearInterval(pollT); enterDevice(id, tok, name, null); return; }
        err.textContent = { ocupat: "Aquest dispositiu ja l'ha agafat un company.", ja_tens: "Ja tens el dispositiu " + r.device + ". Fes servir el codi de recuperació per tornar-hi.", nom: "El nom és massa curt.", sala: "El codi de sala no és vàlid." }[r.error] || "No s'ha pogut agafar el dispositiu.";
        refresh();
      }).catch(function (e) { err.textContent = "Error de connexió: " + e.message; });
    }
    var recDev = h("select", { class: "w-input", "aria-label": "Dispositiu" }, D.devices.map(function (d) { return h("option", { value: d.id, text: d.id }); }));
    var recCode = h("input", { class: "w-input", placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX", "aria-label": "Codi de recuperació" });
    root.appendChild(h("div", { class: "land-card wide" }, [
      h("div", { class: "land-brand" }, [h("span", { class: "brand-mark", text: "BT" }), h("div", {}, [h("div", { class: "brand-name", text: D.company }), h("div", { class: "brand-sub", text: "Simulador de xarxa i impressió · PR07" })])]),
      h("p", { class: "land-intro", text: D.level === "basic" ? "L'empresa té una xarxa per a cada departament i una impressora compartida a la Zona comuna. Agafa un dispositiu, configura'l amb les dades de la teva Fitxa i aconsegueix imprimir-hi." : "L'empresa té una xarxa separada per a cada departament i una impressora compartida a la Zona comuna. Agafa un dispositiu i aconsegueix imprimir-hi correctament." }),
      h("div", { class: "land-row" }, [
        h("label", {}, ["Nom i cognoms", nameIn]),
        h("label", { class: "room" }, ["Sala", roomIn])
      ]),
      err,
      h("h2", { class: "land-h2", text: "Tria el teu dispositiu" }),
      grid,
      h("details", { class: "land-rec" }, [
        h("summary", { text: "Ja tenia un dispositiu (he canviat d'ordinador)" }),
        h("div", { class: "land-row" }, [recDev, recCode, h("button", { class: "w-btn", type: "button", text: "Recupera", onclick: function () {
          var tok = recCode.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
          App.backend.resume(recDev.value, tok).then(function (r) {
            if (r.ok) { if (pollT) clearInterval(pollT); enterDevice(recDev.value, tok, r.student_name, r.state); }
            else err.textContent = "El codi no és correcte per a aquest dispositiu.";
          }).catch(function (e) { err.textContent = "Error de connexió: " + e.message; });
        } })])
      ]),
      h("div", { class: "land-foot" }, [
        h("span", { class: "tb-mode " + (App.backend.mode === "demo" ? "demo" : "live"), text: App.backend.mode === "demo" ? "Mode demostració: les dades només es guarden en aquest navegador" : "Connectat al servidor del joc" })
      ])
    ]));
    roomIn.addEventListener("change", function () {
      var r = B.normRoom(roomIn.value); if (!r) return;
      var u = new URL(location.href); u.searchParams.set("sala", r); location.href = u.toString();
    });
    draw(); refresh();
    var pollT = setInterval(refresh, 5000);
  }

  App.boot = function () {
    try { App.backend = B.create(App.room); }
    catch (e) { $("#app").textContent = e.message; return; }
    var s = loadSession();
    if (s && s.device && s.token) {
      App.backend.resume(s.device, s.token).then(function (r) {
        if (r.ok) enterDevice(s.device, s.token, r.student_name, r.state);
        else { try { localStorage.removeItem(sessionKey()); } catch (e) { /* ignore */ } landing(r.error === "alliberat" ? "El teu dispositiu s'ha alliberat. Torna'n a agafar un." : ""); }
      }).catch(function () { landing("No es pot connectar amb el servidor del joc."); });
    } else landing();
  };

  document.addEventListener("DOMContentLoaded", function () { App.boot(); });
})();
