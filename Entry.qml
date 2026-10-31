import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// Bar entry point. The widget (or the panel it opens) is drawn with Island
// Kit, imported by path, so without the Kit it cannot load and the plugin
// would just vanish from the bar, or show a button that opens nothing. This file imports nothing from the Kit: it
// checks the Kit is there, loads the real widget, and otherwise shows a small
// "Install Island Kit" button that installs it and restarts the shell.
BarWidget {
  id: root

  // The real widget, next to this file.
  readonly property string widgetFile: "Panel.qml"
  readonly property string kitId: "io.github.hugorolimf.kit"
  readonly property string kitUrl: "https://github.com/hugorolimf/omarchy-island-kit"

  // The loaded widget. Island Bar reads the widget's own state through it.
  readonly property var inner: widgetLoader.item

  // Can the Kit be imported the way the widget imports it? A missing import
  // directory is no error by itself, only the first type from it is, so the
  // probe names the Kit's Panel (compiled, never created). Checked once:
  // installing the Kit restarts the shell anyway.
  readonly property bool kitPresent: {
    try {
      var probe = Qt.createQmlObject('import QtQuick\nimport "../' + kitId + '/ui"\n'
        + 'QtObject { property Component probe: Component { Panel {} } }',
        root, Qt.resolvedUrl("KitProbe.qml"))
      probe.destroy()
      return true
    } catch (e) {
      return false
    }
  }
  // Kit missing, or there but the widget still failed (a Kit too old for it).
  readonly property bool needsKit: !kitPresent || widgetLoader.status === Loader.Error
  readonly property bool portuguese: Qt.locale().name.indexOf("pt") === 0
  property string kitState: "idle"  // "idle" | "busy" | "failed"
  // The install's progress bar, 0..1. omarchy plugin add tells no percentage,
  // so it eases most of the way while the Kit downloads, then fills at the end.
  property real kitProgress: 0
  NumberAnimation {
    id: progressCreep
    target: root; property: "kitProgress"
    to: 0.9; duration: 14000; easing.type: Easing.OutCubic
  }
  NumberAnimation {
    id: progressFill
    target: root; property: "kitProgress"
    to: 1; duration: 260; easing.type: Easing.OutCubic
  }

  // Shape contract for shell.summon/hide/toggle (Bar.findPanelWidget) and the
  // popout coordinator, for bars that only see this item. `opened` stays
  // undefined without the widget, so the fallback is not taken for a panel.
  readonly property var opened: inner ? inner.opened === true : undefined
  readonly property bool popoutSwitchClosing: inner ? inner.popoutSwitchClosing === true : false
  readonly property real openPanelIndicatorWidth: inner && inner.openPanelIndicatorWidth > 0 ? inner.openPanelIndicatorWidth : 0
  readonly property real openPanelIndicatorHeight: inner && inner.openPanelIndicatorHeight > 0 ? inner.openPanelIndicatorHeight : 0
  function open() { if (inner && typeof inner.open === "function") inner.open() }
  function close() { if (inner && typeof inner.close === "function") inner.close() }
  function toggle() { if (inner && typeof inner.toggle === "function") inner.toggle() }
  function closeForPopoutSwitch() {
    if (inner && typeof inner.closeForPopoutSwitch === "function") inner.closeForPopoutSwitch()
    else close()
  }

  // Island Bar presses a module through triggerPress; only the fallback
  // button takes it, the widget keeps its own buttons.
  readonly property bool pressable: needsKit
  function triggerPress(button) { if (needsKit) installKit() }

  // The widget hides itself (no battery, no location yet) through its own
  // `visible`. Reading that back into this item's `visible` would loop (an
  // item reads invisible while its parent is), so this item stays visible and
  // takes no room instead.
  implicitWidth: inner ? (inner.visible ? inner.implicitWidth : 0) : (needsKit ? fallback.implicitWidth : 0)
  implicitHeight: inner ? (inner.visible ? inner.implicitHeight : 0) : (needsKit ? fallback.implicitHeight : 0)

  // What the bar injects here goes on to the widget. Only once the bar has
  // injected something, so the defaults never overwrite a value the bar
  // gave the widget directly.
  function injectInner() {
    var target = inner
    if (!target || !root.bar) return
    if ("bar" in target) target.bar = root.bar
    if ("moduleName" in target && root.moduleName !== "") target.moduleName = root.moduleName
    if ("settings" in target) target.settings = root.settings
  }
  onBarChanged: injectInner()
  onModuleNameChanged: injectInner()
  onSettingsChanged: injectInner()

  // Enterprise Wi-Fi profiles saved by the earlier setup authenticate no
  // server, and NetworkManager would auto-connect them before anyone opens
  // the panel. The guard (Model.legacyEnterpriseGuardScript) stops that as
  // soon as the plugin loads -- here, so it runs with or without the Kit --
  // and again whenever the panel opens, and keeps trying every minute until
  // it completes.
  property bool guardAgain: false
  property var notifiedPaused: []
  property var notifiedFailed: []
  property bool notifiedUnchecked: false
  onOpenedChanged: if (opened === true) runGuard()
  Component.onCompleted: runGuard()

  function runGuard() {
    if (guardProc.running) { guardAgain = true; return }
    guardProc.running = true
  }

  Process {
    id: guardProc
    command: ["bash", "-c", Model.legacyEnterpriseGuardScript, "nmcli-eap-guard"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.guardFinished(Model.parseGuardOutput(text))
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) console.warn(root.moduleName + ": could not check the saved enterprise Wi-Fi profiles (" + exitCode + ")")
      guardRetry.running = exitCode !== 0
      if (exitCode === 2) root.notifyUnchecked()
      if (exitCode === 0) root.notifiedUnchecked = false
      if (root.guardAgain) {
        root.guardAgain = false
        root.runGuard()
      }
    }
  }

  Timer {
    id: guardRetry
    interval: 60000
    repeat: false
    onTriggered: root.runGuard()
  }

  function notifyUnchecked() {
    if (notifiedUnchecked) return
    notifiedUnchecked = true
    notify(portuguese ? "Wi-Fi corporativo não verificado" : "Enterprise Wi-Fi not checked",
      portuguese ? "Não foi possível ler os perfis salvos para pausar os que não conferem o servidor. Tentando de novo a cada minuto."
                 : "The saved profiles could not be read to pause those that don't check the server. Trying again every minute.")
  }

  // Says once per network what changed and how to get it back; a network
  // that could not be paused is named too, it still auto-connects.
  function guardFinished(result) {
    var fresh = result.fresh.filter(function(ssid) { return notifiedPaused.indexOf(ssid) < 0 })
    var failed = result.failed.filter(function(ssid) { return notifiedFailed.indexOf(ssid) < 0 })
    notifiedPaused = notifiedPaused.concat(fresh)
    notifiedFailed = notifiedFailed.concat(failed)
    var pt = portuguese
    if (fresh.length > 0) {
      var down = result.down.filter(function(ssid) { return fresh.indexOf(ssid) >= 0 }).length > 0
      notify(pt ? "Wi-Fi corporativo: conexão automática pausada" : "Enterprise Wi-Fi: auto-connect paused",
        pt ? fresh.join(", ") + ": o perfil salvo não confere o servidor da rede, então não conecta mais sozinho"
             + (down ? " e a conexão atual foi encerrada" : "")
             + ". Para voltar, configure a rede no nmtui com o certificado e o domínio do servidor."
           : fresh.join(", ") + ": the saved profile doesn't check the network's server, so it no longer connects on its own"
             + (down ? " and the current connection was closed" : "")
             + ". To get it back, set the network up in nmtui with the server's certificate and domain.")
    }
    if (failed.length > 0) {
      notify(pt ? "Wi-Fi corporativo sem proteção" : "Unprotected enterprise Wi-Fi",
        pt ? failed.join(", ") + ": o perfil salvo não confere o servidor e não foi possível pausar a conexão automática. Configure a rede no nmtui com o certificado e o domínio do servidor, ou esqueça a rede."
           : failed.join(", ") + ": the saved profile doesn't check the server and its auto-connect could not be paused. Set the network up in nmtui with the server's certificate and domain, or forget the network.")
    }
  }

  function notify(title, body) {
    Quickshell.execDetached(["notify-send", "-a", "Island Network", "-i", "network-wireless", "--", title, body])
  }

  Loader {
    id: widgetLoader
    anchors.fill: parent
    // Only once the bar is here: widgets read root.bar while they build.
    active: root.kitPresent && !!root.bar
    source: Qt.resolvedUrl(root.widgetFile)
    onLoaded: {
      root.injectInner()
    }
  }

  // Kit missing: add it; Kit there but the widget failed: update it. Then a
  // shell restart loads the widget for real (a failed import stays cached).
  function installKit() {
    if (kitState === "busy") return
    kitState = "busy"
    kitProgress = 0
    progressFill.stop()
    progressCreep.restart()
    kitProc.command = root.kitPresent
      ? ["omarchy", "plugin", "update", root.kitId, "--yes"]
      : ["omarchy", "plugin", "add", root.kitUrl, "--yes"]
    kitProc.running = true
  }

  Process {
    id: kitProc
    stderr: StdioCollector { id: kitErr }
    onExited: function(exitCode) {
      progressCreep.stop()
      if (exitCode === 0) {
        // The bar fills, then the shell restarts and loads the widget for real.
        progressFill.restart()
        restartDelay.restart()
      } else {
        console.warn(root.moduleName + ": installing Island Kit failed: " + kitErr.text)
        root.kitState = "failed"
      }
    }
  }

  Timer {
    id: restartDelay
    interval: 450
    onTriggered: {
      Quickshell.execDetached(["omarchy-restart-shell"])
    }
  }

  Rectangle {
    id: fallback
    visible: root.needsKit
    anchors.centerIn: parent
    readonly property color ink: root.bar && root.bar.barForeground ? root.bar.barForeground : Commons.Color.foreground
    readonly property string label: {
      if (root.vertical) return "Kit"
      if (root.kitState === "busy") return root.portuguese ? "Instalando o Island Kit…" : "Installing Island Kit…"
      if (root.kitState === "failed") return root.portuguese ? "Falhou · tentar de novo" : "Failed · try again"
      if (root.kitPresent) return root.portuguese ? "Atualize o Island Kit" : "Update Island Kit"
      return root.portuguese ? "Instale o Island Kit" : "Install Island Kit"
    }
    implicitWidth: fallbackText.implicitWidth + 16
    implicitHeight: Math.max(fallbackText.implicitHeight + 6, 20)
    radius: height / 2
    color: Qt.rgba(ink.r, ink.g, ink.b, mouse.containsMouse ? 0.18 : 0.10)
    border.width: 1
    border.color: Qt.rgba(ink.r, ink.g, ink.b, 0.35)
    clip: true

    // Fills while the Kit installs; stays put, red, if it failed.
    Rectangle {
      anchors.left: parent.left
      anchors.top: parent.top
      anchors.bottom: parent.bottom
      width: parent.width * root.kitProgress
      radius: parent.radius
      visible: root.kitState !== "idle"
      color: root.kitState === "failed" ? Qt.rgba(0.94, 0.33, 0.31, 0.35) : Qt.rgba(0.36, 0.55, 0.98, 0.45)
      Behavior on color { ColorAnimation { duration: 200 } }
    }

    Text {
      id: fallbackText
      anchors.centerIn: parent
      text: fallback.label
      color: fallback.ink
      font.family: Commons.Style.font.family
      font.pixelSize: Commons.Style.font.bodySmall
    }

    MouseArea {
      id: mouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: root.installKit()
    }
  }
}
