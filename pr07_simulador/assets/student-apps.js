/* PR07 · Aplicació de l'alumne · Aplicacions de l'escriptori simulat */
(function () {
  "use strict";
  var App = window.PR07_APP, D = window.PR07_DATA, N = window.PR07_NET;
  var h = App.h, norm = App.norm;
  var WS = {}; // estat de cada finestra (es manté entre redibuixos)
  function ws(id, init) { if (!WS[id]) WS[id] = init(); return WS[id]; }
  function dropWs(id) { delete WS[id]; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function printerById(id) { if (id === "pdf") return App.pdfPrinter; return App.state.printers.filter(function (p) { return p.id === id; })[0] || null; }

  function tabs(body, list, active, onChange) {
    var bar = h("div", { class: "w-tabs", role: "tablist" });
    list.forEach(function (t) {
      bar.appendChild(h("button", { class: "w-tab" + (t.id === active ? " active" : ""), role: "tab", "aria-selected": t.id === active ? "true" : "false", type: "button", text: t.label, onclick: function () { onChange(t.id); } }));
    });
    body.appendChild(bar);
    var panel = h("div", { class: "w-tabpanel", role: "tabpanel" });
    body.appendChild(panel);
    return panel;
  }
  function field(label, input, hint) { return h("label", { class: "w-field" }, [h("span", { class: "wf-label", text: label }), input, hint ? h("span", { class: "wf-hint", text: hint }) : null]); }
  function select(options, value, attrs) {
    var s = h("select", Object.assign({ class: "w-input" }, attrs || {}));
    options.forEach(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; s.appendChild(h("option", { value: v, text: l, selected: String(v) === String(value) ? true : null })); });
    return s;
  }
  function msgBox(text, kind) { return h("div", { class: "w-msg " + (kind || "info"), role: kind === "error" ? "alert" : "status", text: text }); }
  function allForms() { return D.standardForms.map(function (f) { return f.name; }).concat(App.state.forms.map(function (f) { return f.name; })); }

  // =================================================================== Fitxa del dispositiu
  App.apps.fitxa = {
    title: "Fitxa del dispositiu", icon: "📋", w: 580, h: 590,
    render: function (body) {
      var dv = App.device, dp = App.dept;
      body.appendChild(h("div", { class: "ticket" }, [
        h("div", { class: "tk-head" }, [h("span", { class: "brand-mark sm", text: "BT" }), h("div", {}, [h("strong", { text: "Ordre de treball IT-2026-" + (1100 + D.devices.indexOf(dv)) }), h("div", { class: "muted", text: "Assignació i posada en marxa d'equip" })])]),
        h("table", { class: "kv" }, [
          row("Usuari", App.name), row("Equip", dv.id), row("Departament", dp.name + (D.level === "basic" ? "" : " (VLAN " + dp.vlan + ")")),
          row("Adreça IP assignada", dv.ip + "  (estàtica)"), row("Adreça física (MAC)", dv.mac),
          D.level === "basic" ? row("Màscara de subxarxa", dp.mask) : row("Màscara i passarel·la", "Les de la VLAN del departament (Intranet IT › Mapa de xarxa)"),
          D.level === "basic" ? row("Passarel·la predeterminada", dp.gw) : null,
          D.level === "basic" ? row("Servidor DNS", D.dns.ip) : row("Servidor DNS", "El servidor DNS intern de l'empresa (Intranet IT › Inventari)"),
          D.level === "basic" ? row("Impressora de la Zona comuna", D.printer.ip + "  (" + D.printer.model + ")") : null
        ]),
        h("h3", { text: "Tasques" }),
        h("ol", { class: "tk-tasks" }, D.missions.map(function (m) { return h("li", { text: m.title.replace("[el teu nom]", App.firstName()) }); })),
        D.level === "basic" ? glossary() : h("p", { class: "muted", text: "Recorda: a l'empresa no hi ha DHCP als departaments i les xarxes dels departaments estan aïllades entre elles. Només es pot arribar a la Zona comuna pels serveis que permet el tallafoc." })
      ]));
      function glossary() {
        function t(k, v) { return h("li", {}, [h("strong", { text: k + ": " }), v]); }
        return h("details", { class: "gloss", open: "" }, [h("summary", { text: "Què vol dir cada cosa?" }), h("ul", {}, [
          t("Adreça IP", "el «número de telèfon» de l'ordinador a la xarxa. No pot haver-hi dos equips amb la mateixa."),
          t("IP estàtica", "una IP que escrius tu a mà i que no canvia. Al contrari, amb «Obtén una adreça automàticament» (DHCP) un servidor te'n dona una; si no n'hi ha cap, el Windows se n'inventa una que comença per 169.254 i no et deixa sortir de l'equip."),
          t("Màscara de subxarxa", "diu quina part de la IP és «el carrer» (la xarxa) i quina «el número de la porta» (l'equip). Aquí sempre és 255.255.255.0: els tres primers números són la xarxa i l'últim és l'equip."),
          t("Passarel·la", "la «porta de sortida» de la teva xarxa: el router. Per parlar amb un equip d'una altra xarxa (com la impressora) cal passar per ella."),
          t("DNS", "la «guia telefònica»: tradueix noms (prn-comuna.badiatech.local) a adreces IP."),
          t("Port", "la «porta» concreta d'un equip per la qual entra un servei. La impressora rep treballs pel port 9100.")
        ])]);
      }
      function row(k, v) { return h("tr", {}, [h("th", { text: k }), h("td", { text: v })]); }
    }
  };

  // =================================================================== Intranet IT (documentació)
  App.apps.intranet = {
    title: "Intranet IT · Documentació de xarxa", icon: "📚", w: 760, h: 520,
    render: function (body, arg, id) {
      var st = ws(id, function () { return { tab: "mapa" }; });
      var panel = tabs(body, [{ id: "mapa", label: "Mapa de xarxa" }, { id: "inv", label: "Inventari" }, { id: "fw", label: "Política del tallafoc" }, { id: "normes", label: "Normes d'IT" }], st.tab, function (t) { st.tab = t; App.refreshWin(id); });
      if (st.tab === "mapa") {
        panel.appendChild(h("p", { text: D.level === "basic" ? "Cada departament té la seva xarxa. Totes passen pel router central FW-CORE per arribar a la Zona comuna, on hi ha la impressora." : "Cada departament té la seva VLAN i la seva subxarxa. Totes passen pel router/tallafoc central FW-CORE." }));
        var rows = D.departments.map(function (dp) {
          return h("tr", {}, [h("td", { text: String(dp.vlan) }), h("td", {}, [h("span", { class: "dot", style: "background:" + dp.color }), dp.name]), h("td", { class: "mono", text: dp.net }), h("td", { class: "mono", text: dp.mask }), h("td", { class: "mono", text: dp.gw })]);
        });
        rows.push(h("tr", { class: "zc" }, [h("td", { text: "100" }), h("td", { text: "Zona comuna (serveis compartits)" }), h("td", { class: "mono", text: D.commonZone.net }), h("td", { class: "mono", text: D.commonZone.mask }), h("td", { class: "mono", text: D.commonZone.gw })]));
        panel.appendChild(h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, ["VLAN", "Departament", "Adreça de xarxa", "Màscara", "Passarel·la (router)"].map(function (t) { return h("th", { text: t }); }))), h("tbody", {}, rows)]));
        panel.appendChild(h("div", { class: "netmap" }, [
          h("div", { class: "nm-core", text: "FW-CORE · Router / Tallafoc" }),
          h("div", { class: "nm-vlans" }, D.departments.map(function (dp) { return h("div", { class: "nm-vlan", style: "border-color:" + dp.color }, [h("strong", { text: "VLAN " + dp.vlan }), h("span", { text: dp.name })]); }).concat([h("div", { class: "nm-vlan zc" }, [h("strong", { text: "VLAN 100" }), h("span", { text: "Zona comuna · 🖨 impressora · DNS" })])]))
        ]));
      } else if (st.tab === "inv") {
        var p = D.printer;
        panel.appendChild(h("h3", { text: "Impressora de la Zona comuna" }));
        panel.appendChild(h("table", { class: "kv" }, [
          kv("Model", p.model), kv("Nom d'amfitrió", p.fqdn), kv("Adreça IP", p.ip + " (reserva fixa)"), kv("Ubicació", p.location),
          kv("Serveis d'impressió", "RAW/JetDirect: port " + p.rawPort + " · LPR/LPD: port " + p.lprPort + ", cua «" + p.lprQueue + "» · IPP: port " + p.ippPort + ", ruta " + p.ippPath),
          kv("Gestió", "Interfície web (HTTP/HTTPS) a l'adreça de la impressora"),
          kv("Controlador recomanat", "El del fabricant per al model exacte (PCL6 o PS)")
        ]));
        panel.appendChild(h("h3", { text: "Servidors" }));
        panel.appendChild(h("table", { class: "kv" }, [kv("Servidor DNS intern", D.dns.ip + " (" + D.dns.fqdn + ")"), kv("Domini DNS", D.domain), kv("DHCP", "No n'hi ha a les VLAN dels departaments (adreces estàtiques assignades per IT)")]));
      } else if (st.tab === "fw") {
        panel.appendChild(h("p", { text: "Regles del tallafoc FW-CORE per al trànsit entre VLAN. S'apliquen en ordre; el que no hi surt es denega." }));
        var fr = [
          ["Totes les VLAN", D.dns.ip + " (DNS)", "DNS (53/udp, 53/tcp), ICMP", "Permet"],
          ["Totes les VLAN", D.printer.ip + " (impressora)", "ICMP, HTTP (80/tcp), HTTPS (443/tcp)", "Permet"]
        ];
        if (D.level === "basic") fr.push(["Totes les VLAN", D.printer.ip + " (impressora)", "Impressió: RAW (9100/tcp), LPR (515/tcp), IPP (631/tcp)", "Permet"]); else D.departments.forEach(function (dp) { fr.push(["VLAN " + dp.vlan + " · " + dp.name, D.printer.ip + " (impressora)", dp.proto + " (" + dp.port + "/tcp)", "Permet"]); });
        fr.push(["VLAN de departaments", "Altres VLAN de departaments", "Qualsevol", "Denega"]);
        fr.push(["Qualsevol", "Qualsevol", "Qualsevol (regla implícita)", "Denega"]);
        panel.appendChild(h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, ["Origen", "Destinació", "Servei", "Acció"].map(function (t) { return h("th", { text: t }); }))),
          h("tbody", {}, fr.map(function (r) { return h("tr", { class: r[3] === "Denega" ? "deny" : "" }, r.map(function (c, i) { return h("td", { class: i === 3 ? "act" : "", text: c }); })); }))]));
        panel.appendChild(h("p", { class: "muted", text: "Els protocols de descoberta automàtica (WSD, mDNS, SNMP) no travessen el tallafoc: des d'un departament la impressora no apareix sola a la llista." }));
      } else {
        panel.appendChild(h("ul", { class: "rules" }, [
          h("li", { text: "Cada equip té una adreça IP estàtica assignada per IT. No en facis servir cap altra: provocaries conflictes." }),
          h("li", { text: D.level === "basic" ? "La màscara i la passarel·la són les que surten a la teva Fitxa." : "La màscara i la passarel·la són les de la VLAN del teu departament." }),
          h("li", { text: "Fes servir el DNS intern per resoldre els noms dels equips de l'empresa." }),
          h("li", { text: D.level === "basic" ? "La impressora de la Zona comuna s'afegeix per la seva adreça IP i amb el controlador del model exacte (Lumina LP-4040dn)." : "La impressora de la Zona comuna s'ha d'instal·lar amb el protocol que el tallafoc permet al teu departament i amb el controlador correcte." }),
          h("li", { text: "Per estalviar paper, la impressora s'ha de configurar a doble cara." })
        ]));
      }
      function kv(k, v) { return h("tr", {}, [h("th", { text: k }), h("td", { text: v })]); }
    },
    onclose: dropWs
  };

  // =================================================================== Configuració de xarxa (TCP/IPv4)
  App.apps.network = {
    title: "Ethernet · Propietats de TCP/IPv4", icon: "🌐", w: 520, h: 560,
    render: function (body, arg, id) {
      var n = App.state.net;
      var st = ws(id, function () { return { draft: clone(n), msg: null }; });
      var dft = st.draft;
      var ipIn = h("input", { class: "w-input mono", value: dft.ip, inputmode: "decimal", "aria-label": "Adreça IP" });
      var maskIn = h("input", { class: "w-input mono", value: dft.mask, inputmode: "decimal", "aria-label": "Màscara de subxarxa" });
      var gwIn = h("input", { class: "w-input mono", value: dft.gw, inputmode: "decimal", "aria-label": "Passarel·la predeterminada" });
      var d1 = h("input", { class: "w-input mono", value: dft.dns1, inputmode: "decimal", "aria-label": "Servidor DNS preferit" });
      var d2 = h("input", { class: "w-input mono", value: dft.dns2, inputmode: "decimal", "aria-label": "Servidor DNS alternatiu" });
      var isStatic = dft.mode === "static";
      [ipIn, maskIn, gwIn, d1, d2].forEach(function (i) { i.disabled = !isStatic; i.addEventListener("input", sync); });
      // Com el Windows real: en entrar a la màscara buida, proposa la màscara de la classe de l'adreça (pot no ser la correcta!)
      maskIn.addEventListener("focus", function () {
        if (!maskIn.value && N.ipToInt(ipIn.value) !== null) {
          var o1 = parseInt(ipIn.value, 10);
          maskIn.value = o1 < 128 ? "255.0.0.0" : (o1 < 192 ? "255.255.0.0" : "255.255.255.0");
          sync();
          setTimeout(function () { maskIn.select(); }, 0);
        }
      });
      function sync() { dft.ip = ipIn.value.trim(); dft.mask = maskIn.value.trim(); dft.gw = gwIn.value.trim(); dft.dns1 = d1.value.trim(); dft.dns2 = d2.value.trim(); }
      function setMode(m) { dft.mode = m; App.refreshWin(id); }
      var e = N.effective(App.device, n);
      var gwOk = N.connect(App.device, n, App.dept.gw, "icmp", 0).ok;
      body.appendChild(h("div", { class: "netprops" }, [
        h("div", { class: "np-status " + (gwOk ? "ok" : "ko") }, [
          h("strong", { text: "Estat: " + (gwOk ? "Connectat" : (e.apipa ? "Xarxa no identificada" : "Sense accés a la xarxa")) }),
          h("span", { class: "mono", text: "IPv4 actual: " + (e.ip || "—") + (e.apipa ? " (APIPA)" : "") })
        ]),
        D.level === "basic" ? h("div", { class: "w-msg info", text: "Pista: copia els valors de la teva Fitxa del dispositiu. Si no tens cap adreça pròpia, el Windows en posa una que comença per 169.254 i no podràs sortir de l'equip." }) : null,
        h("p", { class: "muted", text: "Podeu fer que la configuració IP s'assigni automàticament si la xarxa és compatible amb aquesta funció. Altrament, heu de demanar la configuració IP adequada a l'administrador de la xarxa." }),
        h("fieldset", { class: "w-fieldset" }, [
          h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "m", checked: !isStatic ? true : null, onchange: function () { setMode("dhcp"); } }), " Obtén una adreça IP automàticament"]),
          h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "m", checked: isStatic ? true : null, onchange: function () { setMode("static"); } }), " Utilitza l'adreça IP següent:"]),
          h("div", { class: "np-grid" }, [field("Adreça IP:", ipIn), field("Màscara de subxarxa:", maskIn), field("Passarel·la predeterminada:", gwIn)])
        ]),
        h("fieldset", { class: "w-fieldset" }, [
          h("label", { class: "w-radio" + (isStatic ? " disabled" : "") }, [h("input", { type: "radio", disabled: isStatic ? true : null, checked: !isStatic ? true : null }), " Obtén l'adreça del servidor DNS automàticament"]),
          h("label", { class: "w-radio" }, [h("input", { type: "radio", checked: isStatic ? true : null, disabled: !isStatic ? true : null }), " Utilitza les adreces de servidor DNS següents:"]),
          h("div", { class: "np-grid" }, [field("Servidor DNS preferit:", d1), field("Servidor DNS alternatiu:", d2)])
        ]),
        st.msg ? msgBox(st.msg.text, st.msg.kind) : null,
        h("div", { class: "w-actions" }, [
          h("button", { class: "w-btn primary", type: "button", text: "D'acord", onclick: apply }),
          h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } })
        ])
      ]));
      function apply() {
        sync();
        if (dft.mode === "static") {
          if (N.ipToInt(dft.ip) === null) { st.msg = { kind: "error", text: "L'adreça IP no és vàlida." }; return App.refreshWin(id); }
          if (N.maskToInt(dft.mask) === null) { st.msg = { kind: "error", text: "La màscara de subxarxa no és vàlida." }; return App.refreshWin(id); }
          if (dft.gw && N.ipToInt(dft.gw) === null) { st.msg = { kind: "error", text: "La passarel·la predeterminada no és vàlida." }; return App.refreshWin(id); }
          if ((dft.dns1 && N.ipToInt(dft.dns1) === null) || (dft.dns2 && N.ipToInt(dft.dns2) === null)) { st.msg = { kind: "error", text: "L'adreça del servidor DNS no és vàlida." }; return App.refreshWin(id); }
          if (/\/\d+$/.test(dft.mask)) dft.mask = N.intToIp(N.maskToInt(dft.mask));
        }
        App.state.net = clone(dft);
        var warn = null;
        if (dft.mode === "static" && dft.gw) {
          var m = N.maskToInt(dft.mask);
          if (((N.ipToInt(dft.ip) & m) >>> 0) !== ((N.ipToInt(dft.gw) & m) >>> 0)) warn = "Avís: la passarel·la predeterminada no és a la mateixa xarxa o subxarxa que l'adreça IP.";
        }
        var dg = N.diagnose(App.device, App.state.net);
        if (dg.code === "conflict") App.toast("Conflicte d'adreces IP", dg.msg, "error");
        st.msg = warn ? { kind: "warn", text: warn + " S'ha desat igualment." } : { kind: "ok", text: "S'ha aplicat la configuració." };
        App.touch(); App.refreshWin(id);
      }
    },
    onclose: dropWs
  };

  // =================================================================== Impressores i escàners
  var expanded = null, confirmDel = null;
  App.apps.printers = {
    title: "Configuració · Impressores i escàners", icon: "🖨️", w: 640, h: 560,
    render: function (body, arg, id) {
      var st = ws(id, function () { return { search: "idle" }; });
      body.appendChild(h("div", { class: "set-crumb", text: "Bluetooth i dispositius  ›  Impressores i escàners" }));
      var add = h("div", { class: "set-card add" }, [
        h("div", {}, [h("strong", { text: "Afegeix una impressora o un escàner" })]),
        h("button", { class: "w-btn primary", type: "button", text: st.search === "busy" ? "S'està cercant…" : "Afegeix un dispositiu", disabled: st.search === "busy" ? true : null, onclick: function () {
          st.search = "busy"; App.refreshWin(id);
          setTimeout(function () { st.search = "none"; if (App.isOpen(id)) App.refreshWin(id); }, 1600);
        } })
      ]);
      body.appendChild(add);
      if (st.search === "busy") body.appendChild(h("div", { class: "set-searching" }, [h("span", { class: "spinner" }), " Cercant impressores i escàners a la xarxa…"]));
      var found = D.level === "basic" && st.search === "none" && App.checkPort({ proto: "RAW", host: D.printer.ip, number: 9100 }).ok;
      var already = App.state.printers.some(function (x) { return x.port && x.port.host === D.printer.ip; });
      if (found) {
        body.appendChild(h("div", { class: "set-card found" }, [
          h("div", {}, [h("strong", { text: "🖨 " + D.printer.model }), h("div", { class: "muted", text: "Impressora de xarxa · " + D.printer.ip + " · Zona comuna" })]),
          already ? h("span", { class: "muted", text: "Ja l'has afegida" }) : h("button", { class: "w-btn primary", type: "button", text: "Afegeix el dispositiu", onclick: function () {
            var port = { name: "IP_" + D.printer.ip, proto: "RAW", host: D.printer.ip, number: 9100, queue: "" };
            if (!App.state.ports.some(function (x) { return x.name === port.name; })) App.state.ports.push(clone(port));
            App.state.printers.push({ id: "p" + Date.now(), name: D.printer.model, driver: "Lumina LP-4040dn PCL6", port: port, isDefault: App.state.printers.length === 0, duplexUnit: false, tray2: false, prefs: { duplex: "none", paper: "A4", orient: "portrait" }, shared: false });
            App.touch(); App.toast("Impressora afegida", D.printer.model + " ja està instal·lada.", "ok"); App.refreshWin(id);
          } })
        ]));
      } else if (D.level === "basic" && st.search === "none") body.appendChild(h("div", { class: "w-msg info", text: "Pista: si l'equip no està ben connectat a la xarxa (mira la configuració de xarxa), el Windows no pot veure la impressora." }));
      if (st.search === "none" && !found) body.appendChild(h("div", { class: "set-card notfound" }, [
        h("span", { text: "No s'ha trobat cap impressora ni cap escàner." }),
        h("button", { class: "w-link", type: "button", text: "La impressora que vull no apareix a la llista", onclick: function () { App.openApp("wizard"); } })
      ]));
      var list = h("div", { class: "set-list" });
      App.state.printers.concat([App.pdfPrinter]).forEach(function (p) {
        var isOpen = expanded === p.id;
        var di = App.driverInfo(p.driver);
        var rowEl = h("div", { class: "set-item" + (isOpen ? " open" : "") }, [
          h("button", { class: "si-head", type: "button", "aria-expanded": isOpen ? "true" : "false", onclick: function () { expanded = isOpen ? null : p.id; confirmDel = null; App.refreshWin(id); } }, [
            h("span", { class: "si-ico", text: "🖨" }),
            h("span", { class: "si-name" }, [h("strong", { text: p.name }), h("span", { class: "muted", text: p.id === "pdf" ? "Impressora virtual" : (p.isDefault ? "Predeterminada · " : "") + (p.port.proto === "IPP" ? p.port.url : p.port.name) })]),
            h("span", { class: "si-chev", text: isOpen ? "▴" : "▾" })
          ])
        ]);
        if (isOpen) {
          var acts = h("div", { class: "si-actions" });
          acts.appendChild(h("button", { class: "w-btn", type: "button", text: "Obre la cua d'impressió", onclick: function () { App.openApp("queue:" + p.id); } }));
          acts.appendChild(h("button", { class: "w-btn", type: "button", text: "Imprimeix una pàgina de prova", onclick: function () { App.printJob(p, { doc: "Pàgina de prova de Windows", pages: 1, method: "prova" }); } }));
          if (p.id !== "pdf") {
            acts.appendChild(h("button", { class: "w-btn", type: "button", text: "Preferències d'impressió", onclick: function () { App.openApp("prefs:" + p.id); } }));
            acts.appendChild(h("button", { class: "w-btn", type: "button", text: "Propietats de la impressora", onclick: function () { App.openApp("props:" + p.id); } }));
            if (!p.isDefault) acts.appendChild(h("button", { class: "w-btn", type: "button", text: "Estableix com a predeterminada", onclick: function () { App.state.printers.forEach(function (x) { x.isDefault = x.id === p.id; }); App.touch(); App.refreshWin(id); } }));
            if (confirmDel === p.id) acts.appendChild(h("span", { class: "si-confirm" }, ["Vols eliminar aquesta impressora? ",
              h("button", { class: "w-btn danger", type: "button", text: "Sí, elimina", onclick: function () {
                App.state.printers = App.state.printers.filter(function (x) { return x.id !== p.id; });
                if (p.isDefault && App.state.printers[0]) App.state.printers[0].isDefault = true;
                expanded = null; confirmDel = null; App.touch(); App.refreshWin(id);
                ["props:", "prefs:", "queue:"].forEach(function (k) { App.closeWin(k + p.id); });
              } }), " ", h("button", { class: "w-btn", type: "button", text: "No", onclick: function () { confirmDel = null; App.refreshWin(id); } })]));
            else acts.appendChild(h("button", { class: "w-btn danger", type: "button", text: "Elimina", onclick: function () { confirmDel = p.id; App.refreshWin(id); } }));
            if (di && di.generic) acts.appendChild(msgBox("Controlador genèric: sense doble cara ni mides personalitzades.", "warn"));
          }
          rowEl.appendChild(acts);
        }
        list.appendChild(rowEl);
      });
      body.appendChild(h("h3", { class: "set-h", text: "Impressores instal·lades" }));
      body.appendChild(list);
      body.appendChild(h("h3", { class: "set-h", text: "Configuració relacionada" }));
      body.appendChild(h("div", { class: "set-card" }, [h("button", { class: "w-link", type: "button", text: "Propietats del servidor d'impressió", onclick: function () { App.openApp("serverprops"); } })]));
    },
    onclose: dropWs
  };

  // =================================================================== Assistent «Afegeix una impressora»
  App.apps.wizard = {
    title: "Afegeix una impressora", icon: "🖨️", w: 600, h: 520,
    render: function (body, arg, id) {
      var wz = ws(id, function () { return { step: "choose", opt: "tcp", share: "", devType: "auto", host: "", portName: "", portEdited: false, query: true,
        portMode: "standard", showCustom: false, proto: "RAW", number: "9100", queue: "", byteCount: false, maker: "Lumina", driver: "", name: "", shareMode: "no", setDefault: false, created: null, error: "", testMsg: null, port: null }; });
      wz._rer = function () { App.refreshWin(id); };
      var box = h("div", { class: "wizard" });
      body.appendChild(box);
      function go(step) { wz.step = step; wz.error = ""; App.refreshWin(id); }
      function nav(nextFn, nextLabel, backStep) {
        return h("div", { class: "w-actions wz-nav" }, [
          backStep ? h("button", { class: "w-btn", type: "button", text: "Enrere", onclick: function () { go(backStep); } }) : null,
          nextFn ? h("button", { class: "w-btn primary", type: "button", text: nextLabel || "Següent", onclick: nextFn }) : null,
          h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } })
        ]);
      }
      if (wz.error) box.appendChild(msgBox(wz.error, "error"));

      if (wz.step === "choose") {
        box.appendChild(h("h2", { text: "Cerca una impressora mitjançant altres opcions" }));
        var shareIn = h("input", { class: "w-input mono", value: wz.share, placeholder: "\\\\equip\\impressora  o  http://equip/printers/impressora/.printer", disabled: wz.opt !== "share" ? true : null, oninput: function (e) { wz.share = e.target.value; } });
        var opts = [["old", "La meva impressora és una mica antiga. Ajuda'm a trobar-la."], ["share", "Selecciona una impressora compartida per nom"], ["tcp", "Afegeix una impressora mitjançant una adreça TCP/IP o un nom d'amfitrió"], ["disc", "Afegeix una impressora Bluetooth, sense fil o de xarxa detectable"]];
        opts.forEach(function (o) {
          box.appendChild(h("label", { class: "w-radio big" }, [h("input", { type: "radio", name: id + "opt", checked: wz.opt === o[0] ? true : null, onchange: function () { wz.opt = o[0]; App.refreshWin(id); } }), " " + o[1]]));
          if (o[0] === "share") box.appendChild(h("div", { class: "wz-indent" }, [shareIn, h("div", { class: "wf-hint", text: "Exemple: \\\\equip\\impressora o http://equip/printers/impressora/.printer" })]));
        });
        box.appendChild(nav(function () {
          if (wz.opt === "old" || wz.opt === "disc") { go("searching"); setTimeout(function () { if (App.isOpen(id) && wz.step === "searching") go("notfound"); }, 1800); return; }
          if (wz.opt === "tcp") return go("tcp");
          var v = wz.share.trim();
          if (!v) { wz.error = "Escriu el nom o l'adreça de la impressora."; return App.refreshWin(id); }
          if (/^\\\\/.test(v)) { wz.error = "Windows no es pot connectar a la impressora. No hi ha cap servidor d'impressió que comparteixi «" + v + "»."; return App.refreshWin(id); }
          var u = App.parseIppUrl(v);
          if (!u) { wz.error = "El nom o l'adreça no tenen un format vàlid."; return App.refreshWin(id); }
          var port = { name: v, proto: "IPP", url: v };
          var ck = App.checkPort(port);
          if (!ck.ok) { App.logDeny(ck.deny); wz.error = "Windows no es pot connectar a la impressora: " + ck.msg + "."; return App.refreshWin(id); }
          wz.port = port; go("driver");
        }));
      } else if (wz.step === "searching") {
        box.appendChild(h("h2", { text: "S'està cercant impressores…" }));
        box.appendChild(h("div", { class: "set-searching" }, [h("span", { class: "spinner" }), " Cercant dispositius a la xarxa local…"]));
        box.appendChild(nav(null, null, "choose"));
      } else if (wz.step === "notfound") {
        box.appendChild(h("h2", { text: "No s'ha trobat cap impressora" }));
        box.appendChild(h("p", { text: "No s'ha detectat cap impressora a la xarxa local d'aquest equip." }));
        box.appendChild(nav(null, null, "choose"));
      } else if (wz.step === "tcp") {
        box.appendChild(h("h2", { text: "Escriu un nom d'amfitrió o una adreça IP" }));
        var hostIn = h("input", { class: "w-input mono", value: wz.host, "aria-label": "Nom d'amfitrió o adreça IP", oninput: function (e) { wz.host = e.target.value.trim(); if (!wz.portEdited) { wz.portName = wz.host; portIn.value = wz.host; } } });
        var portIn = h("input", { class: "w-input mono", value: wz.portName, "aria-label": "Nom del port", oninput: function (e) { wz.portName = e.target.value; wz.portEdited = true; } });
        box.appendChild(field("Tipus de dispositiu:", select([["auto", "Detecció automàtica"], ["tcp", "Dispositiu TCP/IP"], ["wsd", "Dispositiu de serveis web"]], wz.devType, { onchange: function (e) { wz.devType = e.target.value; } })));
        box.appendChild(field("Nom d'amfitrió o adreça IP:", hostIn));
        box.appendChild(field("Nom del port:", portIn));
        box.appendChild(h("label", { class: "w-check" }, [h("input", { type: "checkbox", checked: wz.query ? true : null, onchange: function (e) { wz.query = e.target.checked; } }), " Consulta la impressora i selecciona automàticament el controlador que cal fer servir"]));
        box.appendChild(nav(function () {
          if (!wz.host) { wz.error = "Escriu el nom d'amfitrió o l'adreça IP de la impressora."; return App.refreshWin(id); }
          var r = N.resolve(App.device, App.state.net, wz.host);
          if (!r.ok) { wz.error = "No s'ha trobat l'amfitrió «" + wz.host + "»" + (r.reason === "nxdomain" ? "." : ": cal un servidor DNS accessible per resoldre noms (o escriu directament l'adreça IP)."); return App.refreshWin(id); }
          if (!wz.portName) wz.portName = wz.host;
          if (wz.devType === "wsd") {
            var cw = N.connect(App.device, App.state.net, r.ip, "tcp", 5357);
            App.logDeny(cw.deny);
            wz.error = "No s'ha trobat cap dispositiu de serveis web en aquesta adreça."; return App.refreshWin(id);
          }
          go("detecting");
          var c = N.connect(App.device, App.state.net, r.ip, "udp", 161);   // consulta SNMP
          setTimeout(function () {
            App.logDeny(c.deny);
            if (!App.isOpen(id) || wz.step !== "detecting") return;
            if (D.level === "basic" && c.ok) { wz.port = { name: wz.portName || wz.host, proto: "RAW", host: wz.host, number: 9100, queue: "" }; wz.driver = ""; wz.maker = "Lumina"; go("driver"); } else go("portinfo");
          }, 1500);
        }, "Següent", "choose"));
      } else if (wz.step === "detecting") {
        box.appendChild(h("h2", { text: "S'està detectant el port TCP/IP" }));
        box.appendChild(h("div", { class: "set-searching" }, [h("span", { class: "spinner" }), " S'està contactant amb el dispositiu " + wz.host + "…"]));
      } else if (wz.step === "portinfo") {
        box.appendChild(h("h2", { text: "Cal informació addicional sobre el port" }));
        box.appendChild(h("p", { text: "No s'ha trobat el dispositiu a la xarxa. Assegureu-vos que el dispositiu està engegat, que la xarxa està connectada, que el dispositiu està configurat correctament i que l'adreça és correcta." }));
        box.appendChild(h("p", { class: "muted", text: "Si l'adreça és correcta, seleccioneu el tipus de dispositiu:" }));
        box.appendChild(h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "pm", checked: wz.portMode === "standard" ? true : null, onchange: function () { wz.portMode = "standard"; wz.showCustom = false; App.refreshWin(id); } }), " Estàndard: ", select(["Generic Network Card"], "Generic Network Card", { disabled: wz.portMode !== "standard" ? true : null })]));
        box.appendChild(h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "pm", checked: wz.portMode === "custom" ? true : null, onchange: function () { wz.portMode = "custom"; App.refreshWin(id); } }), " Personalitzat ",
          h("button", { class: "w-btn", type: "button", text: "Configuració…", disabled: wz.portMode !== "custom" ? true : null, onclick: function (e) { e.preventDefault(); wz.showCustom = !wz.showCustom; App.refreshWin(id); } })]));
        if (wz.portMode === "custom" && wz.showCustom) box.appendChild(portEditor(wz));
        box.appendChild(nav(function () {
          var port = wz.portMode === "standard" ? { name: wz.portName, proto: "RAW", host: wz.host, number: 9100, queue: "" }
            : { name: wz.portName, proto: wz.proto, host: wz.host, number: parseInt(wz.number, 10) || 9100, queue: wz.queue };
          if (port.proto === "LPR" && !String(port.queue).trim()) { wz.error = "Cal indicar el nom de la cua LPR."; return App.refreshWin(id); }
          wz.port = port; go("driver");
        }, "Següent", "tcp"));
      } else if (wz.step === "driver") {
        box.appendChild(h("h2", { text: "Instal·la el controlador de la impressora" }));
        box.appendChild(h("p", { class: "muted", text: "Trieu la impressora a la llista. Si no hi és, feu clic a Windows Update." }));
        var makers = []; D.drivers.forEach(function (d) { if (makers.indexOf(d.maker) === -1) makers.push(d.maker); });
        var mk = h("ul", { class: "pick-list", role: "listbox", "aria-label": "Fabricant" }, makers.map(function (m) {
          return h("li", { role: "option", "aria-selected": m === wz.maker ? "true" : "false", class: m === wz.maker ? "sel" : "", tabindex: "0", onclick: function () { wz.maker = m; wz.driver = ""; App.refreshWin(id); }, text: m });
        }));
        var models = h("ul", { class: "pick-list", role: "listbox", "aria-label": "Impressores" }, D.drivers.filter(function (d) { return d.maker === wz.maker; }).map(function (d) {
          return h("li", { role: "option", "aria-selected": d.name === wz.driver ? "true" : "false", class: d.name === wz.driver ? "sel" : "", tabindex: "0", onclick: function () { wz.driver = d.name; App.refreshWin(id); }, text: d.name });
        }));
        box.appendChild(h("div", { class: "drv-grid" }, [h("div", {}, [h("div", { class: "wf-label", text: "Fabricant" }), mk]), h("div", {}, [h("div", { class: "wf-label", text: "Impressores" }), models])]));
        box.appendChild(h("div", { class: "w-actions left" }, [h("button", { class: "w-btn", type: "button", disabled: true, text: "Windows Update" }), h("button", { class: "w-btn", type: "button", disabled: true, text: "Utilitza disc…" })]));
        box.appendChild(nav(function () {
          if (!wz.driver) { wz.error = "Selecciona un controlador."; return App.refreshWin(id); }
          if (!wz.name) wz.name = wz.driver;
          go("name");
        }, "Següent", wz.port && wz.port.proto === "IPP" ? "choose" : "portinfo"));
      } else if (wz.step === "name") {
        box.appendChild(h("h2", { text: "Escriu un nom per a la impressora" }));
        box.appendChild(field("Nom de la impressora:", h("input", { class: "w-input", value: wz.name, oninput: function (e) { wz.name = e.target.value; } })));
        box.appendChild(h("p", { class: "muted", text: "Aquesta impressora s'instal·larà amb el controlador " + wz.driver + "." }));
        box.appendChild(nav(function () {
          var nm = wz.name.trim();
          if (!nm) { wz.error = "Escriu un nom."; return App.refreshWin(id); }
          if (App.state.printers.some(function (p) { return norm(p.name) === norm(nm); })) { wz.error = "Ja hi ha una impressora amb aquest nom."; return App.refreshWin(id); }
          go("share");
        }, "Següent", "driver"));
      } else if (wz.step === "share") {
        box.appendChild(h("h2", { text: "Ús compartit de la impressora" }));
        box.appendChild(h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "sh", checked: wz.shareMode === "no" ? true : null, onchange: function () { wz.shareMode = "no"; } }), " No comparteixis aquesta impressora"]));
        box.appendChild(h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "sh", checked: wz.shareMode === "yes" ? true : null, onchange: function () { wz.shareMode = "yes"; } }), " Comparteix aquesta impressora perquè els altres usuaris de la xarxa la puguin trobar i utilitzar"]));
        box.appendChild(nav(function () {
          var port = clone(wz.port);
          if (port.proto !== "IPP" && !App.state.ports.some(function (x) { return norm(x.name) === norm(port.name); })) App.state.ports.push(clone(port));
          var p = { id: "p" + Date.now(), name: wz.name.trim(), driver: wz.driver, port: port, isDefault: App.state.printers.length === 0, duplexUnit: false, tray2: false, prefs: { duplex: "none", paper: "A4", orient: "portrait" }, shared: wz.shareMode === "yes" };
          App.state.printers.push(p);
          wz.created = p.id; wz.setDefault = p.isDefault;
          App.touch(); App.refreshWhere("printers"); go("done");
        }, "Següent", "name"));
      } else if (wz.step === "done") {
        var p = printerById(wz.created);
        if (!p) { App.closeWin(id); return; }
        box.appendChild(h("h2", { text: "Heu afegit correctament " + p.name }));
        box.appendChild(h("label", { class: "w-check" }, [h("input", { type: "checkbox", checked: p.isDefault ? true : null, onchange: function (e) { if (e.target.checked) App.state.printers.forEach(function (x) { x.isDefault = x.id === p.id; }); else p.isDefault = false; App.touch(); } }), " Estableix com a impressora predeterminada"]));
        box.appendChild(h("p", { class: "muted", text: "Per comprovar que la impressora funciona correctament o per veure la informació de solució de problemes, imprimiu una pàgina de prova." }));
        box.appendChild(h("button", { class: "w-btn", type: "button", text: "Imprimeix una pàgina de prova", onclick: function () {
          wz.testMsg = { kind: "info", text: "S'està enviant la pàgina de prova…" }; App.refreshWin(id);
          App.printJob(p, { doc: "Pàgina de prova de Windows", pages: 1, method: "prova" }).then(function (r) {
            wz.testMsg = r.ok ? { kind: "ok", text: "S'ha enviat una pàgina de prova a la impressora. Mira'n l'estat a «Els meus documents»." } : { kind: "error", text: "No s'ha pogut imprimir la pàgina de prova: " + r.msg };
            if (App.isOpen(id)) App.refreshWin(id);
          });
        } }));
        if (wz.testMsg) box.appendChild(msgBox(wz.testMsg.text, wz.testMsg.kind));
        box.appendChild(h("div", { class: "w-actions wz-nav" }, [h("button", { class: "w-btn primary", type: "button", text: "Finalitza", onclick: function () { App.closeWin(id); } })]));
      }
    },
    onclose: dropWs
  };

  // Editor de port TCP/IP estàndard (Raw / LPR), compartit per l'assistent i les propietats
  function portEditor(o) {
    var wrap = h("div", { class: "port-editor" });
    wrap.appendChild(h("div", { class: "wf-label", text: "Configura el monitor de port TCP/IP estàndard" }));
    wrap.appendChild(h("div", { class: "pe-row" }, [
      h("span", { text: "Protocol:" }),
      h("label", { class: "w-radio" }, [h("input", { type: "radio", name: "pe" + (o.id || "wz"), checked: o.proto === "RAW" ? true : null, onchange: function () { o.proto = "RAW"; o._rer && o._rer(); } }), " Raw"]),
      h("label", { class: "w-radio" }, [h("input", { type: "radio", name: "pe" + (o.id || "wz"), checked: o.proto === "LPR" ? true : null, onchange: function () { o.proto = "LPR"; o._rer && o._rer(); } }), " LPR"])
    ]));
    wrap.appendChild(h("fieldset", { class: "w-fieldset" + (o.proto !== "RAW" ? " dim" : "") }, [h("legend", { text: "Configuració Raw" }),
      field("Número de port:", h("input", { class: "w-input mono", value: o.number, disabled: o.proto !== "RAW" ? true : null, oninput: function (e) { o.number = e.target.value; } }))]));
    wrap.appendChild(h("fieldset", { class: "w-fieldset" + (o.proto !== "LPR" ? " dim" : "") }, [h("legend", { text: "Configuració LPR" }),
      field("Nom de la cua:", h("input", { class: "w-input mono", value: o.queue || "", disabled: o.proto !== "LPR" ? true : null, oninput: function (e) { o.queue = e.target.value; } })),
      h("label", { class: "w-check" }, [h("input", { type: "checkbox", disabled: o.proto !== "LPR" ? true : null, checked: o.byteCount ? true : null, onchange: function (e) { o.byteCount = e.target.checked; } }), " Recompte de bytes LPR habilitat"])]));
    return wrap;
  }

  // =================================================================== Propietats de la impressora
  App.apps.props = {
    title: function (arg, id) { var p = printerById(id.split(":")[1]); return "Propietats de: " + (p ? p.name : "impressora"); },
    icon: "🖨️", w: 600, h: 540,
    render: function (body, arg, id) {
      var pid = id.split(":")[1];
      var p = printerById(pid);
      if (!p) { body.appendChild(msgBox("La impressora ja no existeix.", "error")); return; }
      var st = ws(id, function () {
        var d = clone(p);
        return { tab: "general", d: d, msg: null, editPort: false,
          pe: { id: id, proto: d.port.proto === "LPR" ? "LPR" : "RAW", number: String(d.port.number || 9100), queue: d.port.queue || "", byteCount: false, host: d.port.host || "", url: d.port.url || "" } };
      });
      var d = st.d;
      st.pe._rer = function () { App.refreshWin(id); };
      var panel = tabs(body, [{ id: "general", label: "General" }, { id: "ports", label: "Ports" }, { id: "adv", label: "Avançat" }, { id: "dev", label: "Configuració del dispositiu" }], st.tab, function (t) { st.tab = t; App.refreshWin(id); });
      var di = App.driverInfo(d.driver) || {};
      if (st.tab === "general") {
        panel.appendChild(field("Nom:", h("input", { class: "w-input", value: d.name, oninput: function (e) { d.name = e.target.value; } })));
        panel.appendChild(h("table", { class: "kv" }, [
          h("tr", {}, [h("th", { text: "Model" }), h("td", { text: d.driver })]),
          h("tr", {}, [h("th", { text: "Port" }), h("td", { class: "mono", text: d.port.proto === "IPP" ? d.port.url : d.port.name })]),
          h("tr", {}, [h("th", { text: "Doble cara" }), h("td", { text: (!di.generic && d.duplexUnit) ? "Sí" : "No" })]),
          h("tr", {}, [h("th", { text: "Paper disponible" }), h("td", { text: di.generic ? "A4" : allForms().join(", ") })])
        ]));
        panel.appendChild(h("div", { class: "w-actions left" }, [
          h("button", { class: "w-btn", type: "button", text: "Preferències…", onclick: function () { App.openApp("prefs:" + pid); } }),
          h("button", { class: "w-btn", type: "button", text: "Imprimeix una pàgina de prova", onclick: function () { App.printJob(p, { doc: "Pàgina de prova de Windows", pages: 1, method: "prova" }); } })
        ]));
      } else if (st.tab === "ports") {
        panel.appendChild(h("p", { class: "muted", text: "Imprimeix als ports següents. Els documents s'imprimiran al primer port lliure marcat." }));
        var portRows = [["LPT1:", "Port d'impressora", false], ["COM1:", "Port sèrie", false], ["FILE:", "Imprimeix a un fitxer", false],
          [d.port.proto === "IPP" ? d.port.url : d.port.name, d.port.proto === "IPP" ? "Port IPP" : "Port TCP/IP estàndard (" + d.port.proto + ")", true]];
        panel.appendChild(h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, [h("th", { text: "" }), h("th", { text: "Port" }), h("th", { text: "Descripció" })])),
          h("tbody", {}, portRows.map(function (r) { return h("tr", { class: r[2] ? "sel" : "" }, [h("td", { text: r[2] ? "☑" : "☐" }), h("td", { class: "mono", text: r[0] }), h("td", { text: r[1] })]); }))]));
        panel.appendChild(h("div", { class: "w-actions left" }, [h("button", { class: "w-btn", type: "button", text: st.editPort ? "Amaga la configuració" : "Configura el port…", onclick: function () { st.editPort = !st.editPort; App.refreshWin(id); } })]));
        if (st.editPort) {
          if (d.port.proto === "IPP") {
            panel.appendChild(field("Adreça de la impressora (URL):", h("input", { class: "w-input mono", value: st.pe.url, oninput: function (e) { st.pe.url = e.target.value; } })));
          } else {
            panel.appendChild(field("Nom del port:", h("input", { class: "w-input mono", value: d.port.name, disabled: true })));
            panel.appendChild(field("Nom de la impressora o adreça IP:", h("input", { class: "w-input mono", value: st.pe.host, oninput: function (e) { st.pe.host = e.target.value.trim(); } })));
            panel.appendChild(portEditor(st.pe));
          }
        }
      } else if (st.tab === "adv") {
        panel.appendChild(field("Controlador:", select(D.drivers.map(function (x) { return x.name; }), d.driver, { onchange: function (e) { d.driver = e.target.value; } })));
        panel.appendChild(h("div", { class: "w-actions left" }, [h("button", { class: "w-btn", type: "button", disabled: true, text: "Controlador nou…" })]));
        panel.appendChild(h("p", { class: "muted", text: "Si el controlador no correspon al model de la impressora, els documents poden sortir amb caràcters estranys o sense les funcions de la impressora." }));
      } else {
        if (di.generic) panel.appendChild(h("p", { text: "Aquest controlador no té opcions instal·lables." }));
        else {
          panel.appendChild(h("div", { class: "tree" }, [
            h("div", { class: "tree-h", text: "▾ Taula de substitució de formularis per safata" }),
            h("div", { class: "tree-i", text: "Selecció automàtica: A4" }),
            h("div", { class: "tree-h", text: "▾ Opcions instal·lables" }),
            h("div", { class: "tree-i" }, ["Unitat d'impressió a doble cara: ", select([["0", "No instal·lada"], ["1", "Instal·lada"]], d.duplexUnit ? "1" : "0", { "aria-label": "Unitat d'impressió a doble cara", onchange: function (e) { d.duplexUnit = e.target.value === "1"; } })]),
            h("div", { class: "tree-i" }, ["Safata 2: ", select([["0", "No instal·lada"], ["1", "Instal·lada"]], d.tray2 ? "1" : "0", { onchange: function (e) { d.tray2 = e.target.value === "1"; } })]),
            h("div", { class: "tree-i", text: "Memòria de la impressora: 256 MB" })
          ]));
        }
      }
      if (st.msg) body.appendChild(msgBox(st.msg.text, st.msg.kind));
      body.appendChild(h("div", { class: "w-actions" }, [
        h("button", { class: "w-btn primary", type: "button", text: "D'acord", onclick: function () { if (save()) App.closeWin(id); } }),
        h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } }),
        h("button", { class: "w-btn", type: "button", text: "Aplica", onclick: function () { if (save()) { st.msg = { kind: "ok", text: "S'han aplicat els canvis." }; App.refreshWin(id); } } })
      ]));
      function save() {
        var nm = d.name.trim();
        if (!nm) { st.msg = { kind: "error", text: "El nom no pot estar buit." }; App.refreshWin(id); return false; }
        if (App.state.printers.some(function (x) { return x.id !== p.id && norm(x.name) === norm(nm); })) { st.msg = { kind: "error", text: "Ja hi ha una altra impressora amb aquest nom." }; App.refreshWin(id); return false; }
        if (st.editPort) {
          if (d.port.proto === "IPP") d.port.url = st.pe.url.trim();
          else {
            d.port.host = st.pe.host; d.port.proto = st.pe.proto; d.port.number = parseInt(st.pe.number, 10) || 9100; d.port.queue = st.pe.queue;
            if (d.port.proto === "LPR" && !String(d.port.queue).trim()) { st.msg = { kind: "error", text: "Cal indicar el nom de la cua LPR." }; App.refreshWin(id); return false; }
            App.state.ports.forEach(function (x) { if (norm(x.name) === norm(d.port.name)) { x.host = d.port.host; x.proto = d.port.proto; x.number = d.port.number; x.queue = d.port.queue; } });
          }
        }
        var curP = printerById(pid); if (curP) d.prefs = clone(curP.prefs);
        var newDi = App.driverInfo(d.driver) || {};
        if (newDi.generic) { d.duplexUnit = false; d.prefs.duplex = "none"; d.prefs.paper = "A4"; }
        if (!d.duplexUnit) d.prefs.duplex = "none";
        d.name = nm;
        var idx = App.state.printers.indexOf(p);
        App.state.printers[idx] = clone(d);
        App.touch(); App.refreshWhere("printers"); App.refreshWhere("prefs:" + p.id);
        App.setWinTitle(id, "Propietats de: " + nm);
        return true;
      }
    },
    onclose: dropWs
  };

  // =================================================================== Preferències d'impressió
  App.apps.prefs = {
    title: function (arg, id) { var p = printerById(id.split(":")[1]); return "Preferències d'impressió: " + (p ? p.name : ""); },
    icon: "🖨️", w: 500, h: 430,
    render: function (body, arg, id) {
      var p = printerById(id.split(":")[1]);
      if (!p) { body.appendChild(msgBox("La impressora ja no existeix.", "error")); return; }
      var di = App.driverInfo(p.driver) || {};
      var st = ws(id, function () { return { d: clone(p.prefs), msg: null }; });
      var dd = st.d;
      var forms = di.generic ? ["A4"] : allForms();
      body.appendChild(h("div", { class: "prefs" }, [
        h("h3", { text: "Format i paper" }),
        field("Mida del paper:", select(forms, dd.paper, { onchange: function (e) { dd.paper = e.target.value; } })),
        h("div", { class: "pe-row" }, [h("span", { text: "Orientació:" }),
          h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "o", checked: dd.orient !== "landscape" ? true : null, onchange: function () { dd.orient = "portrait"; } }), " Vertical"]),
          h("label", { class: "w-radio" }, [h("input", { type: "radio", name: id + "o", checked: dd.orient === "landscape" ? true : null, onchange: function () { dd.orient = "landscape"; } }), " Horitzontal"])]),
        h("h3", { text: "Imprimeix per les dues cares" }),
        di.generic ? h("p", { class: "muted", text: "Aquest controlador no admet la impressió a doble cara." }) :
          field("Doble cara:", select([["none", "No"], ["long", "Sí, gira per la vora llarga"], ["short", "Sí, gira per la vora curta"]], dd.duplex, { disabled: !p.duplexUnit ? true : null, onchange: function (e) { dd.duplex = e.target.value; } }),
            !p.duplexUnit ? "No disponible: la impressora no té cap unitat de doble cara instal·lada (Propietats de la impressora › Configuració del dispositiu)." : null),
        st.msg ? msgBox(st.msg.text, st.msg.kind) : null,
        h("div", { class: "w-actions" }, [
          h("button", { class: "w-btn primary", type: "button", text: "D'acord", onclick: function () { p.prefs = clone(dd); if (!p.duplexUnit) p.prefs.duplex = "none"; App.touch(); App.closeWin(id); } }),
          h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } }),
          h("button", { class: "w-btn", type: "button", text: "Aplica", onclick: function () { p.prefs = clone(dd); if (!p.duplexUnit) p.prefs.duplex = "none"; App.touch(); st.msg = { kind: "ok", text: "S'han aplicat els canvis." }; App.refreshWin(id); } })
        ])
      ]));
    },
    onclose: dropWs
  };

  // =================================================================== Propietats del servidor d'impressió
  App.apps.serverprops = {
    title: "Propietats del servidor d'impressió", icon: "🗄️", w: 600, h: 560,
    render: function (body, arg, id) {
      var st = ws(id, function () { return { tab: "forms", sel: "A4", create: false, name: "", w: "", hgt: "", ml: "0,5", mr: "0,5", mt: "0,5", mb: "0,5", msg: null }; });
      var panel = tabs(body, [{ id: "forms", label: "Formularis" }, { id: "ports", label: "Ports" }, { id: "drivers", label: "Controladors" }], st.tab, function (t) { st.tab = t; App.refreshWin(id); });
      if (st.tab === "forms") {
        var forms = D.standardForms.map(function (f) { return { name: f.name, w: f.w, h: f.h, std: true }; }).concat(App.state.forms.map(function (f) { return { name: f.name, w: f.w, h: f.h, std: false }; }));
        var cur = forms.filter(function (f) { return f.name === st.sel; })[0] || forms[0];
        panel.appendChild(h("div", { class: "wf-label", text: "Formularis a: " + App.device.id }));
        panel.appendChild(h("ul", { class: "pick-list tall", role: "listbox", "aria-label": "Formularis" }, forms.map(function (f) {
          return h("li", { role: "option", tabindex: "0", class: f.name === cur.name ? "sel" : "", "aria-selected": f.name === cur.name ? "true" : "false", onclick: function () { st.sel = f.name; st.create = false; App.refreshWin(id); }, text: f.name + (f.std ? "" : "  (personalitzat)") });
        })));
        panel.appendChild(h("label", { class: "w-check" }, [h("input", { type: "checkbox", checked: st.create ? true : null, onchange: function (e) { st.create = e.target.checked; App.refreshWin(id); } }), " Crea un formulari nou"]));
        var dis = !st.create ? true : null;
        function num(key, label) { return field(label, h("input", { class: "w-input mono sm", value: st.create ? st[key] : (key === "w" ? String(cur.w).replace(".", ",") : key === "hgt" ? String(cur.h).replace(".", ",") : "0,5"), disabled: dis, inputmode: "decimal", oninput: function (e) { st[key] = e.target.value; } }), "cm"); }
        panel.appendChild(field("Nom del formulari:", h("input", { class: "w-input", value: st.create ? st.name : cur.name, disabled: dis, oninput: function (e) { st.name = e.target.value; } })));
        panel.appendChild(h("div", { class: "forms-grid" }, [
          h("fieldset", { class: "w-fieldset" }, [h("legend", { text: "Mida del paper" }), num("w", "Amplada:"), num("hgt", "Alçada:")]),
          h("fieldset", { class: "w-fieldset" }, [h("legend", { text: "Marges de l'àrea d'impressió" }), num("ml", "Esquerre:"), num("mr", "Dret:"), num("mt", "Superior:"), num("mb", "Inferior:")])
        ]));
        if (st.msg) panel.appendChild(msgBox(st.msg.text, st.msg.kind));
        panel.appendChild(h("div", { class: "w-actions left" }, [
          h("button", { class: "w-btn primary", type: "button", text: "Desa el formulari", disabled: dis, onclick: function () {
            var nm = String(st.name).trim().replace(/\s+/g, " ");
            var w = parseFloat(String(st.w).replace(",", ".")), hh = parseFloat(String(st.hgt).replace(",", "."));
            if (!nm) st.msg = { kind: "error", text: "Escriu el nom del formulari." };
            else if (forms.some(function (f) { return norm(f.name) === norm(nm); })) st.msg = { kind: "error", text: "Ja existeix un formulari amb aquest nom." };
            else if (!(w >= 1 && w <= 100 && hh >= 1 && hh <= 100)) st.msg = { kind: "error", text: "L'amplada i l'alçada han de ser números entre 1 i 100 cm." };
            else {
              App.state.forms.push({ name: nm, w: w, h: hh });
              st.sel = nm; st.create = false; st.name = ""; st.w = ""; st.hgt = "";
              st.msg = { kind: "ok", text: "S'ha desat el formulari «" + nm + "»." + (App.formMatches(nm) ? "" : " (Recorda que la missió demana el nom «Carta de " + App.firstName() + "».)") };
              App.touch();
            }
            App.refreshWin(id);
          } }),
          !cur.std && !st.create ? h("button", { class: "w-btn danger", type: "button", text: "Suprimeix", onclick: function () { App.state.forms = App.state.forms.filter(function (f) { return f.name !== cur.name; }); st.sel = "A4"; App.touch(); App.refreshWin(id); } }) : null
        ]));
      } else if (st.tab === "ports") {
        var rows = [["LPT1:", "Port d'impressora", ""], ["COM1:", "Port sèrie", ""], ["FILE:", "Imprimeix a un fitxer", ""], ["PORTPROMPT:", "Port local", "Microsoft Print to PDF"]];
        App.state.ports.forEach(function (pt) { rows.push([pt.name, "Port TCP/IP estàndard (" + pt.proto + (pt.proto === "LPR" ? ", cua " + pt.queue : ", port " + pt.number) + ")", App.state.printers.filter(function (p) { return p.port.name === pt.name; }).map(function (p) { return p.name; }).join(", ")]); });
        App.state.printers.filter(function (p) { return p.port.proto === "IPP"; }).forEach(function (p) { rows.push([p.port.url, "Port IPP", p.name]); });
        panel.appendChild(h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, ["Port", "Descripció", "Impressora"].map(function (t) { return h("th", { text: t }); }))), h("tbody", {}, rows.map(function (r) { return h("tr", {}, r.map(function (c, i) { return h("td", { class: i === 0 ? "mono" : "", text: c }); })); }))]));
      } else {
        var used = []; App.state.printers.forEach(function (p) { if (used.indexOf(p.driver) === -1) used.push(p.driver); });
        panel.appendChild(h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, ["Nom", "Entorn", "Tipus"].map(function (t) { return h("th", { text: t }); }))),
          h("tbody", {}, ["Microsoft Print To PDF"].concat(used).map(function (n) { return h("tr", {}, [h("td", { text: n }), h("td", { text: "x64" }), h("td", { text: "Tipus 3 · Mode d'usuari" })]); }))]));
      }
    },
    onclose: dropWs
  };

  // =================================================================== Cua d'impressió d'una impressora
  App.apps.queue = {
    title: function (arg, id) { var p = printerById(id.split(":")[1]); return (p ? p.name : "Impressora") + " · Cua d'impressió"; },
    icon: "📄", w: 640, h: 360,
    render: function (body, arg, id) {
      var pid = id.split(":")[1], p = printerById(pid);
      var jobs = App.state.localJobs.filter(function (j) { return j.printerId === pid; });
      body.appendChild(h("div", { class: "q-menu" }, [h("span", { text: "Impressora" }), h("span", { text: "Document" }), h("span", { text: "Visualitza" })]));
      if (!jobs.length) { body.appendChild(h("p", { class: "muted pad", text: "No hi ha cap document a la cua." })); return; }
      var tb = h("tbody");
      jobs.forEach(function (j) {
        var sj = j.sharedId ? App.shared.jobs.filter(function (x) { return x.id === j.sharedId; })[0] : null;
        var status = j.status === "error" ? "Error - " + j.error : j.status === "sending" ? "S'està enviant" : App.jobStatusText(sj);
        tb.appendChild(h("tr", { class: j.status === "error" ? "err" : "" }, [
          h("td", { text: j.doc }), h("td", { text: status }), h("td", { text: App.user }), h("td", { text: String(j.pages * (j.copies || 1)) }), h("td", { text: App.fmtTime(j.at) }),
          h("td", {}, j.status === "error" && p ? [
            h("button", { class: "w-btn sm", type: "button", text: "Reinicia", onclick: function () {
              App.state.localJobs = App.state.localJobs.filter(function (x) { return x !== j; });
              App.printJob(p, { doc: j.doc, pages: j.pages, copies: j.copies, duplex: j.duplex, paper: j.paper, method: j.method });
            } }), " ",
            h("button", { class: "w-btn sm", type: "button", text: "Cancel·la", onclick: function () { App.state.localJobs = App.state.localJobs.filter(function (x) { return x !== j; }); App.touch(); App.refreshWin(id); } })
          ] : null)
        ]));
      });
      body.appendChild(h("table", { class: "w-table q-table" }, [h("thead", {}, h("tr", {}, ["Nom del document", "Estat", "Propietari", "Pàgines", "Enviat", ""].map(function (t) { return h("th", { text: t }); }))), tb]));
    }
  };

  // =================================================================== Documents i Bloc de notes
  App.apps.documents = {
    title: "Documents", icon: "📁", w: 600, h: 400,
    render: function (body) {
      body.appendChild(h("div", { class: "fx-path mono", text: "C:\\Users\\" + App.user + "\\Documents" }));
      var docs = D.docs[App.dept.id] || [];
      body.appendChild(h("table", { class: "w-table fx" }, [h("thead", {}, h("tr", {}, ["Nom", "Tipus", "Pàgines"].map(function (t) { return h("th", { text: t }); }))),
        h("tbody", {}, docs.map(function (d) {
          return h("tr", { class: "fx-row", tabindex: "0", onclick: function () { App.openApp("note:" + d.file); }, onkeydown: function (e) { if (e.key === "Enter") App.openApp("note:" + d.file); } }, [
            h("td", {}, [h("span", { class: "fx-ico", text: "📄" }), d.file]), h("td", { text: "Document de text" }), h("td", { text: String(d.pages) })]);
        }))]));
      body.appendChild(h("p", { class: "muted pad", text: "Obre un document i fes servir Fitxer › Imprimeix per enviar-lo a una impressora." }));
    }
  };
  App.apps.note = {
    title: function (arg, id) { return id.slice(5) + " - Bloc de notes"; }, icon: "📝", w: 600, h: 420,
    render: function (body, arg, id) {
      var file = id.slice(5), doc = App.docByName(file);
      var st = ws(id, function () { return { menu: false }; });
      body.appendChild(h("div", { class: "np-menu" }, [
        h("div", { class: "np-menu-item" }, [
          h("button", { class: "np-mbtn", type: "button", text: "Fitxer", "aria-expanded": st.menu ? "true" : "false", onclick: function () { st.menu = !st.menu; App.refreshWin(id); } }),
          st.menu ? h("div", { class: "np-drop" }, [
            h("button", { type: "button", text: "Imprimeix…    Ctrl+P", onclick: function () { st.menu = false; App.refreshWin(id); App.openApp("printdlg", file); } }),
            h("button", { type: "button", text: "Tanca", onclick: function () { App.closeWin(id); } })
          ]) : null
        ]),
        h("button", { class: "np-mbtn", type: "button", text: "Edita", disabled: true }), h("button", { class: "np-mbtn", type: "button", text: "Visualitza", disabled: true }),
        h("button", { class: "w-btn sm np-print", type: "button", text: "🖨 Imprimeix", onclick: function () { App.openApp("printdlg", file); } })
      ]));
      body.appendChild(h("pre", { class: "np-text", text: doc ? doc.text + "\n\n[" + doc.pages + " pàgines]" : "No es troba el fitxer." }));
    },
    onclose: dropWs
  };
  App.apps.printdlg = {
    title: "Imprimeix", icon: "🖨️", w: 460, h: 470,
    reopen: function (body, arg, id) { var s = WS[id]; if (s && arg) { s.file = arg; App.refreshWin(id); } },
    render: function (body, arg, id) {
      var st = ws(id, function () {
        var dp = App.defaultPrinter();
        return { file: arg, printer: dp ? dp.id : (App.state.printers[0] ? App.state.printers[0].id : "pdf"), copies: "1", paper: null, duplex: null, msg: null };
      });
      var doc = App.docByName(st.file);
      var list = App.state.printers.concat([App.pdfPrinter]);
      var p = printerById(st.printer) || App.pdfPrinter;
      var di = App.driverInfo(p.driver) || {};
      if (st.paper === null) st.paper = (p.prefs && p.prefs.paper) || "A4";
      if (st.duplex === null) st.duplex = (p.prefs && p.prefs.duplex) || "none";
      var forms = (p.id === "pdf" || di.generic) ? ["A4"] : allForms();
      if (forms.indexOf(st.paper) === -1) st.paper = "A4";
      var canDuplex = p.id !== "pdf" && !di.generic && p.duplexUnit;
      body.appendChild(h("div", { class: "printdlg" }, [
        h("div", { class: "pd-doc" }, [h("span", { class: "fx-ico", text: "📄" }), h("strong", { text: st.file }), h("span", { class: "muted", text: doc ? doc.pages + " pàgines" : "" })]),
        field("Impressora:", select(list.map(function (x) { return [x.id, x.name + (x.isDefault ? " (predeterminada)" : "")]; }), st.printer, { onchange: function (e) {
          st.printer = e.target.value; var np = printerById(st.printer) || App.pdfPrinter; st.paper = (np.prefs && np.prefs.paper) || "A4"; st.duplex = (np.prefs && np.prefs.duplex) || "none"; App.refreshWin(id);
        } })),
        App.state.printers.length === 0 ? msgBox("Encara no tens cap impressora de xarxa instal·lada.", "warn") : null,
        field("Còpies:", select(["1", "2", "3"], st.copies, { onchange: function (e) { st.copies = e.target.value; } })),
        field("Mida del paper:", select(forms, st.paper, { onchange: function (e) { st.paper = e.target.value; } })),
        field("Imprimeix per les dues cares:", select([["none", "No"], ["long", "Gira per la vora llarga"], ["short", "Gira per la vora curta"]], canDuplex ? st.duplex : "none", { disabled: !canDuplex ? true : null, onchange: function (e) { st.duplex = e.target.value; } }),
          !canDuplex && p.id !== "pdf" ? "La impressora no té la doble cara disponible." : null),
        st.msg ? msgBox(st.msg.text, st.msg.kind) : null,
        h("div", { class: "w-actions" }, [
          h("button", { class: "w-btn primary", type: "button", text: "Imprimeix", onclick: function () {
            if (!doc) return;
            App.printJob(p, { doc: st.file, pages: doc.pages, copies: parseInt(st.copies, 10), duplex: canDuplex ? st.duplex : "none", paper: st.paper, method: "gui" });
            App.closeWin(id);
          } }),
          h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } })
        ])
      ]));
    },
    onclose: dropWs
  };

  // =================================================================== Característiques del Windows
  App.apps.features = {
    title: "Característiques del Windows", icon: "🧩", w: 520, h: 480,
    render: function (body, arg, id) {
      var st = ws(id, function () { return { lpr: !!App.state.features.lpr, busy: false, done: false }; });
      body.appendChild(h("h3", { text: "Activa o desactiva les característiques del Windows" }));
      body.appendChild(h("p", { class: "muted", text: "Per activar una característica, marqueu-ne la casella. Per desactivar-la, desmarqueu-la." }));
      function item(label, checked, extra) { return h("label", { class: "w-check tree-i" }, [h("input", Object.assign({ type: "checkbox", checked: checked ? true : null }, extra || {})), " " + label]); }
      body.appendChild(h("div", { class: "tree feat" }, [
        item(".NET Framework 3.5 (inclou .NET 2.0 i 3.0)", false, { disabled: true }),
        item("Client Telnet", false, { disabled: true }),
        item("Client TFTP", false, { disabled: true }),
        h("div", { class: "tree-h", text: "▾ Serveis d'impressió i documents" }),
        h("div", { class: "tree-sub" }, [
          item("Client d'impressió per Internet", true, { disabled: true }),
          item("Monitor de port LPR", st.lpr, { onchange: function (e) { st.lpr = e.target.checked; } }),
          item("Servei LPD", false, { disabled: true }),
          item("Servei d'escaneig i de fax de Windows", false, { disabled: true })
        ]),
        item("Subsistema del Windows per a Linux", false, { disabled: true })
      ]));
      if (st.busy) body.appendChild(h("div", { class: "set-searching" }, [h("span", { class: "spinner" }), " El Windows està aplicant els canvis…"]));
      if (st.done) body.appendChild(msgBox("El Windows ha completat els canvis sol·licitats.", "ok"));
      body.appendChild(h("div", { class: "w-actions" }, [
        h("button", { class: "w-btn primary", type: "button", text: "D'acord", disabled: st.busy ? true : null, onclick: function () {
          st.busy = true; App.refreshWin(id);
          setTimeout(function () { App.state.features.lpr = st.lpr; st.busy = false; st.done = true; App.touch(); if (App.isOpen(id)) App.refreshWin(id); }, 1400);
        } }),
        h("button", { class: "w-btn", type: "button", text: "Cancel·la", onclick: function () { App.closeWin(id); } })
      ]));
    },
    onclose: dropWs
  };

  // =================================================================== Navegador i interfície web de la impressora
  App.apps.browser = {
    title: "Navegador", icon: "🌍", w: 780, h: 540, bodyClass: "nobpad",
    reopen: function (body, arg, id) { if (arg) { var s = WS[id]; s.pending = arg; App.refreshWin(id); } },
    render: function (body, arg, id) {
      var st = ws(id, function () { return { url: "", view: { kind: "home" }, certOk: {}, pending: arg || null, login: "" }; });
      var addr = h("input", { class: "br-addr mono", value: st.url, placeholder: "Escriu una adreça", "aria-label": "Barra d'adreces", onkeydown: function (e) { if (e.key === "Enter") navigate(addr.value); } });
      body.appendChild(h("div", { class: "br-bar" }, [
        h("button", { class: "br-btn", type: "button", title: "Actualitza", "aria-label": "Actualitza", text: "⟳", onclick: function () { if (st.url) navigate(st.url); } }),
        addr,
        h("button", { class: "w-btn sm", type: "button", text: "Ves-hi", onclick: function () { navigate(addr.value); } })
      ]));
      var page = h("div", { class: "br-page" });
      body.appendChild(page);
      if (st.pending) { var pnd = st.pending; st.pending = null; setTimeout(function () { navigate(pnd); }, 0); }
      draw();

      function navigate(raw) {
        raw = String(raw || "").trim(); if (!raw) return;
        if (!/^[a-z]+:\/\//i.test(raw)) raw = "http://" + raw;
        var m = /^(https?):\/\/([^\/:\s]+)(?::(\d+))?(\/[^\s]*)?$/i.exec(raw);
        if (!m) { st.view = { kind: "error", code: "ERR_INVALID_URL", title: "Aquesta adreça no és vàlida", text: "Revisa el que has escrit." }; st.url = raw; return App.refreshWin(id); }
        var scheme = m[1].toLowerCase(), host = m[2].toLowerCase(), port = m[3] ? parseInt(m[3], 10) : (scheme === "https" ? 443 : 80), path = (m[4] || "/").toLowerCase();
        st.url = scheme + "://" + host + (m[3] ? ":" + m[3] : "") + (m[4] || "/");
        var r = N.resolve(App.device, App.state.net, host);
        if (!r.ok) { st.view = { kind: "error", code: "ERR_NAME_NOT_RESOLVED", title: "No es pot accedir a aquest lloc web", text: "No s'ha trobat l'adreça del servidor de " + host + "." }; return App.refreshWin(id); }
        var c = N.connect(App.device, App.state.net, r.ip, "tcp", port);
        if (!c.ok) {
          if (c.stage === "route") st.view = { kind: "error", code: "ERR_ADDRESS_UNREACHABLE", title: "No es pot accedir a aquest lloc web", text: "No es pot arribar a " + host + ". " + App.routeMsg(c.reason) + "." };
          else if (c.stage === "acl") { App.logDeny(c.deny); st.view = { kind: "error", code: "ERR_CONNECTION_TIMED_OUT", title: "No es pot accedir a aquest lloc web", text: host + " ha trigat massa a respondre." }; }
          else st.view = { kind: "error", code: "ERR_CONNECTION_REFUSED", title: "No es pot accedir a aquest lloc web", text: host + " ha rebutjat la connexió." };
          return App.refreshWin(id);
        }
        var t = N.hostAt(r.ip);
        if (!t || t.kind !== "printer" || (port !== 80 && port !== 443)) { st.view = { kind: "error", code: "ERR_EMPTY_RESPONSE", title: "Aquesta pàgina no funciona", text: host + " no ha enviat cap dada." }; return App.refreshWin(id); }
        if (scheme === "https" && !st.certOk[r.ip]) { st.view = { kind: "cert", ip: r.ip, path: path }; return App.refreshWin(id); }
        var sec = { "/": "home", "/index.html": "home", "/inici": "home", "/consumibles": "supplies", "/treballs": "jobs", "/xarxa": "net", "/configuracio": "config" }[path.replace(/\/$/, "") || "/"] || "notfound";
        st.view = { kind: "ews", sec: sec, base: scheme + "://" + host + (m[3] ? ":" + m[3] : ""), at: Date.now() };
        if (sec === "supplies") { App.state.flags.tonerSeen = Math.round(Number(App.shared.printer.toner)); App.state.flags.ewsSupplies = true; App.touch(); }
        App.refreshWin(id);
      }
      function draw() {
        var v = st.view;
        if (v.kind === "home") {
          page.appendChild(h("div", { class: "br-home" }, [h("div", { class: "br-logo", text: "🌍" }), h("p", { class: "muted", text: "Escriu una adreça a la barra de dalt." }), h("p", { class: "muted", text: "No hi ha accés a Internet des de la xarxa de l'empresa." })]));
        } else if (v.kind === "error") {
          page.appendChild(h("div", { class: "br-error" }, [h("div", { class: "br-sad", text: "☹" }), h("h2", { text: v.title }), h("p", { text: v.text }), h("p", { class: "muted mono", text: v.code })]));
        } else if (v.kind === "cert") {
          page.appendChild(h("div", { class: "br-error cert" }, [h("div", { class: "br-sad", text: "⚠" }), h("h2", { text: "La connexió no és privada" }),
            h("p", { text: "El certificat d'aquest dispositiu l'ha signat ell mateix i el navegador no el pot verificar." }), h("p", { class: "muted mono", text: "NET::ERR_CERT_AUTHORITY_INVALID" }),
            h("button", { class: "w-btn", type: "button", text: "Avançat › Continua a " + v.ip + " (no és segur)", onclick: function () { st.certOk[v.ip] = true; navigate(st.url); } })]));
        } else if (v.kind === "ews") ews(v);
      }
      function ews(v) {
        var pr = App.shared.printer || {}, P = D.printer;
        var toner = Math.round(Number(pr.toner));
        var nav = [["home", "/", "Inici"], ["supplies", "/consumibles", "Consumibles"], ["jobs", "/treballs", "Registre de treballs"], ["net", "/xarxa", "Xarxa"], ["config", "/configuracio", "Configuració"]];
        var side = h("nav", { class: "ews-nav" }, nav.map(function (n) { return h("button", { class: "ews-link" + (v.sec === n[0] ? " active" : ""), type: "button", text: n[2], onclick: function () { navigate(v.base + n[1]); } }); }));
        var main = h("div", { class: "ews-main" });
        var status = pr.online === false ? "Fora de línia" : (toner <= 0 ? "Tòner esgotat" : (App.shared.jobs.some(function (j) { return j.status === "printing"; }) ? "S'està imprimint" : "Preparada"));
        if (v.sec === "home") {
          main.appendChild(h("h2", { text: "Estat del dispositiu" }));
          main.appendChild(h("div", { class: "ews-status " + (status === "Preparada" || status === "S'està imprimint" ? "ok" : "ko"), text: status }));
          main.appendChild(h("table", { class: "kv" }, [kvr("Model", P.model), kvr("Nom d'amfitrió", P.fqdn), kvr("Ubicació", P.location), kvr("Safata 1", "A4 · carregada"), kvr("Consumibles", "Consulteu la pàgina Consumibles")]));
        } else if (v.sec === "supplies") {
          main.appendChild(h("h2", { text: "Estat dels consumibles" }));
          main.appendChild(h("div", { class: "ews-supply" }, [h("div", { class: "es-label", text: "Cartutx de tòner negre · Lumina LT-40X" }),
            h("div", { class: "es-bar", role: "img", "aria-label": "Tòner " + toner + "%" }, h("div", { class: toner < 15 ? "low" : "", style: "width:" + Math.max(0, Math.min(100, toner)) + "%" })),
            h("div", { class: "es-val", text: toner + " %" })]));
          main.appendChild(h("table", { class: "kv" }, [kvr("Pàgines restants (aprox.)", String(Math.max(0, Math.round(toner * 30)))), kvr("Pàgines impreses (total)", String(pr.pages_total || 0)), kvr("Número de sèrie del cartutx", "LT40X-" + P.serial.slice(-6)), kvr("Darrera actualització", new Date(v.at).toLocaleTimeString("ca-ES"))]));
        } else if (v.sec === "jobs") {
          main.appendChild(h("h2", { text: "Registre de treballs" }));
          var jl = App.shared.jobs.slice(0, 12);
          main.appendChild(jl.length ? h("table", { class: "w-table" }, [h("thead", {}, h("tr", {}, ["Document", "Usuari", "Equip", "Protocol", "Estat"].map(function (t) { return h("th", { text: t }); }))),
            h("tbody", {}, jl.map(function (j) { return h("tr", {}, [h("td", { text: j.doc_name }), h("td", { text: j.student_name }), h("td", { text: j.device_id }), h("td", { text: j.protocol }), h("td", { text: App.jobStatusText(j) })]); }))]) : h("p", { text: "Encara no s'ha imprès cap treball." }));
        } else if (v.sec === "net") {
          main.appendChild(h("h2", { text: "Configuració de xarxa" }));
          main.appendChild(h("table", { class: "kv" }, [kvr("Adreça IPv4", P.ip), kvr("Màscara", P.mask), kvr("Passarel·la", P.gw), kvr("Adreça MAC", P.mac), kvr("Nom d'amfitrió", P.host),
            kvr("RAW / JetDirect", "Activat · port " + P.rawPort), kvr("LPD", "Activat · port " + P.lprPort + " · cua " + P.lprQueue), kvr("IPP", "Activat · port " + P.ippPort + " · " + P.ippPath), kvr("HTTP / HTTPS", "Activats"), kvr("SNMP", "Activat (v2c)"), kvr("WSD", "Activat")]));
        } else if (v.sec === "config") {
          main.appendChild(h("h2", { text: "Configuració" }));
          main.appendChild(h("p", { text: "Cal iniciar sessió com a administrador per canviar la configuració." }));
          var pw = h("input", { class: "w-input", type: "password", "aria-label": "Contrasenya d'administrador" });
          main.appendChild(h("div", { class: "pe-row" }, [pw, h("button", { class: "w-btn", type: "button", text: "Inicia la sessió", onclick: function () { st.login = "Contrasenya incorrecta."; App.refreshWin(id); } })]));
          if (st.login) main.appendChild(msgBox(st.login, "error"));
        } else main.appendChild(h("h2", { text: "404 · Pàgina no trobada" }));
        page.appendChild(h("div", { class: "ews" }, [h("header", { class: "ews-head" }, [h("strong", { text: "Lumina" }), h("span", { text: P.model + " · Servidor web incrustat" })]), h("div", { class: "ews-body" }, [side, main])]));
      }
      function kvr(k, v) { return h("tr", {}, [h("th", { text: k }), h("td", { text: v })]); }
    },
    onclose: dropWs
  };
})();
