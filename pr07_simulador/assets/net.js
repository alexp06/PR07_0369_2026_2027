/* PR07 · Motor de xarxa simulat: càlcul d'IP, encaminament, tallafoc (ACL), DNS i serveis.
   No fa cap connexió real: decideix, a partir de la configuració del dispositiu, què passaria. */
(function () {
  "use strict";
  var D = window.PR07_DATA;

  function ipToInt(s) {
    if (typeof s !== "string") return null;
    s = s.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null;
    var p = s.split(".").map(Number);
    for (var i = 0; i < 4; i++) if (p[i] > 255) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }
  function intToIp(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."); }
  function maskToInt(m) {
    if (typeof m !== "string") return null;
    m = m.trim();
    var pref = null;
    if (/^\/?\d{1,2}$/.test(m)) pref = parseInt(m.replace("/", ""), 10);
    if (pref !== null) {
      if (pref < 0 || pref > 32) return null;
      return pref === 0 ? 0 : ((0xFFFFFFFF << (32 - pref)) >>> 0);
    }
    var n = ipToInt(m);
    if (n === null) return null;
    var inv = (~n) >>> 0;               // una màscara vàlida té els uns seguits
    if (((inv + 1) & inv) !== 0) return null;
    return n;
  }
  function prefixOf(maskInt) { var c = 0, n = maskInt >>> 0; while (n) { c += n & 1; n >>>= 1; } return c; }
  function sameNet(a, b, m) { return ((a & m) >>> 0) === ((b & m) >>> 0); }
  function inNet(ip, net, mask) { return sameNet(ipToInt(ip), ipToInt(net), maskToInt(mask)); }

  function apipaFor(device) {
    var parts = device.mac.split(":").map(function (h) { return parseInt(h, 16); });
    return "169.254." + (parts[4] % 254 + 1) + "." + (parts[5] % 254 + 1);
  }

  // Configuració efectiva del dispositiu (el que mostraria ipconfig)
  function effective(device, net) {
    net = net || {};
    if (net.mode !== "static") {
      return { mode: "dhcp", ip: apipaFor(device), mask: "255.255.0.0", gw: "", dns: [], apipa: true };
    }
    var dns = [net.dns1, net.dns2].filter(function (x) { return x && ipToInt(x) !== null; });
    return { mode: "static", ip: (net.ip || "").trim(), mask: (net.mask || "").trim(), gw: (net.gw || "").trim(), dns: dns, apipa: false };
  }

  // Diagnòstic de la configuració IPv4 respecte del que IT ha assignat (missió 1)
  function diagnose(device, net) {
    var dept = D.deptById(device.dept);
    var e = effective(device, net);
    if (e.apipa) return { ok: false, code: "dhcp", msg: "El dispositiu espera DHCP, però a la VLAN del departament no n'hi ha: Windows s'ha autoassignat una adreça APIPA (169.254.x.x)." };
    var ip = ipToInt(e.ip), mask = maskToInt(e.mask);
    if (ip === null) return { ok: false, code: "bad_ip", msg: "L'adreça IP no és vàlida." };
    if (mask === null) return { ok: false, code: "bad_mask", msg: "La màscara de subxarxa no és vàlida." };
    var dNet = ipToInt(dept.net), dMask = maskToInt(dept.mask);
    if (!sameNet(ip, dNet, dMask)) return { ok: false, code: "wrong_subnet", msg: "Aquesta IP no pertany a la subxarxa de la VLAN " + dept.vlan + " (" + dept.name + ")." };
    var bcast = (dNet | (~dMask >>> 0)) >>> 0;
    if (ip === dNet || ip === bcast) return { ok: false, code: "reserved", msg: "És l'adreça de xarxa o de difusió: no es pot assignar a un equip." };
    if (ip === ipToInt(dept.gw)) return { ok: false, code: "conflict", msg: "Conflicte d'adreça IP: aquesta adreça és la del router (passarel·la)." };
    for (var i = 0; i < D.devices.length; i++) {
      var o = D.devices[i];
      if (o.id !== device.id && o.ip === e.ip) return { ok: false, code: "conflict", msg: "Windows ha detectat un conflicte d'adreces IP: " + e.ip + " ja la fa servir " + o.id + "." };
    }
    if (e.ip !== device.ip) return { ok: false, code: "not_assigned", msg: "Aquesta no és l'adreça que IT ha assignat al dispositiu (mira la fitxa)." };
    if (mask !== dMask) return { ok: false, code: "mask", msg: "La màscara no coincideix amb la de la VLAN del departament." };
    if (e.gw !== dept.gw) return { ok: false, code: "gw", msg: e.gw ? "La passarel·la configurada no és el router de la VLAN." : "Falta la passarel·la predeterminada." };
    return { ok: true, code: "ok", msg: "Configuració correcta." };
  }

  // Inventari d'equips coneguts a la xarxa
  function hostAt(ipStr) {
    if (ipStr === D.printer.ip) return { kind: "printer", ttl: 63, name: D.printer.fqdn };
    if (ipStr === D.dns.ip) return { kind: "dns", ttl: 63, name: D.dns.fqdn };
    if (ipStr === D.commonZone.gw) return { kind: "router", ttl: 255, name: "fw-core.badiatech.local" };
    for (var i = 0; i < D.departments.length; i++) if (D.departments[i].gw === ipStr) return { kind: "router", ttl: 255, dept: D.departments[i].id, name: "fw-core.badiatech.local" };
    for (var j = 0; j < D.devices.length; j++) if (D.devices[j].ip === ipStr) return { kind: "pc", ttl: 127, dept: D.devices[j].dept, name: D.devices[j].id.toLowerCase() + ".badiatech.local" };
    return null;
  }

  // Encaminament (sense tenir en compte el tallafoc)
  function route(device, net, dst) {
    var dept = D.deptById(device.dept);
    var e = effective(device, net);
    var src = ipToInt(e.ip), mask = maskToInt(e.mask), d = ipToInt(dst);
    if (d === null) return { ok: false, reason: "bad_dst" };
    if (dst === "127.0.0.1" || dst === e.ip) return { ok: true, kind: "loopback", ttl: 128 };
    if (src === null || mask === null) return { ok: false, reason: "no_net" };
    if (e.apipa) return sameNet(src, d, mask) ? { ok: false, reason: "arp", from: e.ip } : { ok: false, reason: "no_gw" };
    var dNet = ipToInt(dept.net), dMask = maskToInt(dept.mask);
    // El cable va al switch de la VLAN del departament: amb una IP d'una altra subxarxa no parles amb ningú
    if (!sameNet(src, dNet, dMask)) return { ok: false, reason: "isolated", from: e.ip };
    var dup = e.ip === dept.gw || D.devices.some(function (o) { return o.id !== device.id && o.ip === e.ip; });
    if (dup) return { ok: false, reason: "conflict" };
    var target = hostAt(dst);
    if (sameNet(src, d, mask)) {
      var reallyLocal = sameNet(d, dNet, dMask);
      if (reallyLocal && target && (target.kind === "router" || (target.kind === "pc" && target.dept === dept.id))) {
        return { ok: true, kind: "local", ttl: target.kind === "router" ? 255 : 128 };
      }
      return { ok: false, reason: "arp", from: e.ip };   // el creu local però no hi és: ARP sense resposta
    }
    if (!e.gw) return { ok: false, reason: "no_gw" };
    var gw = ipToInt(e.gw);
    if (gw === null || !sameNet(src, gw, mask)) return { ok: false, reason: "no_gw" };
    if (e.gw !== dept.gw) return { ok: false, reason: "bad_gw", from: e.ip };
    if (!target) {
      var known = D.departments.some(function (x) { return sameNet(d, ipToInt(x.net), maskToInt(x.mask)); }) || sameNet(d, ipToInt(D.commonZone.net), maskToInt(D.commonZone.mask));
      return known ? { ok: false, reason: "router_arp", from: dept.gw } : { ok: false, reason: "no_route" };
    }
    return { ok: true, kind: "routed", ttl: target.ttl, target: target };
  }

  // Tallafoc central (el trànsit que passa pel router)
  function acl(deptId, dst, proto, port) {
    var dept = D.deptById(deptId);
    if (dst === D.printer.ip) {
      if (proto === "icmp") return { allow: true };
      if (proto === "tcp" && (port === 80 || port === 443)) return { allow: true };
      if (proto === "tcp" && port === dept.port) return { allow: true };
      return { allow: false, why: "La VLAN " + dept.vlan + " (" + dept.name + ") només té permès " + dept.proto + " (" + dept.port + "/tcp) cap a la impressora" };
    }
    if (dst === D.dns.ip) {
      if (proto === "icmp" || port === 53) return { allow: true };
      return { allow: false, why: "Al servidor DNS només s'hi permet DNS (53) i ICMP" };
    }
    if (dst === D.commonZone.gw && proto === "icmp") return { allow: true };
    var t = hostAt(dst);
    if (t && t.dept && t.dept !== deptId) return { allow: false, why: "Tràfic entre departaments bloquejat (xarxes aïllades)" };
    return { allow: false, why: "Regla implícita: tot el que no està permès es denega" };
  }

  // Serveis que escolta cada equip
  function listening(dst, proto, port) {
    var t = hostAt(dst);
    if (!t) return false;
    if (proto === "icmp") return true;
    if (t.kind === "printer") return [80, 443, 515, 631, 9100].indexOf(port) !== -1;
    if (t.kind === "dns") return port === 53;
    if (t.kind === "router") return port === 22 || port === 443;
    return false;
  }

  // Intent de connexió complet. Retorna també l'esdeveniment del tallafoc si cal registrar-lo.
  function connect(device, net, dst, proto, port) {
    var r = route(device, net, dst);
    if (!r.ok) return { ok: false, stage: "route", reason: r.reason, from: r.from };
    if (r.kind === "loopback") return { ok: proto === "icmp", stage: "service", reason: proto === "icmp" ? "ok" : "refused", ttl: 128 };
    if (r.kind === "local") return { ok: proto === "icmp", stage: "service", reason: proto === "icmp" ? "ok" : "refused", ttl: r.ttl };
    var a = acl(device.dept, dst, proto, port);
    var e = effective(device, net);
    if (!a.allow) {
      return { ok: false, stage: "acl", reason: "timeout",
        deny: { proto: proto.toUpperCase(), src: e.ip, dst: dst, port: port, why: a.why } };
    }
    if (!listening(dst, proto, port)) return { ok: false, stage: "service", reason: "refused" };
    return { ok: true, stage: "service", reason: "ok", ttl: r.ttl };
  }

  var NAMES = {};
  NAMES[D.printer.host] = D.printer.ip; NAMES[D.printer.fqdn] = D.printer.ip;
  NAMES[D.dns.host] = D.dns.ip; NAMES[D.dns.fqdn] = D.dns.ip;
  NAMES["fw-core"] = D.commonZone.gw; NAMES["fw-core.badiatech.local"] = D.commonZone.gw;
  D.devices.forEach(function (dv) { NAMES[dv.id.toLowerCase()] = dv.ip; NAMES[dv.id.toLowerCase() + ".badiatech.local"] = dv.ip; });

  // Resolució de noms (cal un DNS configurat i accessible)
  function resolve(device, net, name) {
    if (!name) return { ok: false, reason: "empty" };
    name = String(name).trim().toLowerCase().replace(/\.$/, "");
    if (ipToInt(name) !== null) return { ok: true, ip: name };
    if (name === "localhost") return { ok: true, ip: "127.0.0.1" };
    if (name === device.id.toLowerCase()) return { ok: true, ip: effective(device, net).ip };
    var e = effective(device, net);
    if (!e.dns.length) return { ok: false, reason: "no_dns" };
    var reachable = e.dns.some(function (srv) { return connect(device, net, srv, "udp", 53).ok && srv === D.dns.ip; });
    if (!reachable) return { ok: false, reason: "dns_unreachable" };
    if (Object.prototype.hasOwnProperty.call(NAMES, name)) return { ok: true, ip: NAMES[name] };
    return { ok: false, reason: "nxdomain" };
  }

  window.PR07_NET = {
    ipToInt: ipToInt, intToIp: intToIp, maskToInt: maskToInt, prefixOf: prefixOf, inNet: inNet,
    effective: effective, diagnose: diagnose, route: route, acl: acl, connect: connect, resolve: resolve, hostAt: hostAt
  };
})();
