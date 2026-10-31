.import "Strings.js" as Strings
function parseNetworkStatus(raw) {
  var parts = String(raw || "disconnected\t\t\t").replace(/\r?\n+$/, "").split("\t")
  return {
    kind: parts[0] || "disconnected",
    label: parts[1] || "",
    signalStrength: parts[2] ? parseInt(parts[2], 10) : -1,
    frequency: parts[3] || ""
  }
}

function wifiIconFor(strength) {
  var icons = ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]
  var index = Math.max(0, Math.min(4, Math.ceil(strength / 20) - 1))
  return icons[index]
}

function connectionIcon(kind, signalStrength) {
  if (kind === "wifi") return wifiIconFor(signalStrength)
  if (kind === "ethernet") return "󰈀"
  return "󰤮"
}

// pt-BR decimal comma for numbers shown in the panel.
function decimal(text) {
  return String(text).replace(".", ",")
}

function formatHeaderSpeed(mbps) {
  var v = parseInt(mbps, 10)
  if (!v || v < 0) return ""
  if (v >= 1000) return decimal((v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)) + " Gbit/s"
  return v + " Mbit/s"
}

function formatHeaderFreq(mhz) {
  var v = parseFloat(mhz)
  if (!v) return ""

  if (v >= 2400 && v < 2500) return Strings.T("2,4 GHz")
  if (v >= 4900 && v < 5925) return "5 GHz"
  if (v >= 5925 && v < 7125) return "6 GHz"
  if (v >= 57000 && v < 71000) return "60 GHz"

  var ghz = v / 1000
  return decimal(ghz.toFixed(ghz % 1 === 0 ? 0 : 1)) + " GHz"
}

// Wi-Fi band state belongs in the selector section, not beside the hero name.
// Ethernet has no equivalent selector, so keep its negotiated link speed here.
function headerDetail(info) {
  var value = info || {}
  if (value.type === "ethernet") return formatHeaderSpeed(value.speed || "")
  return ""
}

function bandLabel(band) {
  if (band === "auto") return Strings.T("Automático")
  if (!band) return ""
  return decimal(band) + " GHz"
}

// Under Automatic the pills are hidden, so the header carries the live band
// instead -- "FAIXA DO WI-FI: 2,4 GHZ". Once a band is pinned the pills are on
// screen and say it themselves, so the header drops back to a plain label.
function bandSectionTitle(selected, current) {
  if (selected !== "auto") return Strings.T("FAIXA DO WI-FI")

  var label = bandLabel(current)
  if (label === "") return Strings.T("FAIXA DO WI-FI")

  return Strings.T("FAIXA DO WI-FI: ") + label.toUpperCase()
}

function bandTooltip(band) {
  if (band === "auto") return Strings.T("Deixar o Wi-Fi escolher a faixa")
  if (!band) return ""
  return Strings.T("Ficar em ") + bandLabel(band)
}

function parseBandStatus(raw) {
  var next = parseKeyValue(raw)
  var tokens = String(next.available || "").split(" ")
  var available = []

  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "") available.push(tokens[i])
  }

  return {
    band: next.band || "",
    selected: next.selected || "auto",
    available: available
  }
}

function decodeIwSsid(value) {
  var raw = String(value || "")

  try {
    var encoded = ""

    for (var i = 0; i < raw.length; i++) {
      if (raw[i] === "\\" && raw[i + 1] === "x" && /^[0-9a-f]{2}$/i.test(raw.substring(i + 2, i + 4))) {
        var hex = raw.substring(i + 2, i + 4)
        var byte = parseInt(hex, 16)
        encoded += byte < 32 || byte === 127 ? encodeURIComponent(raw.substring(i, i + 4)) : "%" + hex
        i += 3
      } else {
        encoded += encodeURIComponent(raw[i])
      }
    }

    return decodeURIComponent(encoded)
  } catch (error) {
    return raw
  }
}

function parseKeyValue(raw) {
  var next = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (!line) continue
    var idx = line.indexOf("\t")
    if (idx === -1) continue
    var key = line.substring(0, idx)
    var value = line.substring(idx + 1)
    next[key] = key === "ssid" ? decodeIwSsid(value) : value.trim()
  }
  return next
}

function throughputState(previous, next, now) {
  var prev = previous || {}
  var sample = next || {}
  var iface = sample.iface || ""
  var rx = parseFloat(sample.rx_bytes || "0")
  var tx = parseFloat(sample.tx_bytes || "0")
  var previousTime = Number(prev.prevSampleTime || 0)

  if (iface !== (prev.prevIface || "") || previousTime === 0) {
    return {
      prevIface: iface,
      prevRxBytes: rx,
      prevTxBytes: tx,
      prevSampleTime: now,
      downloadRate: 0,
      uploadRate: 0
    }
  }

  var downloadRate = Number(prev.downloadRate || 0)
  var uploadRate = Number(prev.uploadRate || 0)
  var dt = now - previousTime
  if (dt > 0) {
    downloadRate = Math.max(0, (rx - Number(prev.prevRxBytes || 0)) / dt)
    uploadRate = Math.max(0, (tx - Number(prev.prevTxBytes || 0)) / dt)
  }

  return {
    prevIface: iface,
    prevRxBytes: rx,
    prevTxBytes: tx,
    prevSampleTime: now,
    downloadRate: downloadRate,
    uploadRate: uploadRate
  }
}

function pingSampleValue(raw) {
  var value = parseFloat(raw)
  if (!isFinite(value) || value < 0) return null
  return value
}

function appendPingSample(samples, raw, limit) {
  var values = Array.isArray(samples) ? samples.slice() : []

  values.push(pingSampleValue(raw))
  while (values.length > limit) values.shift()

  return values
}

function averagePingLatency(samples, limit) {
  var values = Array.isArray(samples) ? samples : []
  var sampleLimit = Math.max(1, parseInt(limit, 10) || values.length || 1)
  var total = 0
  var count = 0

  for (var i = Math.max(0, values.length - sampleLimit); i < values.length; i++) {
    var value = values[i]
    if (typeof value !== "number" || !isFinite(value) || value < 0) continue
    total += value
    count++
  }

  return count > 0 ? total / count : -1
}

function pingPacketLossPercent(samples) {
  var values = Array.isArray(samples) ? samples : []
  if (values.length === 0) return 0

  var lost = 0
  for (var i = 0; i < values.length; i++) {
    if (values[i] === null) lost++
  }

  return Math.round((lost / values.length) * 100)
}

function formatPacketLoss(percent, hasSamples) {
  if (hasSamples === false) return "--"

  var value = parseInt(percent, 10)
  if (!value || value < 0) return "0%"
  return value + "%"
}

function pingLatencyState(previous, next, limit, averageLimit) {
  var prev = previous || {}
  var sample = next || {}
  var iface = sample.iface || ""
  var window = Math.max(1, parseInt(limit, 10) || 5)
  var averageWindow = Math.max(1, parseInt(averageLimit, 10) || window)
  var reset = iface === "" || iface !== (prev.pingIface || "")
  var routerSamples = reset ? [] : prev.routerPingSamples
  var internetSamples = reset ? [] : prev.internetPingSamples

  routerSamples = sample.router_ping_ms === undefined ? [] : appendPingSample(routerSamples, sample.router_ping_ms, window)
  internetSamples = sample.internet_ping_ms === undefined ? [] : appendPingSample(internetSamples, sample.internet_ping_ms, window)

  return {
    pingIface: iface,
    routerPingSamples: routerSamples,
    internetPingSamples: internetSamples,
    routerPingLatency: averagePingLatency(routerSamples, averageWindow),
    internetPingLatency: averagePingLatency(internetSamples, averageWindow),
    internetPingPacketLoss: pingPacketLossPercent(internetSamples)
  }
}

function formatBytes(bytes) {
  var n = Number(bytes)
  if (!isFinite(n) || n < 0) n = 0
  if (n < 1024) return Math.round(n) + " B"
  if (n < 1024 * 1024) return decimal((n / 1024).toFixed(1)) + " KB"
  if (n < 1024 * 1024 * 1024) return decimal((n / (1024 * 1024)).toFixed(1)) + " MB"
  return decimal((n / (1024 * 1024 * 1024)).toFixed(2)) + " GB"
}

function formatRate(bytesPerSec) {
  return formatBytes(bytesPerSec) + "/s"
}

// `hasSamples` false means no probe has come back yet, which is different from
// a probe that timed out. The rows stay mounted through that gap and read "--"
// so the grid doesn't reflow a second after the panel opens.
function formatPingLatency(ms, hasSamples) {
  if (hasSamples === false) return "--"

  var value = parseFloat(ms)
  if (!isFinite(value) || value < 0) return Strings.T("Sem resposta")
  return decimal(value.toFixed(value > 0 && value < 10 ? 1 : 0)) + " ms"
}

function wifiRow(network) {
  if (!network) return null
  // Primitives only: rows become list-model data, so a WifiNetwork here puts a
  // live QObject wrapper in every delegate's var property. NetworkManager churn
  // (scans, AP removals) can destroy the object while a delegate is still
  // incubating, which segfaults quickshell in wrap_slowPath on the dangling
  // wrapper. Callers that need the object resolve it via networkForSsid().
  return {
    connected: !!network.connected,
    known: !!network.known,
    ssid: network.name || "",
    signal: Math.round((network.signalStrength || 0) * 100),
    security: network.security
  }
}

function sortWifiRows(rows) {
  var nets = Array.isArray(rows) ? rows.slice() : []
  nets.sort(function(a, b) {
    if (a.connected !== b.connected) return a.connected ? -1 : 1
    if (a.known !== b.known) return a.known ? -1 : 1
    return b.signal - a.signal
  })
  return nets
}

function wifiSectionTitle(wifiNetworks, index) {
  var networks = Array.isArray(wifiNetworks) ? wifiNetworks : []
  if (index < 0 || index >= networks.length) return ""

  var net = networks[index]
  if (!net) return ""

  if (net.known && index === 0) return Strings.T("REDES CONHECIDAS")
  if (!net.known && (index === 0 || (networks[index - 1] && networks[index - 1].known))) return Strings.T("OUTRAS REDES")
  return ""
}

// OWE (Enhanced Open) encrypts traffic without authenticating the user, so it
// has no credentials to collect. The panel's lock is a credentials-required
// affordance, so OWE should neither show it nor open its attached prompt.
function requiresCredentials(security, openSecurity, oweSecurity) {
  // Only explicit passwordless types bypass the prompt. Unknown security
  // stays credentialed as the conservative fallback.
  return security !== openSecurity && security !== oweSecurity
}

function canForgetNetwork(network) {
  return !!(network && network.known && !network.connected)
}

// Enterprise (802.1X) Wi-Fi is set up in the system's own tool, nmtui: the panel
// neither creates these profiles nor starts them. It connects only the types
// listed here, so a type it doesn't know goes to nmtui too.
function panelConnects(security, personalTypes) {
  return personalTypes.indexOf(security) >= 0
}

// True for what a saved profile (NMSettings.read()) says of itself. A network's
// security type comes from whichever access point is strongest, and connecting
// starts the saved profile, so the profile has to be personal too. Settings not
// loaded yet count as not personal.
function profileIsPersonal(settings) {
  if (!settings || !settings["802-11-wireless"] || settings["802-1x"]) return false
  var security = settings["802-11-wireless-security"]
  if (!security) return true
  return ["none", "owe", "wpa-psk", "sae"].indexOf(security["key-mgmt"]) >= 0
}

// Runs when the plugin loads, whenever the panel opens and, until it exits 0,
// every minute (see Entry.qml). Earlier versions of this plugin saved enterprise
// profiles that authenticate no server, and NetworkManager would auto-connect
// them on its own, handing the MSCHAPv2 exchange to any access point answering
// for the SSID. Each one still auto-connecting is brought down if it is up and
// gets `connection.autoconnect no`, in that order, so a failed attempt is tried
// again; nothing else in it changes, its password included. A profile already
// set not to auto-connect is left alone.
//
// Profiles are read over D-Bus (GetSettings, which never returns secrets), as
// typed fields with the SSID in bytes, not from nmcli's text: an SSID may hold
// newlines, and in text it could pass for another setting. The filter matches
// exactly what the old setup saved: PEAP/MSCHAPv2, auth-timeout 8, named after
// its SSID, no CA, no domain. autoconnect is left out of a profile when it is on.
//
// Prints one JSON object per legacy profile, {"kind": ..., "ssid": ...}:
//   paused   paused just now
//   down     paused just now, and the live connection brought down
//   kept     already not auto-connecting
//   failed   could not be brought down or paused (still auto-connects)
// Exits 0 when done, 2 when a profile could not be read, 3 when NetworkManager
// isn't running, 4 when a profile could not be paused. Every bar (one per
// screen) runs it, so runs take turns on a lock on the runtime directory.
var legacyProfileFilter =
  'def utf8: explode | map(if . < 128 then [.] elif . < 2048 then [192 + (. / 64 | floor), 128 + . % 64]' +
  ' elif . < 65536 then [224 + (. / 4096 | floor), 128 + ((. / 64 | floor) % 64), 128 + . % 64]' +
  ' else [240 + (. / 262144 | floor), 128 + ((. / 4096 | floor) % 64), 128 + ((. / 64 | floor) % 64), 128 + . % 64] end) | add // [];' +
  ' .data[0] | .connection as $c | ."802-1x" as $x | ."802-11-wireless".ssid.data as $ssid' +
  ' | ."802-11-wireless-security"."key-mgmt".data as $key' +
  ' | select($c.type.data == "802-11-wireless" and $x != null and ($key == "wpa-eap" or $key == "wpa-eap-suite-b-192" or $key == "ieee8021x"))' +
  ' | select($x["system-ca-certs"].data != true and (($x["ca-cert"].data // []) | length) == 0 and ($x["ca-path"].data // "") == "")' +
  ' | select(($x["domain-suffix-match"].data // "") == "" and ($x["domain-match"].data // "") == "")' +
  ' | select($x.eap.data == ["peap"] and $x["phase2-auth"].data == "mschapv2" and $x["auth-timeout"].data == 8)' +
  ' | select(($c.id.data | utf8) == $ssid)' +
  ' | "\\($c.uuid.data) \\($c.autoconnect.data != false) \\($c.id.data | tojson)"'

var legacyEnterpriseGuardScript =
  "export LC_ALL=C; set -o pipefail; nm=org.freedesktop.NetworkManager;" +
  " up=$(busctl --json=short call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus NameHasOwner s $nm | jq -r '.data[0]') || exit 2;" +
  " [ \"$up\" = true ] || exit 3;" +
  " exec 9<\"${XDG_RUNTIME_DIR:-/tmp}\" && flock -w 30 9 || exit 2;" +
  " say() { printf '{\"kind\":\"%s\",\"ssid\":%s}\\n' \"$1\" \"$name\"; };" +
  " list=$(busctl --json=short call $nm /org/freedesktop/NetworkManager/Settings $nm.Settings ListConnections | jq -r '.data[0][]') || exit 2;" +
  " active=$(nmcli -g UUID connection show --active) || exit 2; rc=0;" +
  " filter='" + legacyProfileFilter + "';" +
  " for p in $list; do" +
  " v=$(busctl --json=short call $nm \"$p\" $nm.Settings.Connection GetSettings | jq -r \"$filter\") || { rc=2; continue; };" +
  " [ -n \"$v\" ] || continue; read -r u auto name <<<\"$v\";" +
  " if [ \"$auto\" = false ]; then say kept; continue; fi; k=paused;" +
  " if printf '%s\\n' \"$active\" | grep -qxF \"$u\"; then k=down; nmcli connection down uuid \"$u\" >/dev/null || k=failed; fi;" +
  " [ $k = failed ] || nmcli connection modify uuid \"$u\" connection.autoconnect no >/dev/null || k=failed;" +
  " say $k; [ $k != failed ] || [ $rc = 2 ] || rc=4; done; exit $rc"

// The guard's output as { fresh: [paused by this run], down: [brought down
// by this run], failed: [could not be paused] }.
function parseGuardOutput(text) {
  var result = { fresh: [], down: [], failed: [] }
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var entry
    try { entry = JSON.parse(lines[i]) } catch (e) { continue }
    if (entry.kind === "failed") result.failed.push(entry.ssid)
    if (entry.kind === "paused" || entry.kind === "down") result.fresh.push(entry.ssid)
    if (entry.kind === "down") result.down.push(entry.ssid)
  }
  return result
}

function networkFailureReason(reason, needsCredentials, reasons) {
  var r = reasons || {}
  if (needsCredentials && reason === r.NoSecrets) return Strings.T("Senha necessária")
  if (needsCredentials && reason === r.WifiAuthTimeout) return Strings.T("Senha incorreta")
  if (reason === r.WifiNetworkLost) return Strings.T("Rede perdida")
  if (reason === r.WifiClientDisconnected) return Strings.T("Desconectado")
  if (reason === r.WifiClientFailed) return Strings.T("Falha na conexão")
  return Strings.T("Não foi possível conectar")
}

// Whether a failed connect should reopen the passphrase prompt. NoSecrets
// means credentials are missing only for a network that actually uses them.
// An auth timeout on such a network means the saved passphrase is wrong (the
// same profile a first failed attempt leaves behind as "known"), so the user
// needs a chance to re-enter it -- connectWithPsk overwrites the stored PSK on
// submit.
function shouldRepromptPassphrase(reason, needsCredentials, reasons) {
  var r = reasons || {}
  if (!needsCredentials) return false
  return reason === r.NoSecrets || reason === r.WifiAuthTimeout
}

if (typeof module !== "undefined") {
  module.exports = {
    parseNetworkStatus: parseNetworkStatus,
    decimal: decimal,
    wifiIconFor: wifiIconFor,
    connectionIcon: connectionIcon,
    formatHeaderSpeed: formatHeaderSpeed,
    formatHeaderFreq: formatHeaderFreq,
    headerDetail: headerDetail,
    bandLabel: bandLabel,
    bandSectionTitle: bandSectionTitle,
    bandTooltip: bandTooltip,
    parseBandStatus: parseBandStatus,
    decodeIwSsid: decodeIwSsid,
    parseKeyValue: parseKeyValue,
    throughputState: throughputState,
    pingLatencyState: pingLatencyState,
    pingPacketLossPercent: pingPacketLossPercent,
    formatPacketLoss: formatPacketLoss,
    formatBytes: formatBytes,
    formatRate: formatRate,
    formatPingLatency: formatPingLatency,
    wifiRow: wifiRow,
    sortWifiRows: sortWifiRows,
    wifiSectionTitle: wifiSectionTitle,
    requiresCredentials: requiresCredentials,
    canForgetNetwork: canForgetNetwork,
    panelConnects: panelConnects,
    profileIsPersonal: profileIsPersonal,
    legacyProfileFilter: legacyProfileFilter,
    legacyEnterpriseGuardScript: legacyEnterpriseGuardScript,
    parseGuardOutput: parseGuardOutput,
    networkFailureReason: networkFailureReason,
    shouldRepromptPassphrase: shouldRepromptPassphrase
  }
}
