# PR07 · Simulador de xarxa i impressió «Badia Tech»

Simulador web per substituir els exercicis 2–6 de la PR07 quan no hi ha impressora física.
L'empresa fictícia Badia Tech, S.L. té **6 departaments**, cadascun en una **VLAN/subxarxa diferent i aïllada**,
i una **impressora compartida a la Zona comuna** (VLAN 100). El tallafoc central només deixa passar,
des de cada departament, **un protocol d'impressió concret** (RAW 9100, IPP 631 o LPR 515).

Cada alumne agafa un dispositiu i ha de:

1. Configurar la xarxa del dispositiu (IP estàtica assignada, màscara i passarel·la de la seva VLAN, DNS).
2. Instal·lar la impressora de xarxa amb el protocol permès i el controlador correcte, i imprimir una pàgina de prova.
3. Configurar la doble cara.
4. Imprimir des de la línia d'ordres (cmd o PowerShell).
5. Crear la mida de full «Carta de [nom]».
6. Entrar a la interfície web de la impressora (per IP) i consultar el tòner.
7. ★ Repte: imprimir un document a doble cara amb la mida «Carta de [nom]».

Tots els documents que imprimeixen arriben a **una mateixa cua compartida** que es veu en temps real a la
**pantalla del docent** (per al projector), juntament amb el mapa de xarxa, els bloquejos del tallafoc i el progrés.

| Pàgina | Per a qui | Adreça |
|---|---|---|
| `index.html` | Alumnat | `https://el-teu-projecte.vercel.app/?sala=ASIXB` |
| `docent.html` | Docent (PIN) | `https://el-teu-projecte.vercel.app/docent.html?sala=ASIXB` |

El codi de **sala** (p. ex. `ASIXB`) separa grups: cada sala té els seus dispositius, la seva cua i el seu tòner.

## 0. Nivells de dificultat

El simulador té **dos nivells**, que es trien amb l'enllaç (cal que alumnat i docent facin servir el mateix):

| Nivell | Enllaç | Què canvia |
|---|---|---|
| **Bàsic** (per defecte) | `…/?sala=ASIXB` · `…/docent.html?sala=ASIXB` | Sense subnetting. Totes les xarxes són `192.168.X.0/24` (màscara `255.255.255.0`, passarel·la `.1`), el tallafoc deixa passar RAW, LPR i IPP, i la **Fitxa del dispositiu** ja dona els 4 valors a escriure (IP, màscara, passarel·la, DNS) i l'IP de la impressora. Inclou un petit glossari («què és una IP estàtica, la màscara, la passarel·la…»). Les missions expliquen pas a pas on clicar. |
| **Avançat** | `…/?sala=ASIXB&nivell=avancat` · `…/docent.html?sala=ASIXB&nivell=avancat` | Subnetting real, màscares diferents, un únic protocol permès per departament i la fitxa només diu «màscara de la VLAN» (cal consultar la Intranet). Per quan ja s'hagi treballat xarxes. |

No canviïs de nivell amb una sala ja començada: usa un codi de sala nou o reinicia la partida.

### Solucionari del nivell bàsic
- Dispositiu `XXX-PC0n` → IP `192.168.<VLAN>.<10+n>` (p. ex. COM-PC02 = `192.168.20.12`). VLAN: ADM 10, COM 20, RRH 30, LOG 40, DEV 50, DIR 60.
- Màscara `255.255.255.0` · passarel·la `192.168.<VLAN>.1` · DNS `192.168.100.10`.
- **La impressora es detecta sola** a Impressores i escàners › «Afegeix un dispositiu», però només si la xarxa de l'equip està ben configurada (si no, surt «No s'ha trobat cap impressora»). Un clic a «Afegeix el dispositiu» la instal·la amb el controlador i el port correctes: l'alumne no ha de triar protocol ni port. Impressora `192.168.100.50`, controlador **Lumina LP-4040dn PCL6**. Si algú vol fer-ho a mà (assistent «La impressora que vull no apareix»), en escriure la IP el Windows detecta el port sol i salta directament a triar el controlador. La resta (doble cara, formulari, consola, tòner a `http://192.168.100.50/consumibles`) és igual que a l'avançat.
- Errors típics que passen: DHCP → IP 169.254.x.x; màscara equivocada (p. ex. 255.0.0.0); passarel·la d'un altre departament; IP de la impressora mal escrita.

> Les taules de la secció 3 són del nivell **avançat**.

---

## 1. Posada en marxa (uns 15 minuts, només el primer cop)

### A) Base de dades compartida (Supabase, gratuït)

1. Crea un compte a <https://supabase.com> i un projecte nou. Tria una regió de la UE (p. ex. *Central EU – Frankfurt*).
2. Obre `supabase/setup.sql`, **canvia el PIN del docent** a l'última línia (`'CANVIA-AQUEST-PIN'`) per un de llarg.
3. A Supabase: **SQL Editor › New query**, enganxa tot el fitxer i prem **Run**. Es pot tornar a executar sense perdre dades (per exemple, per canviar el PIN).
4. A **Project Settings › API** (o *Data API* / *API Keys*) copia:
   - la **Project URL** (`https://xxxx.supabase.co`)
   - la clau **pública**: `anon` o `publishable` (`sb_publishable_…`). **Mai** la `service_role` / `secret`.
5. Enganxa-les a `config.js`:

```js
window.PR07_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseKey: "sb_publishable_xxxxxxxx",
  defaultRoom: "ASIXB"
};
```

> La clau pública és visible al navegador i és normal: totes les escriptures passen per funcions de la base de
> dades que comproven el codi secret de cada dispositiu (alumnat) o el PIN (docent). Ningú no pot llegir els PIN.

### B) Publicar a Vercel

No cal cap compilació: és una web estàtica.

**Opció 1 · GitHub (recomanada)**
1. Crea un repositori a GitHub i puja-hi tot el contingut d'aquesta carpeta (amb el `config.js` ja omplert).
2. A Vercel: **Add New › Project › Import** el repositori. *Framework Preset*: **Other**. Sense *Build Command*. **Deploy**.
3. Cada canvi que pugis a GitHub es torna a publicar sol.

**Opció 2 · Línia d'ordres**
```bash
cd pr07_simulador
npx vercel          # la primera vegada et demana iniciar sessió i crear el projecte
npx vercel --prod
```

### C) Comprovació
1. Obre `…/docent.html?sala=PROVA`, entra amb el PIN.
2. En una altra finestra obre `…/?sala=PROVA`, agafa un dispositiu i imprimeix una pàgina de prova.
3. Ha d'aparèixer al mapa i a la cua del docent. Quan acabis, **Reinicia la partida** de la sala `PROVA`.

### Mode demostració
Si `config.js` no té dades, tot funciona **només dins del navegador on l'obres** (PIN docent de prova: `1234`).
Serveix per provar-ho sense Supabase obrint l'alumne i el docent en dues pestanyes del mateix navegador.

---

## 2. A classe

- Passa a l'alumnat l'enllaç `…/?sala=ASIXB` (per exemple, a Moodle) i projecta `docent.html?sala=ASIXB`.
- **La impressora només imprimeix mentre la pantalla del docent està oberta.** Pots canviar-ne la velocitat,
  posar-la fora de línia, recarregar el tòner o buidar la cua.
- **Mode projector**: amaga els botons d'administració i pot posar el navegador a pantalla completa.
- Clica un dispositiu del mapa o el nom d'un alumne per veure **la seva configuració** (IP, impressores,
  ports, doble cara, formularis i últims errors): molt útil per ajudar-lo o per validar.
- **Allibera** un dispositiu si un alumne s'ha equivocat de lloc (en perd el progrés).
- Si un alumne canvia d'ordinador, pot recuperar el dispositiu amb el **codi de recuperació** que té al panell de missions.
- **Exporta CSV** descarrega el progrés de tothom (hora de cada missió) per passar-lo a la graella.
- Al final del curs o entre grups: **Reinicia la partida** (cal escriure REINICIA).
- Supabase posa en pausa els projectes gratuïts que fa dies que no s'utilitzen: si l'alumnat veu
  «No es pot connectar amb el servidor», entra al tauler de Supabase i reactiva el projecte.
- Dades personals: només es guarda el nom que escriu l'alumne i el seu progrés, al teu projecte de Supabase.
  N'hi ha prou amb nom i primer cognom.

---

## 3. Solucionari per al docent

Servidor DNS per a tothom: **10.10.100.10**. Impressora: **10.10.100.50** (`prn-comuna.badiatech.local`),
model **Lumina LP-4040dn** → controlador **Lumina LP-4040dn PCL6** (o **PS**).

| Departament | VLAN | Màscara | Passarel·la | Protocol permès | Com s'instal·la |
|---|---|---|---|---|---|
| Administració | 10 · 10.10.10.0/24 | 255.255.255.0 | 10.10.10.1 | RAW 9100 | TCP/IP › Estàndard (Generic Network Card) o Personalitzat › Raw 9100 |
| Comercial | 20 · 10.10.20.0/25 | 255.255.255.128 | 10.10.20.1 | IPP 631 | «Selecciona una impressora compartida per nom»: `http://10.10.100.50:631/ipp/print` |
| Recursos Humans | 30 · 10.10.30.64/26 | 255.255.255.192 | 10.10.30.65 | LPR 515 | TCP/IP › Personalitzat › Configuració › LPR, cua `COMUNA` |
| Logística | 40 · 10.10.40.0/24 | 255.255.255.0 | 10.10.40.254 | RAW 9100 | Com Administració |
| Desenvolupament | 50 · 172.16.50.0/24 | 255.255.255.0 | 172.16.50.1 | IPP 631 | Com Comercial |
| Direcció | 60 · 10.10.60.128/27 | 255.255.255.224 | 10.10.60.129 | LPR 515 | Com Recursos Humans |

IP assignada a cada dispositiu (és a la seva fitxa):

| | PC01 | PC02 | PC03 |
|---|---|---|---|
| ADM | 10.10.10.37 | 10.10.10.58 | 10.10.10.112 |
| COM | 10.10.20.44 | 10.10.20.71 | 10.10.20.103 |
| RRH | 10.10.30.70 | 10.10.30.86 | 10.10.30.101 |
| LOG | 10.10.40.52 | 10.10.40.97 | 10.10.40.163 |
| DEV | 172.16.50.31 | 172.16.50.75 | 172.16.50.118 |
| DIR | 10.10.60.134 | 10.10.60.141 | 10.10.60.150 |

**Doble cara**: Propietats de la impressora › *Configuració del dispositiu* › Unitat d'impressió a doble cara:
**Instal·lada**; després *Preferències d'impressió* › Imprimeix per les dues cares.
Per PowerShell: `Set-PrinterProperty -PrinterName "X" -PropertyName Config:DuplexUnit -Value TRUE` i
`Set-PrintConfiguration -PrinterName "X" -DuplexingMode TwoSidedLongEdge`.

**Impressió per consola** (qualsevol d'aquestes, des de la carpeta Documents):
- `notepad /p fitxer.txt` (impressora predeterminada) · `notepad /pt fitxer.txt "Nom de la impressora"`
- PowerShell: `Get-Content fitxer.txt | Out-Printer -Name "Nom"` · `Start-Process fitxer.txt -Verb Print`
- Només RRH i Direcció: `lpr -S 10.10.100.50 -P COMUNA fitxer.txt` (cal activar *Monitor de port LPR* a Característiques del Windows).
- `print /d:...` **no** funciona amb impressores de xarxa (com al Windows real).

**Mida personalitzada**: Impressores i escàners › Propietats del servidor d'impressió › Formularis ›
Crea un formulari nou › «Carta de Nom» › Desa el formulari.

**Tòner**: navegador › `http://10.10.100.50/consumibles` (o `https://…` acceptant l'avís del certificat).

### Errors que el simulador reprodueix (i que val la pena comentar)
- Sense configurar res, el Windows està en DHCP i s'autoassigna una **APIPA 169.254.x.x**.
- En entrar a la màscara, el Windows proposa la **màscara de classe** (10.x → 255.0.0.0): si l'accepten, la impressora «sembla local» i no hi arriben.
- La impressora **no apareix sola** (WSD/mDNS/SNMP no travessen el tallafoc): s'ha d'afegir per adreça.
- Si fan servir un protocol no permès, la pàgina de prova falla per temps d'espera i el bloqueig surt en vermell al teu registre del tallafoc.
- Amb un **controlador d'un altre model** el document arriba però «s'imprimeixen caràcters estranys»; amb el **genèric** no hi ha doble cara ni mides personalitzades.
- Fer ping a un equip d'un altre departament falla: les xarxes estan aïllades.

---

## 4. Nou enunciat de l'exercici pràctic (per a la PR07)

> **Exercici pràctic**
> 1. Fes una instal·lació de **Windows 11** a una màquina virtual.
> 2. Entra al simulador de l'empresa Badia Tech (enllaç a Moodle), escriu el teu nom i agafa un dispositiu.
>    Connecta'l a la xarxa del teu departament amb la configuració IP que t'indica IT.
> 3. Instal·la la **impressora de xarxa** de la Zona comuna amb el protocol que el tallafoc permet al teu
>    departament i el controlador correcte, i imprimeix una pàgina de prova.
> 4. Configura la impressora perquè imprimeixi a **doble cara**.
> 5. Imprimeix un arxiu directament des de la **línia d'ordres** (cmd o PowerShell).
> 6. Crea una **mida de full personalitzada** amb el nom «Carta de [el teu nom]».
> 7. Entra a la **interfície web** de la impressora (pista: la seva IP) i consulta el nivell del tòner.
> 8. ★ Repte: imprimeix un document a doble cara amb la mida «Carta de [el teu nom]».
>
> Documenta cada pas a la memòria amb captures on es vegin el teu nom i la data, i explica per què has
> triat aquesta màscara, aquesta passarel·la i aquest protocol d'impressió.

---

## Fitxers

```
index.html            alumnat
docent.html           pantalla del docent
config.js             connexió amb Supabase (l'has d'omplir)
supabase/setup.sql    taules, seguretat i funcions (executar una vegada a Supabase)
assets/               codi i estils (data.js conté l'empresa, la xarxa i els dispositius)
assets/vendor/        @supabase/supabase-js 2.117.3 (llicència MIT)
```
