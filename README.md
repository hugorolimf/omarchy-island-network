<div align="center">

# Island Network

**Omarchy's Network panel, in the Island look.**
Wi‑Fi list, connection state, DNS provider and Wi‑Fi band, drawn with thin stroke icons and a dark anatomy panel that opens right under its icon.

![Island Network](preview.png)

</div>

## Why this one

- ✏️ **The Island look.** Same stroke icons as [Island Bar](https://github.com/hugorolimf/omarchy-bar),
  colour only when it means something, one easing curve for every transition.
- 🧭 **Opens under its icon**, with the keyboard: Esc closes, Tab moves to the next panel.
- 🌍 **English or Portuguese**, following your system language.
- 🔒 **Enterprise Wi‑Fi stays with the system.** The panel connects personal networks only.
  Picking a WPA‑Enterprise network opens `nmtui`, the system's own tool, where you set its
  certificate and server domain. Saved profiles that check no server stop connecting on
  their own: see [Enterprise Wi‑Fi profiles](#enterprise-wi-fi-profiles).
- 🔄 **Drop-in.** It's Omarchy's own `omarchy.network` underneath (same behaviour, same
  shortcuts and IPC): enabling it takes the original's place on the bar.

## See it

Recorded on a real desktop, mouse included. The panel follows the system language;
this take is in Portuguese.

**Connection, live traffic, DNS and the networks around**, opened from the bar.

![Network panel](assets/network.gif)

## Requirements

[Island Kit](https://github.com/hugorolimf/omarchy-island-kit): the panel is drawn with it.
Install the Kit first, or install this panel from the Kit's catalog.
Without the Kit, the plugin shows an "Install Island Kit" button on the bar
(in Portuguese, "Instale o Island Kit"); clicking it installs the Kit and
restarts the shell.

## Install

```bash
omarchy plugin add https://github.com/hugorolimf/omarchy-island-kit --enable
omarchy plugin add https://github.com/hugorolimf/omarchy-island-network --enable
```

## Enterprise Wi‑Fi profiles

- **The panel doesn't create or start enterprise (802.1X) connections.** Those networks,
  any security type it doesn't recognise and any saved profile that isn't personal
  (whatever its access point advertises) open `nmtui`.
- **Profiles saved by the earlier setup** (this plugin before 1.0.2, and Omarchy's own
  network panel) check no server: PEAP/MSCHAPv2, auth timeout 8 s, named after the SSID,
  no CA, no domain. NetworkManager would auto-connect them on its own, so when the plugin
  loads it turns their auto-connect off (`connection.autoconnect no`) and, if one is
  connected at that moment, disconnects it, then says so in a notification. That setting
  is the only change; the profile and its password stay. Profiles of any other shape are
  left alone. If the profiles can't be read, it says so and tries again every minute.
- It reads the profiles over D-Bus, so it needs `busctl` (systemd) and `jq`; Omarchy has both.
- To get a paused network back, open it in `nmtui`, set its CA certificate and domain, and
  turn on "Automatically connect". Turning auto-connect back on without them doesn't last:
  the profile still matches, so it is paused again.

## Remove

```bash
omarchy plugin remove io.github.hugorolimf.network
```

Omarchy's own network panel comes back to the bar.

## Credits

A clone of Omarchy's `omarchy.network` panel by David Heinemeier Hansson and the
[Omarchy](https://github.com/basecamp/omarchy) contributors (MIT); the look, icons and the
Portuguese wording are this plugin's.

## The other Island panels

[Island Sound](https://github.com/hugorolimf/omarchy-island-audio) · [Island Bluetooth](https://github.com/hugorolimf/omarchy-island-bluetooth) · [Island Network](https://github.com/hugorolimf/omarchy-island-network) · [Island Power](https://github.com/hugorolimf/omarchy-island-power) · [Island Display](https://github.com/hugorolimf/omarchy-island-display) · [Island Weather](https://github.com/hugorolimf/omarchy-island-weather)

## License

[MIT](LICENSE)
