/* PR07 · Aplicació de l'alumne · Consola simulada (Símbol del sistema i Windows PowerShell) */
(function () {
  "use strict";
  var App = window.PR07_APP, D = window.PR07_DATA, N = window.PR07_NET;
  var h = App.h, norm = App.norm;
  var CON = {};

  // ------------------------------------------------------------------ utilitats
  function tokenize(line) {
    var out = [], cur = "", q = null, had = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === q) { q = null; } else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; had = true; continue; }
      if (/\s/.test(c)) { if (cur || had) { out.push(cur); cur = ""; had = false; } continue; }
      cur += c;
    }
    if (cur || had) out.push(cur);
    return out;
  }
  function splitPipe(line) {
    var parts = [], cur = "", q = null;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === q) q = null; cur += c; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "|") { parts.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur.trim());
    return parts;
  }
  function pad(s, n) { s = String(s); return s.length >= n ? s + " " : s + new Array(n - s.length + 1).join(" "); }
  // Paràmetres estil PowerShell (accepta prefixos únics, sense distingir majúscules)
  function psParams(args, names, switches) {
    var res = { _pos: [] }; switches = switches || [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (/^-[A-Za-z]/.test(a)) {
        var key = a.slice(1).replace(/:$/, "").toLowerCase();
        var all = names.concat(switches);
        var exact = all.filter(function (n) { return n.toLowerCase() === key; });
        var match = exact.length ? exact : all.filter(function (n) { return n.toLowerCase().indexOf(key) === 0; });
        if (match.length !== 1) { res._err = match.length ? "El paràmetre «" + a + "» és ambigu." : "No s'ha trobat cap paràmetre que coincideixi amb el nom «" + a.slice(1) + "»."; return res; }
        if (switches.indexOf(match[0]) !== -1) res[match[0]] = true;
        else { res[match[0]] = args[i + 1] !== undefined ? args[i + 1] : ""; i++; }
      } else res._pos.push(a);
    }
    return res;
  }
  function home() { return "C:\\Users\\" + App.user; }
  function dirMap() {
    var u = App.user, m = {};
    m["C:\\"] = ["Program Files", "Users", "Windows"];
    m["C:\\Users"] = [u];
    m["C:\\Users\\" + u] = ["Baixades", "Documents", "Escriptori"];
    m["C:\\Users\\" + u + "\\Documents"] = [];
    m["C:\\Users\\" + u + "\\Escriptori"] = [];
    m["C:\\Users\\" + u + "\\Baixades"] = [];
    m["C:\\Windows"] = ["System32"]; m["C:\\Windows\\System32"] = []; m["C:\\Program Files"] = [];
    return m;
  }
  function docsDir() { return "C:\\Users\\" + App.user + "\\Documents"; }
  function canonDir(path) {
    var m = dirMap(), keys = Object.keys(m);
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === path.toLowerCase()) return keys[i];
    return null;
  }
  function joinPath(cwd, p) {
    p = String(p || "").replace(/\//g, "\\");
    var base;
    if (/^[a-z]:/i.test(p)) { base = []; p = p.slice(2); }
    else if (p[0] === "\\") base = [];
    else base = cwd.slice(3).split("\\").filter(Boolean);
    if (p === "~") return home();
    if (p.indexOf("~\\") === 0) { base = home().slice(3).split("\\"); p = p.slice(2); }
    p.split("\\").filter(Boolean).forEach(function (seg) {
      if (seg === ".") return;
      if (seg === "..") base.pop(); else base.push(seg);
    });
    return "C:\\" + base.join("\\");
  }
  function resolveDir(cwd, p) { return canonDir(joinPath(cwd, p)); }
  function resolveFile(cwd, p) {
    var full = joinPath(cwd, p);
    var idx = full.lastIndexOf("\\");
    var dir = canonDir(full.slice(0, idx) || "C:\\"), name = full.slice(idx + 1);
    if (!dir || dir !== docsDir()) return null;
    return App.docByName(name);
  }

  // ------------------------------------------------------------------ aplicació
  App.apps.console = {
    title: function (arg, id) { return id === "console:ps" ? "Windows PowerShell" : "Símbol del sistema"; },
    icon: "⌨️", w: 760, h: 460, bodyClass: "nobpad", keepOnRefresh: true,
    render: function (body, arg, id) {
      var st = CON[id] = CON[id] || { mode: id === "console:ps" ? "ps" : "cmd", base: id === "console:ps" ? "ps" : "cmd", cwd: home(), hist: [], hi: 0 };
      var out = h("div", { class: "con-out", role: "log", "aria-live": "polite" });
      var promptEl = h("span", { class: "con-prompt" });
      var input = h("input", { class: "con-in", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "aria-label": "Ordre" });
      var wrap = h("div", { class: "con " + st.mode, onclick: function () { input.focus(); } }, [out, h("div", { class: "con-line" }, [promptEl, input])]);
      body.appendChild(wrap);
      st.out = out; st.wrap = wrap; st.promptEl = promptEl; st.input = input; st.id = id;
      banner(st); setPrompt(st);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var line = input.value; input.value = "";
          print(st, promptText(st) + line, "echo");
          if (line.trim()) { st.hist.push(line); st.hi = st.hist.length; }
          run(st, line);
          setPrompt(st);
        } else if (e.key === "ArrowUp") { if (st.hi > 0) { st.hi--; input.value = st.hist[st.hi]; } e.preventDefault(); }
        else if (e.key === "ArrowDown") { if (st.hi < st.hist.length) { st.hi++; input.value = st.hist[st.hi] || ""; } e.preventDefault(); }
        else if (e.key === "l" && e.ctrlKey) { out.innerHTML = ""; e.preventDefault(); }
      });
      setTimeout(function () { input.focus(); }, 50);
    },
    onclose: function (id) { delete CON[id]; }
  };

  function banner(st) {
    if (st.mode === "ps") { print(st, "Windows PowerShell\nCopyright (C) Microsoft Corporation. Tots els drets reservats.\n\nEscriviu «help» per veure les ordres disponibles en aquest simulador.\n"); }
    else print(st, "Microsoft Windows [Versió 10.0.26100.2033]\n(c) Microsoft Corporation. Tots els drets reservats.\n\nEscriviu «help» per veure les ordres disponibles en aquest simulador.\n");
  }
  function promptText(st) { return (st.mode === "ps" ? "PS " + st.cwd + "> " : st.cwd + ">"); }
  function setPrompt(st) { st.promptEl.textContent = promptText(st); st.wrap.className = "con " + st.mode; App.setWinTitle(st.id, st.mode === "ps" ? "Windows PowerShell" : "Símbol del sistema"); }
  function print(st, text, cls) {
    st.out.appendChild(h("div", { class: "con-l" + (cls ? " " + cls : ""), text: text === "" ? " " : text }));
    st.wrap.scrollTop = st.wrap.scrollHeight;
  }
  function psErr(st, cmd, msg, line) { print(st, cmd + " : " + msg + "\n    + " + (line || cmd) + "\n    + CategoryInfo          : NotSpecified: (:) [" + cmd + "], Exception", "err"); }
  function notFound(st, cmd) {
    if (st.mode === "ps") print(st, cmd + " : El terme «" + cmd + "» no es reconeix com a nom d'un cmdlet, funció, fitxer de script o programa executable. Comproveu que el nom és correcte i torneu-ho a provar.", "err");
    else print(st, "«" + cmd + "» no es reconeix com a ordre interna o externa,\nprograma executable o fitxer per lots.");
  }

  // ------------------------------------------------------------------ xarxa
  function ipconfig(st, all) {
    var e = N.effective(App.device, App.state.net), lines = ["", "Configuració IP del Windows", ""];
    if (all) {
      lines.push("   Nom de l'amfitrió . . . . . . . . . . : " + App.device.id);
      lines.push("   Sufix DNS principal . . . . . . . . . : " + (App.state.net.mode === "static" ? "" : ""));
      lines.push("   Tipus de node . . . . . . . . . . . . : Híbrid", "");
    }
    lines.push("Adaptador d'Ethernet Ethernet:", "");
    lines.push("   Sufix DNS específic de la connexió. . :");
    if (all) {
      lines.push("   Descripció. . . . . . . . . . . . . . : Intel(R) Ethernet Connection I219-LM");
      lines.push("   Adreça física . . . . . . . . . . . . : " + App.device.mac.replace(/:/g, "-"));
      lines.push("   DHCP habilitat. . . . . . . . . . . . : " + (e.mode === "dhcp" ? "Sí" : "No"));
      lines.push("   Configuració automàtica habilitada . : Sí");
    }
    var dup = N.diagnose(App.device, App.state.net).code === "conflict";
    if (e.apipa) lines.push("   Adreça IPv4 de configuració automàtica: " + e.ip + "(Preferida)");
    else lines.push("   Adreça IPv4. . . . . . . . . . . . . . : " + (e.ip || "") + (all ? (dup ? "(Duplicada)" : "(Preferida)") : ""));
    lines.push("   Màscara de subxarxa . . . . . . . . . : " + (e.mask || ""));
    lines.push("   Passarel·la predeterminada . . . . . : " + (e.gw || ""));
    if (all) lines.push("   Servidors DNS . . . . . . . . . . . . : " + (e.dns.length ? e.dns.join("\n                                           ") : ""));
    print(st, lines.join("\n"));
  }
  function displayName(ip) { var t = N.hostAt(ip); return t ? t.name : null; }
  function ping(st, args) {
    var count = 4, target = null;
    for (var i = 0; i < args.length; i++) {
      if (/^[-\/]n$/i.test(args[i])) { count = Math.max(1, Math.min(10, parseInt(args[i + 1], 10) || 4)); i++; }
      else if (/^[-\/]t$/i.test(args[i])) count = 4;
      else if (args[i][0] !== "-" && args[i][0] !== "/") target = args[i];
    }
    if (!target) { print(st, "\nÚs: ping [-n recompte] nom_destinació\n"); return; }
    var r = N.resolve(App.device, App.state.net, target);
    if (!r.ok) { print(st, "La sol·licitud de ping no ha pogut trobar l'amfitrió " + target + ". Comproveu el nom i torneu-ho a provar."); return; }
    var ip = r.ip, nm = N.ipToInt(target) === null ? (displayName(ip) || target) : null;
    var c = N.connect(App.device, App.state.net, ip, "icmp", 0);
    var lines = ["", "S'està fent ping a " + (nm ? nm + " [" + ip + "]" : ip) + " amb 32 bytes de dades:"];
    var recv = 0, times = [];
    for (var k = 0; k < count; k++) {
      if (c.ok) { var t = c.ttl >= 128 || c.ttl === 255 ? 0 : 1 + Math.floor(Math.random() * 3); times.push(t); recv++; lines.push("Resposta des de " + ip + ": bytes=32 temps" + (t === 0 ? "<1ms" : "=" + t + "ms") + " TTL=" + c.ttl); }
      else if (c.stage === "route" && (c.reason === "no_net" || c.reason === "no_gw" || c.reason === "conflict")) lines.push("La transmissió de PING ha fallat. Error general.");
      else if (c.stage === "route" && c.from) { recv++; lines.push("Resposta des de " + c.from + ": Host de destinació inaccessible."); }
      else lines.push("S'ha esgotat el temps d'espera de la sol·licitud.");
    }
    if (c.deny) App.logDeny(c.deny);
    var sent = count, lost = sent - recv;
    if (c.stage === "route" && (c.reason === "no_net" || c.reason === "no_gw" || c.reason === "conflict")) lost = sent, recv = 0;
    lines.push("", "Estadístiques de ping per a " + ip + ":", "    Paquets: enviats = " + sent + ", rebuts = " + recv + ", perduts = " + lost, "    (" + Math.round(lost / sent * 100) + "% perduts),");
    if (times.length) { var mn = Math.min.apply(null, times), mx = Math.max.apply(null, times), av = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length); lines.push("Temps aproximats d'anada i tornada en mil·lisegons:", "    Mínim = " + mn + "ms, Màxim = " + mx + "ms, Mitjana = " + av + "ms"); }
    print(st, lines.join("\n"));
  }
  function tracert(st, args) {
    var target = args.filter(function (a) { return a[0] !== "-" && a[0] !== "/"; })[0];
    if (!target) { print(st, "\nÚs: tracert nom_destinació\n"); return; }
    var r = N.resolve(App.device, App.state.net, target);
    if (!r.ok) { print(st, "No es pot resoldre el nom del sistema de destinació " + target + "."); return; }
    var ip = r.ip, nm = displayName(ip);
    var lines = ["", "S'està fent el seguiment de la ruta a " + (nm ? nm + " [" + ip + "]" : ip), "sobre un màxim de 30 salts:", ""];
    var rt = N.route(App.device, App.state.net, ip);
    var c = N.connect(App.device, App.state.net, ip, "icmp", 0);
    if (!rt.ok) {
      if (rt.from) lines.push("  1  " + rt.from + "  informa: Host de destinació inaccessible.");
      else lines.push("La transmissió ha fallat. Error general.");
    } else if (rt.kind === "local" || rt.kind === "loopback") lines.push("  1    <1 ms    <1 ms    <1 ms  " + ip);
    else {
      lines.push("  1    <1 ms    <1 ms    <1 ms  " + App.dept.gw);
      if (c.ok) lines.push("  2     1 ms     1 ms     2 ms  " + (nm ? nm + " [" + ip + "]" : ip));
      else { for (var k = 2; k <= 5; k++) lines.push(pad("  " + k, 5) + "  *        *        *     S'ha esgotat el temps d'espera de la sol·licitud."); if (c.deny) App.logDeny(c.deny); }
    }
    lines.push("", "S'ha completat el seguiment.");
    print(st, lines.join("\n"));
  }
  function nslookup(st, args) {
    var name = args[0];
    var e = N.effective(App.device, App.state.net);
    if (!e.dns.length) { print(st, "*** No es pot trobar el nom del servidor: no hi ha cap servidor DNS configurat.\nServidor:  UnKnown\nAddress:  ::1\n"); if (!name) return; print(st, "*** UnKnown no troba " + name + ": No response from server"); return; }
    var srv = e.dns[0], srvName = displayName(srv) || "UnKnown";
    var reach = N.connect(App.device, App.state.net, srv, "udp", 53);
    if (!reach.ok || srv !== D.dns.ip) { if (reach.deny) App.logDeny(reach.deny); print(st, "DNS request timed out.\n    timeout was 2 seconds.\nServidor:  UnKnown\nAddress:  " + srv + "\n" + (name ? "\n*** S'ha esgotat el temps d'espera de la sol·licitud a UnKnown." : "")); return; }
    var lines = ["Servidor:  " + srvName, "Address:  " + srv, ""];
    if (name) {
      var r = N.resolve(App.device, App.state.net, name);
      if (r.ok) { lines.push("Nom:     " + (displayName(r.ip) || name)); lines.push("Address:  " + r.ip); }
      else lines.push("*** " + srvName + " no troba " + name + ": Non-existent domain");
    }
    print(st, lines.join("\n"));
  }
  function tnc(st, args) {
    var p = psParams(args, ["ComputerName", "Port", "CommonTCPPort", "InformationLevel"], ["TraceRoute"]);
    if (p._err) return psErr(st, "Test-NetConnection", p._err);
    var host = p.ComputerName || p._pos[0] || "internetbeacon.msedge.net";
    var port = p.Port ? parseInt(p.Port, 10) : null;
    if (p.CommonTCPPort) port = { http: 80, rdp: 3389, smb: 445, winrm: 5985 }[String(p.CommonTCPPort).toLowerCase()] || null;
    var r = N.resolve(App.device, App.state.net, host);
    var e = N.effective(App.device, App.state.net);
    if (!r.ok) { print(st, "ADVERTIMENT: Name resolution of " + host + " failed\n\nComputerName   : " + host + "\nRemoteAddress  :\nInterfaceAlias :\nSourceAddress  :\nPingSucceeded  : False", "warn"); return; }
    var icmp = N.connect(App.device, App.state.net, r.ip, "icmp", 0);
    var lines = [];
    if (port === null) {
      if (!icmp.ok) { lines.push("ADVERTIMENT: Ping to " + r.ip + " failed with status: " + (icmp.stage === "acl" || icmp.reason === "no_route" ? "TimedOut" : "DestinationHostUnreachable")); if (icmp.deny) App.logDeny(icmp.deny); }
      if (String(p.InformationLevel).toLowerCase() === "quiet") { print(st, icmp.ok ? "True" : "False"); return; }
      lines.push("", "ComputerName           : " + host, "RemoteAddress          : " + r.ip, "InterfaceAlias         : Ethernet", "SourceAddress          : " + e.ip, "PingSucceeded          : " + (icmp.ok ? "True" : "False"));
      if (icmp.ok) lines.push("PingReplyDetails (RTT) : " + (icmp.ttl >= 128 ? 0 : 2) + " ms");
      print(st, lines.join("\n"), icmp.ok ? null : "warnblock");
      return;
    }
    var c = N.connect(App.device, App.state.net, r.ip, "tcp", port);
    if (c.deny) App.logDeny(c.deny);
    if (String(p.InformationLevel).toLowerCase() === "quiet") { print(st, c.ok ? "True" : "False"); return; }
    if (!c.ok) {
      print(st, "ADVERTIMENT: TCP connect to (" + r.ip + " : " + port + ") failed", "warn");
      if (!icmp.ok) print(st, "ADVERTIMENT: Ping to " + r.ip + " failed with status: " + (icmp.stage === "acl" ? "TimedOut" : "DestinationHostUnreachable"), "warn");
    }
    lines.push("", "ComputerName           : " + host, "RemoteAddress          : " + r.ip, "RemotePort             : " + port, "InterfaceAlias         : Ethernet", "SourceAddress          : " + e.ip);
    if (!c.ok) { lines.push("PingSucceeded          : " + (icmp.ok ? "True" : "False")); if (icmp.ok) lines.push("PingReplyDetails (RTT) : 2 ms"); }
    lines.push("TcpTestSucceeded       : " + (c.ok ? "True" : "False"), "");
    print(st, lines.join("\n"));
  }

  // ------------------------------------------------------------------ fitxers
  function dir(st, args) {
    var target = args.filter(function (a) { return a[0] !== "/" && a[0] !== "-"; })[0];
    var d = target ? resolveDir(st.cwd, target) : st.cwd;
    if (!d) { print(st, st.mode === "ps" ? "Get-ChildItem : No es troba el camí '" + joinPath(st.cwd, target) + "' perquè no existeix." : "No s'ha trobat el fitxer", st.mode === "ps" ? "err" : null); return; }
    var subs = dirMap()[d] || [], files = d === docsDir() ? (D.docs[App.dept.id] || []) : [];
    if (st.mode === "ps") {
      var L = ["", "    Directori: " + d, "", "Mode                 LastWriteTime         Length Name", "----                 -------------         ------ ----"];
      subs.forEach(function (s) { L.push("d-----        26/10/2026     08:15                " + s); });
      files.forEach(function (f) { L.push("-a----        20/10/2026     11:42         " + pad(String(f.text.length), 6) + f.file); });
      print(st, L.join("\n") + "\n");
    } else {
      var L2 = [" El volum de la unitat C no té etiqueta.", " El número de sèrie del volum és 7A1C-3F90", "", " Directori de " + d, ""];
      if (d !== "C:\\") { L2.push("26/10/2026  08:15    <DIR>          ."); L2.push("26/10/2026  08:15    <DIR>          .."); }
      subs.forEach(function (s) { L2.push("26/10/2026  08:15    <DIR>          " + s); });
      files.forEach(function (f) { L2.push("20/10/2026  11:42    " + pad(String(f.text.length), 15) + f.file); });
      L2.push(pad("               " + files.length + " fitxers", 32) + files.reduce(function (a, f) { return a + f.text.length; }, 0) + " bytes");
      print(st, L2.join("\n"));
    }
  }
  function cd(st, args) {
    var a = args.filter(function (x) { return x.toLowerCase() !== "/d"; }).join(" ");
    if (!a) { if (st.mode === "cmd") print(st, st.cwd); else st.cwd = home(); return; }
    var d = resolveDir(st.cwd, a);
    if (!d) { if (st.mode === "ps") psErr(st, "Set-Location", "No es troba el camí '" + joinPath(st.cwd, a) + "' perquè no existeix."); else print(st, "El sistema no troba el camí especificat."); return; }
    st.cwd = d;
  }
  function typeFile(st, args, cmdName) {
    if (!args.length) { print(st, "La sintaxi de l'ordre no és correcta."); return; }
    var f = resolveFile(st.cwd, args.join(" "));
    if (!f) { if (st.mode === "ps") psErr(st, cmdName || "Get-Content", "No es troba el camí '" + joinPath(st.cwd, args.join(" ")) + "' perquè no existeix."); else print(st, "El sistema no troba el fitxer especificat."); return; }
    print(st, f.text);
  }

  // ------------------------------------------------------------------ impressió
  function prefsOf(p) { return (p && p.prefs) || { duplex: "none", paper: "A4" }; }
  function printFile(st, printer, file, method) {
    var f = resolveFile(st.cwd, file);
    if (!f) return null;
    var pr = prefsOf(printer);
    return App.printJob(printer, { doc: f.file, pages: f.pages, copies: 1, duplex: pr.duplex, paper: pr.paper, method: method || "consola" });
  }
  function notepad(st, args) {
    if (!args.length) { App.openApp("documents"); return; }
    var flag = args[0].toLowerCase();
    if (flag === "/p" || flag === "/pt") {
      var file = args[1];
      if (!file) return;
      if (!resolveFile(st.cwd, file)) { App.toast("Bloc de notes", "No es pot trobar el fitxer " + file + ".", "error"); return; }
      var printer = flag === "/p" ? App.defaultPrinter() : App.findPrinter(args[2] || "");
      if (!printer) { App.toast("Bloc de notes", flag === "/p" ? "No hi ha cap impressora predeterminada. Instal·la'n una o estableix-ne una com a predeterminada." : "No s'ha trobat la impressora «" + (args[2] || "") + "».", "error"); return; }
      printFile(st, printer, file, "consola");
      return;
    }
    var fl = resolveFile(st.cwd, args.join(" "));
    if (fl) App.openApp("note:" + fl.file); else App.toast("Bloc de notes", "No es pot trobar el fitxer " + args.join(" ") + ".", "error");
  }
  function lprCmd(st, args) {
    if (!App.state.features.lpr) return notFound(st, "lpr");
    var host = null, queue = null, file = null;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === "-S") { host = args[++i]; } else if (a === "-P") { queue = args[++i]; }
      else if (a === "-o" || a === "-C" || a === "-J" || a === "-U") { i++; } else if (a === "-l" || a === "-d" || a === "-x") { /* opcions sense valor */ }
      else if (a[0] !== "-") file = a;
    }
    if (!host || !queue || !file) { print(st, "\nEnvia un treball d'impressió a un amfitrió de xarxa\n\nÚs: lpr -S servidor -P impressora [-C classe] [-J treball] [-o opció] [-x] [-d] fitxer\n\nOpcions:\n     -S servidor    Nom o adreça IP de l'amfitrió que proporciona el servei lpd\n     -P impressora  Nom de la cua d'impressió\n     -o l           Envia el fitxer sense format (binari)\n"); return; }
    var f = resolveFile(st.cwd, file);
    if (!f) { print(st, "Error: no es pot obrir el fitxer " + file); return; }
    App.printJob(null, { doc: f.file, pages: f.pages, copies: 1, duplex: "none", paper: "A4", method: "consola", direct: { host: host, queue: queue } }).then(function (r) {
      if (!r.ok) print(st, "Error: l'impressora remota " + host + " no respon o ha rebutjat el treball (" + r.msg + ").");
    });
  }
  function lpqCmd(st, args) {
    if (!App.state.features.lpr) return notFound(st, "lpq");
    var host = null, queue = null;
    for (var i = 0; i < args.length; i++) { if (args[i] === "-S") host = args[++i]; else if (args[i] === "-P") queue = args[++i]; }
    if (!host || !queue) { print(st, "\nMostra l'estat d'una cua d'impressió remota\n\nÚs: lpq -S servidor -P impressora [-l]\n"); return; }
    var ck = App.checkPort({ proto: "LPR", host: host, queue: queue });
    if (!ck.ok) { App.logDeny(ck.deny); print(st, "Error: no es pot obtenir l'estat de la cua (" + ck.msg + ")."); return; }
    var q = App.shared.jobs.filter(function (j) { return j.status === "queued" || j.status === "printing"; }).reverse();
    var L = ["", "Windows LPD Server", "Impressora " + queue + " a " + host, "", "Propietari       Estat        Nom del treball               Treball"];
    L.push("--------------------------------------------------------------------");
    if (!q.length) L.push("(la cua és buida)");
    q.forEach(function (j) { L.push(pad(j.student_name.split(" ")[0].toLowerCase(), 17) + pad(j.status === "printing" ? "Imprimint" : "En espera", 13) + pad(j.doc_name, 30) + j.id); });
    print(st, L.join("\n") + "\n");
  }
  function printCmd(st, args) {
    var dev = null, files = [];
    args.forEach(function (a) { var m = /^\/d:(.*)$/i.exec(a); if (m) dev = m[1]; else files.push(a); });
    if (!files.length) { print(st, "No es pot inicialitzar el dispositiu PRN"); return; }
    print(st, "No es pot inicialitzar el dispositiu " + (dev || "PRN"));
  }
  function rundll(st, line) {
    if (/printui\.dll\s*,\s*printuientry/i.test(line)) {
      var m = /\/n\s*"([^"]+)"|\/n\s*(\S+)/i.exec(line);
      if (/\/y\b/i.test(line) && m) {
        var p = App.findPrinter(m[1] || m[2]);
        if (!p || p.id === "pdf") { App.toast("Impressores", "No s'ha trobat la impressora «" + (m[1] || m[2]) + "».", "error"); return; }
        App.state.printers.forEach(function (x) { x.isDefault = x.id === p.id; }); App.touch(); App.refreshWhere("printers");
        return;
      }
      App.openApp("printers"); return;
    }
    App.toast("RUNDLL", "S'ha produït un problema en iniciar la DLL.", "error");
  }
  function startCmd(st, args, line) {
    var p = psParams(args, ["FilePath", "Verb", "ArgumentList"], ["Wait"]);
    var target = p.FilePath || p._pos.filter(function (a) { return a[0] !== "/"; })[0];
    if (!target) { App.openApp(st.id === "console:ps" ? "console" : "console:ps"); return; }
    if (/^(https?:\/\/|\d+\.\d+\.\d+\.\d+)/i.test(target) || /\.badiatech\.local/i.test(target)) { App.openApp("browser", target); return; }
    var f = resolveFile(st.cwd, target);
    if (!f) { if (st.mode === "ps") psErr(st, "Start-Process", "Aquesta ordre no es pot executar a causa de l'error: el sistema no troba el fitxer especificat.", line); else print(st, "El sistema no troba el fitxer " + target + "."); return; }
    if (String(p.Verb || "").toLowerCase() === "print") {
      var dp = App.defaultPrinter();
      if (!dp) { App.toast("Impressió", "No hi ha cap impressora predeterminada.", "error"); return; }
      printFile(st, dp, target, "consola"); return;
    }
    App.openApp("note:" + f.file);
  }

  // ------------------------------------------------------------------ cmdlets d'impressió (PowerShell)
  function printerTable(st) {
    var L = ["", pad("Name", 31) + pad("ComputerName", 14) + pad("Type", 7) + pad("DriverName", 27) + pad("PortName", 24) + pad("Shared", 8) + "Published", pad("----", 31) + pad("------------", 14) + pad("----", 7) + pad("----------", 27) + pad("--------", 24) + pad("------", 8) + "---------"];
    App.state.printers.concat([App.pdfPrinter]).forEach(function (p) {
      L.push(pad(p.name, 31) + pad("", 14) + pad("Local", 7) + pad(p.driver, 27) + pad(p.id === "pdf" ? "PORTPROMPT:" : (p.port.proto === "IPP" ? p.port.url : p.port.name), 24) + pad(p.shared ? "True" : "False", 8) + "False");
    });
    print(st, L.join("\n") + "\n");
  }
  function needPrinter(st, cmd, name) {
    var p = App.findPrinter(name || "");
    if (!p || p.id === "pdf") { psErr(st, cmd, "No s'ha trobat cap impressora amb el nom «" + (name || "") + "»."); return null; }
    return p;
  }
  var CMDLETS = {
    "get-printer": printerTable,
    "get-printerport": function (st) {
      var L = ["", pad("Name", 26) + pad("ComputerName", 14) + pad("Description", 26) + "PortMonitor", pad("----", 26) + pad("------------", 14) + pad("-----------", 26) + "-----------"];
      [["LPT1:", "Port local", "Local Monitor"], ["COM1:", "Port local", "Local Monitor"], ["FILE:", "Port local", "Local Monitor"], ["PORTPROMPT:", "Port local", "Local Monitor"]].forEach(function (r) { L.push(pad(r[0], 26) + pad("", 14) + pad(r[1], 26) + r[2]); });
      App.state.ports.forEach(function (pt) { L.push(pad(pt.name, 26) + pad("", 14) + pad("Port TCP/IP estàndard", 26) + "TCPMON.DLL"); });
      print(st, L.join("\n") + "\n");
    },
    "get-printerdriver": function (st) {
      var used = ["Microsoft Print To PDF"]; App.state.printers.forEach(function (p) { if (used.indexOf(p.driver) === -1) used.push(p.driver); });
      print(st, "\n" + pad("Name", 34) + pad("PrinterEnvironment", 20) + "MajorVersion\n" + pad("----", 34) + pad("------------------", 20) + "------------\n" + used.map(function (n) { return pad(n, 34) + pad("Windows x64", 20) + "3"; }).join("\n") + "\n");
    },
    "add-printerport": function (st, args, line) {
      var p = psParams(args, ["Name", "PrinterHostAddress", "PortNumber", "LprHostAddress", "LprQueueName", "SNMP", "SNMPCommunity"], ["LprByteCounting"]);
      if (p._err) return psErr(st, "Add-PrinterPort", p._err, line);
      if (!p.Name) return psErr(st, "Add-PrinterPort", "Cal especificar el paràmetre -Name.", line);
      if (App.state.ports.some(function (x) { return norm(x.name) === norm(p.Name); })) return psErr(st, "Add-PrinterPort", "El port especificat ja existeix.", line);
      var port;
      if (p.LprHostAddress) {
        if (!p.LprQueueName) return psErr(st, "Add-PrinterPort", "Cal especificar -LprQueueName per a un port LPR.", line);
        port = { name: p.Name, proto: "LPR", host: p.LprHostAddress, number: 515, queue: p.LprQueueName };
      } else if (p.PrinterHostAddress) port = { name: p.Name, proto: "RAW", host: p.PrinterHostAddress, number: parseInt(p.PortNumber, 10) || 9100, queue: "" };
      else return psErr(st, "Add-PrinterPort", "Cal especificar -PrinterHostAddress (RAW) o -LprHostAddress (LPR).", line);
      App.state.ports.push(port); App.touch();
    },
    "add-printer": function (st, args, line) {
      var p = psParams(args, ["Name", "DriverName", "PortName", "ConnectionName", "Location", "Comment"], ["Shared"]);
      if (p._err) return psErr(st, "Add-Printer", p._err, line);
      if (p.ConnectionName) return psErr(st, "Add-Printer", "No s'ha trobat cap servidor d'impressió que comparteixi «" + p.ConnectionName + "». Fes servir -PortName amb un port TCP/IP.", line);
      if (!p.Name || !p.DriverName || !p.PortName) return psErr(st, "Add-Printer", "Cal especificar -Name, -DriverName i -PortName.", line);
      if (App.findPrinter(p.Name)) return psErr(st, "Add-Printer", "Ja existeix una impressora amb aquest nom.", line);
      var drv = D.drivers.filter(function (d) { return norm(d.name) === norm(p.DriverName); })[0];
      if (!drv) return psErr(st, "Add-Printer", "No s'ha trobat el controlador especificat «" + p.DriverName + "».", line);
      var port = App.state.ports.filter(function (x) { return norm(x.name) === norm(p.PortName); })[0];
      if (!port) return psErr(st, "Add-Printer", "El port especificat «" + p.PortName + "» no existeix. Crea'l abans amb Add-PrinterPort.", line);
      App.state.printers.push({ id: "p" + Date.now(), name: p.Name, driver: drv.name, port: JSON.parse(JSON.stringify(port)), isDefault: App.state.printers.length === 0, duplexUnit: false, tray2: false, prefs: { duplex: "none", paper: "A4", orient: "portrait" }, shared: !!p.Shared });
      App.touch(); App.refreshWhere("printers");
    },
    "remove-printer": function (st, args, line) {
      var p = psParams(args, ["Name"]); var pr = needPrinter(st, "Remove-Printer", p.Name || p._pos[0]); if (!pr) return;
      App.state.printers = App.state.printers.filter(function (x) { return x !== pr; });
      if (pr.isDefault && App.state.printers[0]) App.state.printers[0].isDefault = true;
      App.touch(); App.refreshWhere("printers");
    },
    "set-printconfiguration": function (st, args, line) {
      var p = psParams(args, ["PrinterName", "DuplexingMode", "PaperSize", "Color", "Collate"]);
      if (p._err) return psErr(st, "Set-PrintConfiguration", p._err, line);
      var pr = needPrinter(st, "Set-PrintConfiguration", p.PrinterName || p._pos[0]); if (!pr) return;
      var di = App.driverInfo(pr.driver) || {};
      if (p.DuplexingMode) {
        var m = { onesided: "none", twosidedlongedge: "long", twosidedshortedge: "short" }[String(p.DuplexingMode).toLowerCase()];
        if (!m) return psErr(st, "Set-PrintConfiguration", "El valor «" + p.DuplexingMode + "» no és vàlid. Valors possibles: OneSided, TwoSidedLongEdge, TwoSidedShortEdge.", line);
        if (m !== "none" && (di.generic || !pr.duplexUnit)) return psErr(st, "Set-PrintConfiguration", "L'operació sol·licitada no és compatible.", line);
        pr.prefs.duplex = m;
      }
      if (p.PaperSize) {
        var ps = { a4: "A4", a5: "A5", a3: "A3", letter: "Carta", legal: "Legal" }[String(p.PaperSize).toLowerCase()];
        if (!ps) return psErr(st, "Set-PrintConfiguration", "El valor «" + p.PaperSize + "» no és vàlid per a -PaperSize.", line);
        if (di.generic && ps !== "A4") return psErr(st, "Set-PrintConfiguration", "L'operació sol·licitada no és compatible.", line);
        pr.prefs.paper = ps;
      }
      App.touch();
    },
    "get-printconfiguration": function (st, args) {
      var p = psParams(args, ["PrinterName"]); var pr = needPrinter(st, "Get-PrintConfiguration", p.PrinterName || p._pos[0]); if (!pr) return;
      var dm = { none: "OneSided", long: "TwoSidedLongEdge", short: "TwoSidedShortEdge" }[pr.prefs.duplex];
      print(st, "\n" + pad("PrinterName", 30) + pad("ComputerName", 14) + pad("Collate", 9) + pad("Color", 7) + pad("DuplexingMode", 19) + "PaperSize\n" + pad("-----------", 30) + pad("------------", 14) + pad("-------", 9) + pad("-----", 7) + pad("-------------", 19) + "---------\n" + pad(pr.name, 30) + pad("", 14) + pad("True", 9) + pad("False", 7) + pad(dm, 19) + pr.prefs.paper + "\n");
    },
    "get-printerproperty": function (st, args) {
      var p = psParams(args, ["PrinterName", "PropertyName"]); var pr = needPrinter(st, "Get-PrinterProperty", p.PrinterName || p._pos[0]); if (!pr) return;
      var di = App.driverInfo(pr.driver) || {};
      if (di.generic) { print(st, "\n(Aquest controlador no té propietats configurables.)\n"); return; }
      print(st, "\n" + pad("ComputerName", 14) + pad("PrinterName", 30) + pad("PropertyName", 22) + "Value\n" + pad("------------", 14) + pad("-----------", 30) + pad("------------", 22) + "-----\n" +
        pad("", 14) + pad(pr.name, 30) + pad("Config:DuplexUnit", 22) + (pr.duplexUnit ? "TRUE" : "FALSE") + "\n" + pad("", 14) + pad(pr.name, 30) + pad("Config:Tray2", 22) + (pr.tray2 ? "TRUE" : "FALSE") + "\n");
    },
    "set-printerproperty": function (st, args, line) {
      var p = psParams(args, ["PrinterName", "PropertyName", "Value"]);
      if (p._err) return psErr(st, "Set-PrinterProperty", p._err, line);
      var pr = needPrinter(st, "Set-PrinterProperty", p.PrinterName); if (!pr) return;
      var di = App.driverInfo(pr.driver) || {};
      var prop = String(p.PropertyName || "").toLowerCase();
      if (di.generic || (prop !== "config:duplexunit" && prop !== "config:tray2")) return psErr(st, "Set-PrinterProperty", "La propietat especificada no existeix per a aquesta impressora.", line);
      var v = /^(true|installed|instal·lada|1)$/i.test(String(p.Value));
      if (prop === "config:duplexunit") { pr.duplexUnit = v; if (!v) pr.prefs.duplex = "none"; } else pr.tray2 = v;
      App.touch();
    },
    "get-printjob": function (st, args) {
      var p = psParams(args, ["PrinterName"]); var pr = needPrinter(st, "Get-PrintJob", p.PrinterName || p._pos[0]); if (!pr) return;
      var jobs = App.state.localJobs.filter(function (j) { return j.printerId === pr.id; });
      var L = ["", pad("Id", 5) + pad("ComputerName", 14) + pad("PrinterName", 26) + pad("DocumentName", 28) + pad("SubmittedTime", 20) + "JobStatus", pad("--", 5) + pad("------------", 14) + pad("-----------", 26) + pad("------------", 28) + pad("-------------", 20) + "---------"];
      jobs.forEach(function (j, i) {
        var sj = j.sharedId ? App.shared.jobs.filter(function (x) { return x.id === j.sharedId; })[0] : null;
        var s = j.status === "error" ? "Error, Printing" : !sj ? "Spooling" : { queued: "Printing", printing: "Printing", done: "Printed", cancelled: "Deleted" }[sj.status];
        L.push(pad(i + 1, 5) + pad("", 14) + pad(pr.name, 26) + pad(j.doc, 28) + pad(new Date(j.at).toLocaleString("ca-ES").slice(0, 18), 20) + s);
      });
      print(st, L.join("\n") + "\n");
    },
    "resolve-dnsname": function (st, args) {
      var name = args.filter(function (a) { return a[0] !== "-"; })[0];
      if (!name) return psErr(st, "Resolve-DnsName", "Cal especificar un nom.");
      var r = N.resolve(App.device, App.state.net, name);
      if (!r.ok) return psErr(st, "Resolve-DnsName", name + " : " + (r.reason === "nxdomain" ? "DNS name does not exist" : "This operation returned because the timeout period expired"));
      print(st, "\n" + pad("Name", 32) + pad("Type", 6) + pad("TTL", 6) + pad("Section", 9) + "IPAddress\n" + pad("----", 32) + pad("----", 6) + pad("---", 6) + pad("-------", 9) + "---------\n" + pad(displayName(r.ip) || name, 32) + pad("A", 6) + pad("3600", 6) + pad("Answer", 9) + r.ip + "\n");
    },
    "get-netipconfiguration": function (st) {
      var e = N.effective(App.device, App.state.net);
      print(st, "\nInterfaceAlias       : Ethernet\nInterfaceIndex       : 12\nInterfaceDescription : Intel(R) Ethernet Connection I219-LM\nNetProfile.Name      : " + (N.connect(App.device, App.state.net, App.dept.gw, "icmp", 0).ok ? "badiatech.local" : "Xarxa no identificada") + "\nIPv4Address          : " + e.ip + "\nIPv4DefaultGateway   : " + (e.gw || "") + "\nDNSServer            : " + e.dns.join(", ") + "\n");
    }
  };
  CMDLETS["tnc"] = function (st, a) { tnc(st, a); };
  CMDLETS["test-netconnection"] = CMDLETS["tnc"];

  // ------------------------------------------------------------------ intèrpret
  function help(st) {
    var common = ["ipconfig [/all]", "ping [-n N] destinació", "tracert destinació", "nslookup nom", "hostname · whoami", "dir · cd · type fitxer · cls",
      "notepad fitxer · notepad /p fitxer · notepad /pt fitxer \"impressora\"", "print [/d:dispositiu] fitxer", "lpr -S servidor -P cua fitxer · lpq -S servidor -P cua",
      "rundll32 printui.dll,PrintUIEntry /y /n \"impressora\"", "start adreça-web · control printers · ncpa.cpl · optionalfeatures", st.mode === "ps" ? "cmd (canvia al Símbol del sistema) · exit" : "powershell (canvia a PowerShell) · exit"];
    var ps = ["Test-NetConnection destinació [-Port N]  (àlies: tnc)", "Resolve-DnsName nom · Get-NetIPConfiguration", "Get-Printer · Get-PrinterPort · Get-PrinterDriver",
      "Add-PrinterPort -Name n -PrinterHostAddress ip [-PortNumber 9100]", "Add-PrinterPort -Name n -LprHostAddress ip -LprQueueName cua",
      "Add-Printer -Name n -DriverName \"controlador\" -PortName port · Remove-Printer -Name n", "Get-PrinterProperty / Set-PrinterProperty -PrinterName n -PropertyName Config:DuplexUnit -Value TRUE",
      "Get-PrintConfiguration / Set-PrintConfiguration -PrinterName n -DuplexingMode TwoSidedLongEdge", "Get-Content fitxer | Out-Printer [-Name \"impressora\"]", "Start-Process fitxer -Verb Print · Get-PrintJob -PrinterName n"];
    print(st, "\nOrdres disponibles en aquest simulador:\n  " + common.join("\n  ") + (st.mode === "ps" ? "\n\nCmdlets de PowerShell:\n  " + ps.join("\n  ") : "\n\n(Escriu «powershell» per fer servir els cmdlets de PowerShell.)") + "\n");
  }

  function run(st, line) {
    line = line.trim();
    if (!line) return;
    if (st.mode === "ps" && line.indexOf("|") !== -1) return runPipe(st, line);
    var t = tokenize(line);
    if (!t.length) return;
    var cmd = t[0], lc = cmd.toLowerCase().replace(/\.exe$/, ""), args = t.slice(1);
    // ordres comunes
    switch (lc) {
      case "help": case "ajuda": case "get-help": case "/?": return help(st);
      case "cls": case "clear": case "clear-host": st.out.innerHTML = ""; return;
      case "echo": case "write-output": case "write-host": print(st, args.join(" ")); return;
      case "hostname": print(st, App.device.id); return;
      case "whoami": print(st, "badiatech\\" + App.user); return;
      case "ver": print(st, "\nMicrosoft Windows [Versió 10.0.26100.2033]\n"); return;
      case "ipconfig": if (args[0] && /^[-\/]all$/i.test(args[0])) ipconfig(st, true); else if (args[0] && /^[-\/](release|renew)$/i.test(args[0])) { print(st, App.state.net.mode === "static" ? "\nNo es pot fer aquesta operació a l'adaptador Ethernet: el DHCP no està habilitat.\n" : "\nS'ha produït un error en renovar la interfície Ethernet: no s'ha pogut contactar amb el servidor DHCP.\n"); } else ipconfig(st, false); return;
      case "ping": return ping(st, args);
      case "tracert": case "traceroute": return tracert(st, args);
      case "nslookup": return nslookup(st, args);
      case "dir": case "ls": case "get-childitem": case "gci": if (lc !== "dir" && st.mode !== "ps") break; return dir(st, args);
      case "cd": case "chdir": case "set-location": case "sl": if ((lc === "set-location" || lc === "sl") && st.mode !== "ps") break; return cd(st, args);
      case "pwd": case "get-location": if (st.mode !== "ps") break; print(st, "\nPath\n----\n" + st.cwd + "\n"); return;
      case "type": case "cat": case "gc": case "get-content": if (lc !== "type" && st.mode !== "ps") break; return typeFile(st, args, "Get-Content");
      case "notepad": return notepad(st, args);
      case "lpr": return lprCmd(st, args);
      case "lpq": return lpqCmd(st, args);
      case "print": if (st.mode === "ps") break; return printCmd(st, args);
      case "rundll32": return rundll(st, line);
      case "start": case "start-process": case "saps": if (lc !== "start" && st.mode !== "ps") break; return startCmd(st, args, line);
      case "msedge": case "chrome": App.openApp("browser", args[0] || ""); return;
      case "control": if (!args.length || /printers/i.test(args[0])) App.openApp("printers"); else if (/ncpa/i.test(args[0])) App.openApp("network"); else App.openApp("printers"); return;
      case "ncpa.cpl": App.openApp("network"); return;
      case "optionalfeatures": App.openApp("features"); return;
      case "powershell": case "pwsh": if (st.mode === "ps") return; st.mode = "ps"; banner(st); return;
      case "cmd": if (st.mode === "cmd") { banner(st); return; } st.mode = "cmd"; return;
      case "exit": if (st.mode === "ps" && st.base === "cmd") { st.mode = "cmd"; return; } App.closeWin(st.id); return;
      case "out-printer": if (st.mode === "ps") { print(st, ""); return; } break;
      case "netsh": print(st, "\nAquesta ordre no està disponible en el simulador. Fes servir la Configuració de xarxa (ncpa.cpl).\n"); return;
      case "net": if (args[0] && args[0].toLowerCase() === "use") { print(st, "S'ha produït l'error de sistema 53.\n\nNo s'ha trobat el camí de xarxa."); return; } break;
      case "arp": print(st, "\nInterfície: " + N.effective(App.device, App.state.net).ip + " --- 0xc\n  Adreça Internet       Adreça física         Tipus\n  " + pad(App.dept.gw, 22) + pad("00-1a-2b-3c-4d-0" + App.dept.vlan / 10, 22) + "dinàmic\n"); return;
    }
    if (st.mode === "ps" && CMDLETS[lc]) return CMDLETS[lc](st, args, line);
    notFound(st, cmd);
  }

  function runPipe(st, line) {
    var parts = splitPipe(line);
    var left = tokenize(parts[0]), lc = (left[0] || "").toLowerCase();
    var rest = parts.slice(1).map(function (p) { return tokenize(p); });
    var outPrinter = rest.filter(function (r) { return r[0] && r[0].toLowerCase() === "out-printer"; })[0];
    var formatters = ["format-table", "ft", "format-list", "fl", "select-object", "select", "sort-object", "sort", "out-host", "more"];
    if (!outPrinter) {
      var ok = rest.every(function (r) { return r[0] && formatters.indexOf(r[0].toLowerCase()) !== -1; });
      if (!ok) { var bad = rest.filter(function (r) { return !(r[0] && formatters.indexOf(r[0].toLowerCase()) !== -1); })[0]; return notFound(st, bad[0] || "|"); }
      return run(st, parts[0]);
    }
    var op = psParams(outPrinter.slice(1), ["Name", "InputObject"]);
    if (op._err) return psErr(st, "Out-Printer", op._err, line);
    var printer = op.Name ? App.findPrinter(op.Name) : App.defaultPrinter();
    if (!printer) return psErr(st, "Out-Printer", op.Name ? "No s'ha trobat la impressora «" + op.Name + "»." : "No hi ha cap impressora predeterminada.", line);
    if (["get-content", "gc", "cat", "type"].indexOf(lc) !== -1) {
      var f = resolveFile(st.cwd, left.slice(1).join(" "));
      if (!f) return psErr(st, "Get-Content", "No es troba el camí '" + joinPath(st.cwd, left.slice(1).join(" ")) + "' perquè no existeix.", line);
      printFile(st, printer, f.file, "consola");
      return;
    }
    if (["echo", "write-output"].indexOf(lc) !== -1 || /^["']/.test(parts[0])) {
      var pr = prefsOf(printer);
      App.printJob(printer, { doc: "Text des de PowerShell", pages: 1, copies: 1, duplex: pr.duplex, paper: pr.paper, method: "consola" });
      return;
    }
    if (lc === "get-printer" || lc === "get-printerport" || lc === "dir" || lc === "ls" || lc === "get-childitem" || lc === "ipconfig") {
      var pr2 = prefsOf(printer);
      App.printJob(printer, { doc: "Sortida de " + left[0], pages: 1, copies: 1, duplex: pr2.duplex, paper: pr2.paper, method: "consola" });
      return;
    }
    notFound(st, left[0] || "|");
  }
})();
