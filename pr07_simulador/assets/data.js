/* PR07 · Simulador d'impressió en xarxa · Dades de l'empresa fictícia "Badia Tech, S.L."
   Cada departament té la seva pròpia VLAN/subxarxa (aïllades entre elles) i la impressora
   és a la Zona comuna. El tallafoc central només deixa passar, des de cada departament,
   el protocol d'impressió que té permès (i el web/ICMP cap a la impressora i el DNS). */
(function () {
  "use strict";

  var PRINTER = {
    ip: "10.10.100.50",
    host: "prn-comuna",
    fqdn: "prn-comuna.badiatech.local",
    model: "Lumina LP-4040dn",
    serial: "LMN4040-7Q2K91",
    mac: "00:1B:A9:4C:3E:50",
    firmware: "LP4040_FW 3.12.7",
    location: "Zona comuna · planta 1 · al costat de la sala de reunions",
    lprQueue: "COMUNA",
    ippPath: "/ipp/print",
    rawPort: 9100,
    lprPort: 515,
    ippPort: 631,
    mask: "255.255.255.0",
    gw: "10.10.100.1"
  };

  var DNS_SERVER = { ip: "10.10.100.10", host: "dns01", fqdn: "dns01.badiatech.local" };

  // proto: protocol d'impressió que el tallafoc permet des d'aquesta VLAN cap a la impressora
  var DEPARTMENTS = [
    { id: "ADM", name: "Administració",   vlan: 10, net: "10.10.10.0",  mask: "255.255.255.0",   gw: "10.10.10.1",   proto: "RAW", port: 9100, color: "#2F6FB3" },
    { id: "COM", name: "Comercial",       vlan: 20, net: "10.10.20.0",  mask: "255.255.255.128", gw: "10.10.20.1",   proto: "IPP", port: 631,  color: "#C2410C" },
    { id: "RRH", name: "Recursos Humans", vlan: 30, net: "10.10.30.64", mask: "255.255.255.192", gw: "10.10.30.65",  proto: "LPR", port: 515,  color: "#7C3AED" },
    { id: "LOG", name: "Logística",       vlan: 40, net: "10.10.40.0",  mask: "255.255.255.0",   gw: "10.10.40.254", proto: "RAW", port: 9100, color: "#0F766E" },
    { id: "DEV", name: "Desenvolupament", vlan: 50, net: "172.16.50.0", mask: "255.255.255.0",   gw: "172.16.50.1",  proto: "IPP", port: 631,  color: "#B45309" },
    { id: "DIR", name: "Direcció",        vlan: 60, net: "10.10.60.128",mask: "255.255.255.224", gw: "10.10.60.129", proto: "LPR", port: 515,  color: "#BE185D" }
  ];

  var COMMON_ZONE = { id: "ZC", name: "Zona comuna", vlan: 100, net: "10.10.100.0", mask: "255.255.255.0", gw: "10.10.100.1" };

  var DEVICES = [
    { id: "ADM-PC01", dept: "ADM", ip: "10.10.10.37",   mac: "3C:52:82:1A:07:21" },
    { id: "ADM-PC02", dept: "ADM", ip: "10.10.10.58",   mac: "3C:52:82:1A:07:3A" },
    { id: "ADM-PC03", dept: "ADM", ip: "10.10.10.112",  mac: "3C:52:82:1A:07:70" },
    { id: "COM-PC01", dept: "COM", ip: "10.10.20.44",   mac: "3C:52:82:2B:11:2C" },
    { id: "COM-PC02", dept: "COM", ip: "10.10.20.71",   mac: "3C:52:82:2B:11:47" },
    { id: "COM-PC03", dept: "COM", ip: "10.10.20.103",  mac: "3C:52:82:2B:11:67" },
    { id: "RRH-PC01", dept: "RRH", ip: "10.10.30.70",   mac: "3C:52:82:3C:22:46" },
    { id: "RRH-PC02", dept: "RRH", ip: "10.10.30.86",   mac: "3C:52:82:3C:22:56" },
    { id: "RRH-PC03", dept: "RRH", ip: "10.10.30.101",  mac: "3C:52:82:3C:22:65" },
    { id: "LOG-PC01", dept: "LOG", ip: "10.10.40.52",   mac: "3C:52:82:4D:33:34" },
    { id: "LOG-PC02", dept: "LOG", ip: "10.10.40.97",   mac: "3C:52:82:4D:33:61" },
    { id: "LOG-PC03", dept: "LOG", ip: "10.10.40.163",  mac: "3C:52:82:4D:33:A3" },
    { id: "DEV-PC01", dept: "DEV", ip: "172.16.50.31",  mac: "3C:52:82:5E:44:1F" },
    { id: "DEV-PC02", dept: "DEV", ip: "172.16.50.75",  mac: "3C:52:82:5E:44:4B" },
    { id: "DEV-PC03", dept: "DEV", ip: "172.16.50.118", mac: "3C:52:82:5E:44:76" },
    { id: "DIR-PC01", dept: "DIR", ip: "10.10.60.134",  mac: "3C:52:82:6F:55:86" },
    { id: "DIR-PC02", dept: "DIR", ip: "10.10.60.141",  mac: "3C:52:82:6F:55:8D" },
    { id: "DIR-PC03", dept: "DIR", ip: "10.10.60.150",  mac: "3C:52:82:6F:55:96" }
  ];

  // Controladors disponibles a l'assistent. ok = controlador correcte per a la Lumina LP-4040dn.
  // generic = s'imprimeix però sense funcions (doble cara, formularis).
  var DRIVERS = [
    { maker: "Lumina",    name: "Lumina LP-2020 GDI",          ok: false },
    { maker: "Lumina",    name: "Lumina LP-4040dn PCL6",       ok: true  },
    { maker: "Lumina",    name: "Lumina LP-4040dn PS",         ok: true  },
    { maker: "Lumina",    name: "Lumina LP-6060 MFP PCL6",     ok: false },
    { maker: "Nexa",      name: "Nexa NX-210",                 ok: false },
    { maker: "Nexa",      name: "Nexa NX-450 Series",          ok: false },
    { maker: "Orbis",     name: "Orbis Jet 300 Series",        ok: false },
    { maker: "Orbis",     name: "Orbis LaserPro M12",          ok: false },
    { maker: "Microsoft", name: "Generic / Text Only",         ok: false, generic: true }
  ];

  var STANDARD_FORMS = [
    { name: "A4", w: 21.0, h: 29.7 },
    { name: "A5", w: 14.8, h: 21.0 },
    { name: "A3", w: 29.7, h: 42.0 },
    { name: "Carta", w: 21.59, h: 27.94 },
    { name: "Legal", w: 21.59, h: 35.56 },
    { name: "Sobre DL", w: 11.0, h: 22.0 }
  ];

  var DOCS = {
    ADM: [
      { file: "factura_2026_0412.txt", pages: 2, text: "BADIA TECH, S.L. · Factura núm. 2026/0412\nClient: Ferreteria Can Serra\nConcepte: Manteniment informàtic (octubre)\nImport: 1.240,00 € + IVA\nVenciment: 30 dies" },
      { file: "pressupost_Q4.txt", pages: 3, text: "Pressupost del quart trimestre\n- Renovació de llicències: 3.800 €\n- Formació interna: 1.200 €\n- Material d'oficina: 450 €" }
    ],
    COM: [
      { file: "oferta_client_valles.txt", pages: 2, text: "Oferta comercial · Vallès Logistics\nPaquet de suport 24/7 amb resposta en 4 h.\nPreu especial per a contractes de 2 anys." },
      { file: "cataleg_serveis.txt", pages: 4, text: "Catàleg de serveis 2026\n1. Instal·lació de xarxes\n2. Manteniment de sistemes\n3. Ciberseguretat gestionada\n4. Còpies de seguretat al núvol" }
    ],
    RRH: [
      { file: "calendari_vacances.txt", pages: 1, text: "Calendari de vacances 2026\nPeríodes preferents: agost i Nadal.\nCal sol·licitar-les amb 30 dies d'antelació." },
      { file: "protocol_acollida.txt", pages: 3, text: "Protocol d'acollida de noves incorporacions\nDia 1: lliurament d'equip i credencials.\nDia 2: formació en seguretat de la informació." }
    ],
    LOG: [
      { file: "albara_7731.txt", pages: 1, text: "Albarà de lliurament núm. 7731\nDestí: Magatzem de Sabadell\n12 x Portàtil · 4 x Switch 24 ports · 30 x Cable Cat6" },
      { file: "inventari_magatzem.txt", pages: 3, text: "Inventari del magatzem (estat a final de mes)\nPortàtils: 18 · Monitors: 27 · Impressores: 2 · Tòners: 3" }
    ],
    DEV: [
      { file: "README_projecte.txt", pages: 2, text: "Projecte Intranet v2\nRequisits: Node 20, PostgreSQL 16.\nDesplegament: entorn de proves cada divendres." },
      { file: "informe_errors.txt", pages: 2, text: "Informe d'errors setmana 43\n#211 Error d'inici de sessió amb SSO (resolt)\n#214 Lentitud al llistat de clients (pendent)" }
    ],
    DIR: [
      { file: "acta_reunio_direccio.txt", pages: 2, text: "Acta de la reunió de direcció\nAcords: aprovació del pla d'inversions i de la nova política de teletreball." },
      { file: "pla_estrategic_2027.txt", pages: 4, text: "Pla estratègic 2027\nObjectius: créixer un 15 %, obrir delegació a Terrassa i certificar-se en ISO 27001." }
    ]
  };

  var MISSIONS = [
    { id: "t1", title: "Connecta el dispositiu a la xarxa del teu departament",
      help: "Obre la configuració de xarxa. IT no fa servir DHCP als departaments: cal configurar l'adreça IP que tens a la fitxa, i la màscara i la passarel·la de la teva VLAN (són a la Intranet IT · Mapa de xarxa). Comprova-ho amb ping." },
    { id: "t2", title: "Instal·la la impressora de la Zona comuna i imprimeix una pàgina de prova",
      help: "Impressores i escàners › Afegeix una impressora. La impressora no és a la teva xarxa, així que no la trobarà automàticament: afegeix-la per adreça. Mira a la Política del tallafoc quin protocol té permès el teu departament (RAW 9100, LPR 515 o IPP 631) i fes servir el controlador del model correcte." },
    { id: "t3", title: "Configura la impressora perquè imprimeixi a doble cara",
      help: "Propietats de la impressora › Configuració del dispositiu: cal indicar que la unitat de doble cara està instal·lada. Després, a les Preferències d'impressió, activa la impressió per les dues cares." },
    { id: "t4", title: "Imprimeix un document des de la línia d'ordres",
      help: "Al Símbol del sistema: notepad /p fitxer o notepad /pt fitxer \"impressora\". A PowerShell: Get-Content fitxer | Out-Printer -Name \"impressora\". Si el teu departament fa servir LPR també pots provar lpr -S ... -P ... (cal activar el Client LPR a Característiques del Windows)." },
    { id: "t5", title: "Crea una mida de full personalitzada anomenada “Carta de [el teu nom]”",
      help: "Impressores i escàners › Propietats del servidor d'impressió › pestanya Formularis › Crea un formulari nou." },
    { id: "t6", title: "Consulta el nivell de tòner a la interfície web de la impressora",
      help: "Obre el navegador i escriu l'adreça IP de la impressora. Busca la pàgina de consumibles i anota aquí el percentatge de tòner que hi surt." }
  ];

  var BONUS = { id: "bonus", title: "Repte final: imprimeix un document a doble cara amb la mida “Carta de [el teu nom]”" };


  // ------------------------------------------------------------------ nivell
  // "basic" (per defecte): xarxes senzilles 192.168.X.0/24, tothom amb la mateixa màscara, la passarel·la sempre .1
  // i el tallafoc deixa passar tots els protocols d'impressió. Les dades exactes surten a la Fitxa.
  // "avancat" (?nivell=avancat): subnetting, màscares diferents i un protocol permès per departament.
  var LEVEL = (new URLSearchParams(location.search).get("nivell") || "basic").toLowerCase() === "avancat" ? "avancat" : "basic";
  if (LEVEL === "basic") {
    PRINTER.ip = "192.168.100.50"; PRINTER.gw = "192.168.100.1"; PRINTER.mask = "255.255.255.0";
    DNS_SERVER.ip = "192.168.100.10";
    COMMON_ZONE.net = "192.168.100.0"; COMMON_ZONE.mask = "255.255.255.0"; COMMON_ZONE.gw = "192.168.100.1";
    DEPARTMENTS.forEach(function (dp) {
      dp.net = "192.168." + dp.vlan + ".0"; dp.mask = "255.255.255.0"; dp.gw = "192.168." + dp.vlan + ".1";
      dp.proto = "RAW"; dp.port = 9100; dp.anyProto = true; dp.protoLabel = "tots (RAW, LPR, IPP)";
    });
    DEVICES.forEach(function (dv) {
      var dp = DEPARTMENTS.filter(function (x) { return x.id === dv.dept; })[0];
      var n = parseInt(dv.id.slice(-2), 10);
      dv.ip = "192.168." + dp.vlan + "." + (10 + n);
    });
    MISSIONS.length = 0;
    Array.prototype.push.apply(MISSIONS, [
      { id: "t1", title: "Connecta el dispositiu a la xarxa del teu departament",
        help: "Obre «Configuració de xarxa». Tria «Utilitza l'adreça IP següent» i escriu els 4 valors de la teva Fitxa: adreça IP, màscara, passarel·la i DNS. Quan estigui bé, l'estat dirà «Connectat»." },
      { id: "t2", title: "Instal·la la impressora de la Zona comuna i imprimeix una pàgina de prova",
        help: "Impressores i escàners › «Afegeix un dispositiu». Espera que acabi la cerca: si la xarxa està ben configurada, la impressora Lumina LP-4040dn apareixerà a la llista. Prem «Afegeix el dispositiu». Després fes clic al nom de la impressora i prem «Imprimeix una pàgina de prova»." },
      { id: "t3", title: "Configura la impressora perquè imprimeixi a doble cara",
        help: "Propietats de la impressora › Configuració del dispositiu: a «Unitat d'impressió a doble cara» posa «Instal·lada». Després, a Preferències d'impressió, tria «Imprimeix per les dues cares»." },
      { id: "t4", title: "Imprimeix un document des de la línia d'ordres",
        help: "Obre el Símbol del sistema. Escriu «dir» per veure els fitxers i després: notepad /p nom_del_fitxer.txt  (imprimeix a la impressora predeterminada)." },
      { id: "t5", title: "Crea una mida de full personalitzada anomenada “Carta de [el teu nom]”",
        help: "Impressores i escàners › Propietats del servidor d'impressió › pestanya Formularis › marca «Crea un formulari nou», posa-li el nom i les mides i desa'l." },
      { id: "t6", title: "Consulta el nivell de tòner a la interfície web de la impressora",
        help: "Obre el navegador i escriu l'adreça IP de la impressora (la de la Fitxa). Entra a «Consumibles» i anota el percentatge de tòner." }
    ]);
  }

  window.PR07_DATA = {
    level: LEVEL,
    company: "Badia Tech, S.L.",
    domain: "badiatech.local",
    printer: PRINTER,
    dns: DNS_SERVER,
    departments: DEPARTMENTS,
    commonZone: COMMON_ZONE,
    devices: DEVICES,
    drivers: DRIVERS,
    standardForms: STANDARD_FORMS,
    docs: DOCS,
    missions: MISSIONS,
    bonus: BONUS,
    deptById: function (id) { for (var i = 0; i < DEPARTMENTS.length; i++) if (DEPARTMENTS[i].id === id) return DEPARTMENTS[i]; return null; },
    deviceById: function (id) { for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i].id === id) return DEVICES[i]; return null; }
  };
})();
