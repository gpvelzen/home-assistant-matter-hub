<div align="center">

# Home-Assistant-Matter-Hub

!["Home-Assistant-Matter-Hub"](./docs-site/static/img/hamh-logo-small.png)

**Expose your Home Assistant devices to Matter controllers like Apple Home, Google Home, and Alexa**

[![GitHub Release](https://img.shields.io/github/v/release/RiDDiX/home-assistant-matter-hub?label=stable&color=green)](https://github.com/RiDDiX/home-assistant-matter-hub/releases)
[![GitHub Pre-Release](https://img.shields.io/github/v/release/RiDDiX/home-assistant-matter-hub?include_prereleases&label=alpha&color=orange)](https://github.com/RiDDiX/home-assistant-matter-hub/releases)
[![GitHub Issues](https://img.shields.io/github/issues/RiDDiX/home-assistant-matter-hub)](https://github.com/RiDDiX/home-assistant-matter-hub/issues)
[![GitHub Stars](https://img.shields.io/github/stars/RiDDiX/home-assistant-matter-hub)](https://github.com/RiDDiX/home-assistant-matter-hub/stargazers)
[![License](https://img.shields.io/github/license/RiDDiX/home-assistant-matter-hub)](LICENSE)

[📖 Documentation](https://riddix.github.io/home-assistant-matter-hub) • [� Discord](https://discord.gg/Kubv7sSGyW) • [�🐛 Report Bug](https://github.com/RiDDiX/home-assistant-matter-hub/issues/new?labels=bug) • [💡 Request Feature](https://github.com/RiDDiX/home-assistant-matter-hub/issues/new?labels=enhancement)

</div>

---

> [!NOTE]
> 🔀 **Community Fork** - This is a fork of the original [t0bst4r/home-assistant-matter-hub](https://github.com/t0bst4r/home-assistant-matter-hub), which was discontinued in January 2026. We continue active development with bug fixes, new features, and community support. Thank you **[@t0bst4r](https://github.com/t0bst4r)** for the original work! ❤️
>
> **📦 Migrating?** See [Migration Guide](#migration-from-t0bst4r) - your paired devices will continue to work!

---

## 📝 About

This project simulates bridges to publish your entities from Home Assistant to any Matter-compatible controller like
Alexa, Apple Home or Google Home. Using Matter, those can be connected easily using local communication without the need
of port forwarding etc.

---

## 📦 Releases & Branches

| Channel | Branch | Current Version | Description |
|---------|--------|-----------------|-------------|
| **Stable** | `main` | v2.0.38 | Production-ready, recommended for most users |
| **Alpha** | `alpha` | v2.1.0-alpha.x | Pre-release with new features, for early adopters |
| **Testing** | `testing` | v4.1.0-testing.x | ⚠️ **Highly unstable!** Experimental features, may break |

### Which version should I use?

- **Most users**: Use **Stable** (`main` branch) - thoroughly tested
- **Early adopters**: Use **Alpha** (`alpha` branch) - new features, occasional bugs
- **Developers/Testers**: Use **Testing** (`testing` branch) - bleeding edge, expect breakage

---

## 🎉 What's New

<details>
<summary><strong>📦 Stable Features (v2.0.38)</strong> - Click to expand</summary>

**New in v2.0.38:**

| Feature | Description |
|---------|-------------|
| **🏷️ Per-Entity Identity Overrides** | `customProductName`, `customVendorName`, `customSerialNumber` per entity mapping ([#277](https://github.com/RiDDiX/home-assistant-matter-hub/issues/277), [#290](https://github.com/RiDDiX/home-assistant-matter-hub/issues/290)) |
| **🪟 Garage & Gate Open/Close** | Discrete Open/Close mode for garage and gate covers ([#55](https://github.com/RiDDiX/home-assistant-matter-hub/issues/55)) |
| **🚿 Dishwasher Device Type** | Dishwasher override for switch entities |
| **🚨 Siren Support** | Siren domain as OnOff Plug-in Unit |
| **🏷️ productNameFromNodeLabel Flag** | Report node label as Matter productName for Aqara controllers |
| **🤖 Vacuum Room Progress** | Dynamic room progress tracking via `currentRoomEntity` sensor |
| **⚡ Startup Force Sync** | Immediate force sync on startup to beat stale Alexa queues ([#282](https://github.com/RiDDiX/home-assistant-matter-hub/pull/282)) |
| **🌐 Network Diagnostic API** | mDNS/network diagnostic endpoint with dashboard card |
| **🔌 Energy on Composed Devices** | Energy/power measurement clusters on composed endpoints |
| **🩺 Multi-Admin Fabric Diagnostics** | Per-fabric session info in health API |
| **🩺 Docker HEALTHCHECK** | Native healthcheck in standalone and addon images |
| **🔒 Admin Password Hashing** | Admin password stored hashed, `timingSafeEqual` for lock PIN verification |
| **🧵 Matter.js 0.16.11** | Updated Matter stack |
| **🌍 Polish + Traditional Chinese** | New `pl` and `zh-tw` locales |

**Fix highlights:** vacuum keepalive for Apple Home "Updating…" ([#287](https://github.com/RiDDiX/home-assistant-matter-hub/issues/287)), multi-phase clean progress ([#281](https://github.com/RiDDiX/home-assistant-matter-hub/issues/281)), GenericSwitch single/multi split for Apple Home buttons ([#289](https://github.com/RiDDiX/home-assistant-matter-hub/issues/289)), HA restart attribute guards ([#286](https://github.com/RiDDiX/home-assistant-matter-hub/issues/286)), fan speed restore on turn-on ([#275](https://github.com/RiDDiX/home-assistant-matter-hub/issues/275)), moisture sensor auto-map to HumiditySensor ([#273](https://github.com/RiDDiX/home-assistant-matter-hub/issues/273)), TV speaker override ([#293](https://github.com/RiDDiX/home-assistant-matter-hub/issues/293)), rain + radon sensor auto-mapping, composed sub-endpoint cleanup.

**Previously in v2.0.36:**

| Feature | Description |
|---------|-------------|
| **🏗️ User-Defined Composed Devices** | Create custom composed devices via composedEntities mapping ([#220](https://github.com/RiDDiX/home-assistant-matter-hub/issues/220)) |
| **🔌 Plugin Domain Mappings** | Domain mapping support in plugin API with cloud-mock example |
| **🔋 Valve & Pump Battery** | Battery support for valve and pump endpoints |
| **🌐 German + Russian Translations** | Complete German translation and new Russian language |
| **📡 Session Recovery** | Graceful session close, dead session cleanup, mDNS re-announcement ([#266](https://github.com/RiDDiX/home-assistant-matter-hub/issues/266)) |
| **🔗 Quick Link to Failed Devices** | Dashboard quick link to failed devices ([#270](https://github.com/RiDDiX/home-assistant-matter-hub/issues/270)) |
| **🌡️ Thermostat Fix** | Skip climate.turn_on when already on ([#269](https://github.com/RiDDiX/home-assistant-matter-hub/issues/269)) |
| **🪟 Cover Fix** | Correct stale targetPosition during external movement ([#268](https://github.com/RiDDiX/home-assistant-matter-hub/issues/268)) |
| **🌬️ Air Purifier Fix** | Sub-endpoints for composed air purifier, manual temp/humidity mapping ([#265](https://github.com/RiDDiX/home-assistant-matter-hub/issues/265)) |
| **🔥 Cooling-Only Thermostat Fix** | Prevent HeatingOnly on cooling-only thermostat ([#264](https://github.com/RiDDiX/home-assistant-matter-hub/issues/264)) |
| **↔️ Per-Entity Cover Swap** | Individual coverSwapOpenClose per cover ([#263](https://github.com/RiDDiX/home-assistant-matter-hub/issues/263)) |

</details>

<details>
<summary><strong>🧪 Alpha Features (v2.1.0-alpha.x)</strong> - Click to expand</summary>

**Alpha is currently level with Stable (v2.0.38).** All alpha features from the v2.1.0-alpha.600 line have been promoted into v2.0.38. New alpha work continues from `v2.1.0-alpha.601` onward and will appear here as development progresses.

</details>

<details>
<summary><strong>⚠️ Testing Features (v4.1.0-testing)</strong> - Click to expand</summary>

> [!CAUTION]
> Testing versions are **highly unstable** and intended for developers only!

**🏗️ Vision 1: Callback-based Architecture**

| Old (Legacy) | New (Vision 1) |
|--------------|----------------|
| Behaviors update themselves | Endpoint updates behaviors via `setStateOf()` |
| Behaviors call HA actions directly | Behaviors notify via `notifyEndpoint()` |

**New Callback-Behaviors:** OnOff, LevelControl, Lock, Cover, Fan, ColorControl, VacuumRunMode, VacuumOperationalState

**Updated Endpoints:** Switch, Lock, Cover, Vacuum, Button, Valve, Scene, Humidifier, Light, Fan

</details>

<details>
<summary><strong>📜 Previous Stable Versions</strong> - Click to expand</summary>

### v2.0.37
Aqara productNameFromNodeLabel flag, Matter.js 0.16.11, Swedish locale update

### v2.0.35
HA 2026.3 Clean Area Support, Valetudo Identifier Mapping, Plugin System Hardening, Registry Fingerprint Fix, Roomba Battery Fix, Contact Sensor Fix, Script Momentary Fix, Docusaurus Docs

### v2.0.34
Automatic Backup, Vacuum Battery Auto-Map, Deprecated Feature Flags Fix

### v2.0.33
Endpoint Number Preservation, Binary Sensor Battery Auto-Map

### v2.0.32
Multi-Language Support, Plugin System, New Device Types (PIR, Rain, Electrical, AQ Sensors), Cluster Diagnostics, Dashboard Enhancements, Mapping Profile Export/Import, Fan & Air Purifier Fixes, Stale Session Cleanup, KNX Cover Fix

### v2.0.31
Controller Profiles & Area Setup, Fan Speed/Preset Fix, Optimistic State Fix, Cover Target Fix, Humidity Auto-Mapping Default

### v2.0.30
Mapped Entity Propagation Fix, API Error Surfacing

### v2.0.29
Light currentLevel Fix, Bridge Config Save Fix, Fan Device Feature Fix, Humidity Auto-Mapping Fix

### v2.0.28
Device Image Support, Custom Fan Speed Mapping, TV Source Selection, Reverse Proxy Base Path, On/Off-Only Fans, Light Brightness Fix, Fan Speed Fixes, Composed Air Purifier Fix, Dreame Multi-Floor Fix, Optimistic State Updates, Frontend Improvements

### v2.0.27
Valetudo support, Custom Service Areas, ServiceArea Maps, Vacuum Identify/Locate/Charging, Alarm Control Panel, Composed Air Purifier, Dashboard Controls, Vendor Brand Icons, Thermostat fixes, Air Purifier oscillation/wind

### v2.0.26
Authentication UI, Select entity support, Webhook event bridge, Cluster diagnostics, Matter.js 0.16.10, Docker Node 22, vacuum cleaning mode fallback, vacuum entity filter fix

### v2.0.25
Vacuum mop intensity, vacuum auto-detection, Roborock room auto-detect, live entity mapping, dynamic heap sizing, multi-fabric commissioning, fan speed label fix

### v2.0.24
Dashboard landing page, composed devices, bridge wizard feature flags, entity autocomplete, light transitions, live diagnostics, vacuum suction level, thermostat auto-resume, vacuum docked state, memory leak fix

### v2.0.19–v2.0.23
Bridge templates, live filter preview, entity diagnostics, multi-bridge bulk operations, entity health indicators, diagnostic export, EntityLabel/DeviceLabel filters, Power & Energy Measurement, Event domain (GenericSwitch)

### v2.0.17 / v2.0.18
Room Label (FixedLabel), thermostat overhaul, lock unlatch/unbolt, binary sensor fix, auto pressure mapping, vacuum fixes, dead session recovery, network map, mobile UI, Labels & Areas page, crash resilience, memory limit

### v2.0.16
Force Sync, Lock PIN, Cover/Blinds improvements, Roborock Rooms, Auto Entity Grouping, Water Heater, Vacuum Server Mode, OOM fix

### v1.10.4
Climate/Thermostat fixes, Cover position fix, Vacuum battery, Humidifier improvements, Entity Mapping, Alexa brightness preserve

### v1.9.0
Custom bridge icons, Basic Video Player (TV), Alexa deduplication, Auto-only thermostat, Health Check API, WebSocket, Full backup/restore

### v1.8.x
Graceful crash handler, PM2.5/PM10 sensors, Water Valve, Smoke/CO Detector, Pressure/Flow sensors, Air Purifier, Pump device

### v1.7.x
Dark Mode toggle, Device list sorting

### v1.5.x
Matter Bridge, Multi-Fabric support, Health Monitoring, Bridge Wizard, AirQuality sensors, Fan control, Media playback

</details>

---

## Supported Device Types

| Home Assistant Domain | Matter Device Type | Feature Flags |
|-----------------------|-------------------|---------------|
| `light` | On/Off, Dimmable, Color Temp, Extended Color | `powerEntity`, `energyEntity` |
| `switch`, `input_boolean` | On/Off Plug-in Unit | `powerEntity`, `energyEntity` |
| `lock` | Door Lock | PIN Credentials, Unlatch/Unbolt |
| `cover` | Window Covering | `coverSwapOpenClose` |
| `climate` | Thermostat | Battery via `batteryEntity` |
| `fan` | Fan, Air Purifier | Oscillation, Wind Modes, `filterLifeEntity` |
| `alarm_control_panel` | Mode Select | Arm/Disarm modes |
| `binary_sensor` | Contact, OnOff, Occupancy, Smoke/CO, Water Leak, Water Freeze | |
| `sensor` | Temperature, Humidity, Pressure, Flow, Light, AirQuality | `batteryEntity`, `humidityEntity`, `pressureEntity` |
| `event` | Generic Switch (Doorbell, Button Events) | |
| `button`, `input_button` | Generic Switch | |
| `media_player` | Speaker, Basic Video Player (TV) | |
| `valve` | Water Valve, Pump | |
| `select`, `input_select` | Mode Select | |
| `vacuum` | Robot Vacuum Cleaner | `serverMode`, `roomEntities`, `batteryEntity`, `cleaningModeEntity`, `suctionLevelEntity`, `mopIntensityEntity`, `customServiceAreas`, `vacuumMinimalClusters` |
| `humidifier` | Humidifier/Dehumidifier | |
| `water_heater` | Thermostat (Heating) | |
| `automation`, `script`, `scene` | On/Off Switch | |

> 📖 See [Supported Device Types Documentation](https://riddix.github.io/home-assistant-matter-hub/supported-device-types) for details

---

## 🤖 Robot Vacuum Server Mode

<details>
<summary><strong>⚠️ Important: Apple Home & Alexa require Server Mode for Robot Vacuums</strong> (click to expand)</summary>

### The Problem

Apple Home and Alexa **do not properly support bridged robot vacuums**. When your vacuum is exposed through a standard Matter bridge, you may experience:

- **Apple Home**: "Updating" status, Siri commands don't work, room selection fails
- **Alexa**: Vacuum is not discovered at all

This is because these platforms expect robot vacuums to be **standalone Matter devices**, not bridged devices.

### The Solution: Server Mode

**Server Mode** exposes your vacuum as a standalone Matter device without the bridge wrapper. This makes it fully compatible with Apple Home and Alexa.

### Setup Instructions

1. **Create a new bridge** in the Matter Hub web interface
2. **Enable "Server Mode"** checkbox in the bridge creation wizard
3. Add **only your vacuum** to this bridge
4. **Pair the new Server Mode bridge** with Apple Home or Alexa
5. Your other devices stay on your regular bridge(s)

### Important Notes

- Server Mode bridges support **exactly one device**
- Your vacuum needs its own dedicated Server Mode bridge
- Other device types (lights, switches, sensors) work fine on regular bridges
- After switching to Server Mode, Siri commands like "Hey Siri, start the vacuum" will work

### Documentation

For more details, see the [Robot Vacuum Documentation](https://riddix.github.io/home-assistant-matter-hub/devices/robot-vacuum).

</details>

---

## Installation

### Home Assistant Add-on (Recommended)

[![Open your Home Assistant instance and show the dashboard of an app.](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_addon/?addon=3fd9e6b0_hamh&repository_url=https%3A%2F%2Fgithub.com%2Friddix%2Fhome-assistant-addons)

### Manual steps (testing versions, etc.)
Add this repository to your Add-on Store:

```
https://github.com/RiDDiX/home-assistant-addons
```

Two add-ons are available:
- **Home-Assistant-Matter-Hub** - Stable release
- **Home-Assistant-Matter-Hub (Alpha)** - Pre-release for testing

### Docker

```bash
docker run -d \
  --name home-assistant-matter-hub \
  --network host \
  -v /path/to/data:/data \
  -e HAMH_HOME_ASSISTANT_URL=http://192.168.178.123:8123 \
  -e HAMH_HOME_ASSISTANT_ACCESS_TOKEN=your_long_lived_access_token \
  ghcr.io/riddix/home-assistant-matter-hub:latest
```

> **Note:** All environment variables require the `HAMH_` prefix.
> See the [Installation Guide](https://riddix.github.io/home-assistant-matter-hub/getting-started/installation) for all available options.

For alpha versions, use tag `alpha` instead of `latest`.

---

## Documentation

Please see the [documentation](https://riddix.github.io/home-assistant-matter-hub) for detailed installation instructions,
configuration options, known issues, limitations and guides.

---

## 🔧 Network Troubleshooting

<details>
<summary><strong>⚠️ "No Response" / Connection Drops — Common Network Causes</strong> (click to expand)</summary>

### The Problem

Your Matter devices suddenly show **"No Response"** (Apple Home), **"Unavailable"** (Google Home), or become **unresponsive** after some time — even though the bridge is still running and other controllers (e.g., Alexa) continue to work fine.

### Root Cause: Network Equipment Blocking mDNS/Multicast

Matter relies heavily on **mDNS (multicast DNS)** for device discovery and reachability. Many routers, access points, and managed switches have features that **filter, throttle, or block multicast traffic** — which breaks Matter communication silently.

> **💡 This was confirmed and documented thanks to the excellent systematic testing by [@omerfaruk-aran](https://github.com/omerfaruk-aran) in [#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129).** The issue was traced to a TP-Link Archer AX50 (in AP mode) sitting between the Apple TV and the network — its default settings were blocking/limiting mDNS/Bonjour traffic over time.

### What to Check on Your Network Equipment

1. **IGMP Snooping** — Disable or configure it to allow mDNS (`224.0.0.251` / `ff02::fb`)
2. **Multicast Optimization / Multicast Enhancement** — Disable (often called "Airtime Fairness" or "Multicast to Unicast")
3. **AP Isolation / Client Isolation** — Must be **disabled** so devices on the same network can communicate
4. **mDNS / Bonjour Forwarding** — Enable if available (some enterprise APs have this)
5. **DHCP Server on secondary devices** — Disable DHCP on access points / switches that are NOT your main router (multiple DHCP servers cause IP conflicts)
6. **Firmware Updates** — Update your router/AP firmware, as multicast handling is frequently improved

### Affected Equipment (Known Cases)

| Device | Issue | Fix |
|--------|-------|-----|
| **TP-Link Archer AX50** (AP mode) | mDNS traffic blocked/limited over time | Firmware update + disable DHCP on the AP |
| **Ubiquiti UniFi APs** | IGMP Snooping can filter mDNS | Disable IGMP Snooping or enable mDNS Reflector |
| **Managed Switches** (various) | Multicast filtering enabled by default | Allow mDNS multicast groups |

### Quick Diagnostic Steps

1. **Does Alexa still work when Apple Home shows "No Response"?**
   - **Yes** → Bridge is online, the issue is network path / mDNS related
   - **No** → Bridge may actually be down, check HAMH logs

2. **Does removing a Home Hub (HomePod/Apple TV) fix it?**
   - **Yes** → The hub's network path is affected (AP/switch between hub and bridge)
   - **No** → May be a different issue

3. **Try binding mDNS to a specific interface:**
   ```
   --mdns-network-interface eth0
   ```
   (or `end0`, `enp0s18`, etc. — check your system)

### Network Topology Tips

- **Keep the path simple**: Avoid placing access points or managed switches between your Matter bridge (Home Assistant) and your Home Hub (HomePod/Apple TV)
- **Use wired connections** where possible for Home Hubs and the Home Assistant host
- **Same subnet**: All Matter devices, controllers, and the bridge must be on the same Layer 2 network / subnet
- **IPv6**: Matter requires IPv6 — do not disable it. For VLAN setups, configure **ULA addresses** (`fd00::/8`), not just link-local (`fe80::`). See [Troubleshooting](https://home-assistant-matter-hub.riddix.dev/guides/connectivity-issues#ipv6) and [Discussion #39](https://github.com/RiDDiX/home-assistant-matter-hub/discussions/39)

</details>

---

## Migration from t0bst4r

Migrating from the original `t0bst4r/home-assistant-matter-hub` is straightforward. **Your Matter fabric connections and paired devices will be preserved!**

### Home Assistant Add-on

1. **Backup your data:**
   ```bash
   cp -r /addon_configs/*_hamh /config/hamh-backup
   # Verify the backup was copied correctly
   ls /config/hamh-backup
   ```

2. **Uninstall the old add-on** (Settings → Add-ons → Uninstall) and make sure the old folder is removed:
   ```bash
   rm -rf /addon_configs/*_hamh
   ```

3. **Add the new repository:**
   ```
   https://github.com/RiDDiX/home-assistant-addons
   ```

4. **Install and start the new add-on once** (creates the data folder), then **stop it**

5. **Clear the new folder and restore your backup:**
   ```bash
   rm -rf /addon_configs/*_hamh/*
   cp -r /config/hamh-backup/* /addon_configs/*_hamh/
   ```

6. **Start the add-on again** - your devices should reconnect automatically

### Docker / Docker Compose

Simply change the image from:
```
ghcr.io/t0bst4r/home-assistant-matter-hub:latest
```
to:
```
ghcr.io/riddix/home-assistant-matter-hub:latest
```

Your volume mounts stay the same - no data migration needed.

> For detailed instructions, see the [full Migration Guide](https://riddix.github.io/home-assistant-matter-hub/migration-from-t0bst4r/).

---

## 🙏 Contributors & Acknowledgments

This project thrives thanks to the amazing community! Special thanks to everyone who contributes by reporting bugs, suggesting features, and helping others.

### 🏆 Top Contributors

| Contributor | Contributions |
|-------------|---------------|
| [@codyc1515](https://github.com/codyc1515) | 🥇 **Top Reporter** - Climate/thermostat bugs (#52, #24, #21, #20), extensive testing feedback |
| [@Hatton920](https://github.com/Hatton920) | 🤖 **Vacuum Expert** - Intensive testing of Robot Vacuum Server Mode, Apple Home & Siri validation |
| [@Chrulf](https://github.com/Chrulf) | 🔍 Google Home brightness debugging (#41), detailed logs & testing |
| [@SH1FT-W](https://github.com/SH1FT-W) | 💎 **Sponsor** + Vacuum room selection feature request (#49) |
| [@depahk](https://github.com/depahk) | 📝 Migration documentation fix ([#32](https://github.com/RiDDiX/home-assistant-matter-hub/pull/32)) |
| [@Fettkeewl](https://github.com/Fettkeewl) | 🐛 Script import bug (#26), Alias feature request (#25) |
| [@razzietheman](https://github.com/razzietheman) | 🥈 **Active Tester** - Bridge icons (#101), sorting (#80), feature requests (#31, #30), extensive UI/UX feedback |
| [@markgaze](https://github.com/markgaze) | 🤖 **Code Contributor** - Ecovacs Deebot room support ([#118](https://github.com/RiDDiX/home-assistant-matter-hub/pull/118)) |
| [@omerfaruk-aran](https://github.com/omerfaruk-aran) | 🔧 **Network Debugging Expert** - Systematic mDNS/multicast root cause analysis for "No Response" issues ([#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129)) |
| [@gustavakerstrom](https://github.com/gustavakerstrom) | 🤖 **Code Contributor** - Template description display fix ([#215](https://github.com/RiDDiX/home-assistant-matter-hub/pull/215)) |
| [@aetasoul](https://github.com/aetasoul) | 🤖 **Code Contributor** - Immediate force sync on startup to beat stale Alexa queues ([#282](https://github.com/RiDDiX/home-assistant-matter-hub/pull/282)) |

<details>
<summary><strong>📋 Issue Tracker - All Contributors</strong> (click to expand)</summary>

Thank you to everyone who helps improve this project by reporting issues!

| User | Issues |
|------|--------|
| [@omerfaruk-aran](https://github.com/omerfaruk-aran) | #129 |
| [@markgaze](https://github.com/markgaze) | #118 |
| [@BlairC1](https://github.com/BlairC1) | #117 |
| [@Giamp96](https://github.com/Giamp96) | #116 |
| [@NdR91](https://github.com/NdR91) | #115 #106 |
| [@Fry7](https://github.com/Fry7) | #114 |
| [@siobhanellis](https://github.com/siobhanellis) | #112 |
| [@Hatton920](https://github.com/Hatton920) | #110 |
| [@gette](https://github.com/gette) | #95 |
| [@400HPMustang](https://github.com/400HPMustang) | #103 |
| [@vandir](https://github.com/vandir) | #102 |
| [@razzietheman](https://github.com/razzietheman) | #101 #100 #80 #31 #30 |
| [@seitenprofi](https://github.com/seitenprofi) | #176 |
| [@semonR](https://github.com/semonR) | #99 #58 |
| [@italoc](https://github.com/italoc) | #78 |
| [@marksev1](https://github.com/marksev1) | #62 |
| [@smacpi](https://github.com/smacpi) | #60 |
| [@mrbluebrett](https://github.com/mrbluebrett) | #53 |
| [@anpak](https://github.com/anpak) | #45 |
| [@alondin](https://github.com/alondin) | #43 |
| [@Chrulf](https://github.com/Chrulf) | #41 |
| [@Weske90](https://github.com/Weske90) | #40 |
| [@didiht](https://github.com/didiht) | #37 |
| [@Dixiland20](https://github.com/Dixiland20) | #34 |
| [@chromaxx7](https://github.com/chromaxx7) | #29 |
| [@Tomyk9991](https://github.com/Tomyk9991) | #28 |
| [@datvista](https://github.com/datvista) | #27 |
| [@bwynants](https://github.com/bwynants) | #23 |
| [@Pozzi831](https://github.com/Pozzi831) | #22 |
| [@codyc1515](https://github.com/codyc1515) | #52 #24 #21 #20 |

</details>

### 💖 Sponsors

> **Donations are completely voluntary!** This project exists because of passion for open source, not money. Thank you to everyone who has supported it — it truly means a lot! ❤️

🥇 **First Sponsor:** [@thorsten-gehrig](https://github.com/thorsten-gehrig)

| | | |
|---|---|---|
| 💎 [@SH1FT-W](https://github.com/SH1FT-W) | 💎 [@ilGaspa](https://github.com/ilGaspa) | 💎 [@linux4life798](https://github.com/linux4life798) |
| 💎 [@torandreroland](https://github.com/torandreroland) | 💎 [@ralondo](https://github.com/ralondo) | 💎 [@bexxter85-ux](https://github.com/bexxter85-ux) |
| 💎 [@dinariox](https://github.com/dinariox) | 💎 [@JRCondat](https://github.com/JRCondat) | 💎 [@d3rby91](https://github.com/d3rby91) |
| 💎 [@nicoodeimos](https://github.com/nicoodeimos) | 💎 [@ustari28](https://github.com/ustari28) | 💎 Markus Müller ([@Dingosworld](https://github.com/Dingosworld)) |
| 💎 StefanS | 💎 Manny B. | 💎 Bonjon |
| 💎 TobiR | 💎 Franz Huber | 💎 Michele Larese de Prata |
| 💎 [@CNCB](https://github.com/CNCB) | 💎 [@pelican1997](https://github.com/pelican1997) | 💎 [@PeJanNL](https://github.com/PeJanNL) |
| 💎 [@bra1nbuster](https://github.com/bra1nbuster) | 💎 [@knuti1960](https://github.com/knuti1960) | 💎 [@ppttu](https://github.com/ppttu) |

🙏 *...and anonymous supporters who prefer not to be named.*

### 🌟 Original Author

- **[@t0bst4r](https://github.com/t0bst4r)** - Creator of the original Home-Assistant-Matter-Hub project

---

## ☕ Support the Project

> [!NOTE]
> **Completely optional!** This project will continue regardless of donations.
> I maintain this in my free time because I believe in open source.

If you find this project useful, consider supporting its development:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-Donate-ea4aaa?logo=githubsponsors&style=for-the-badge)](https://github.com/sponsors/RiDDiX)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Donate-ff5e5b?logo=kofi&logoColor=white&style=for-the-badge)](https://ko-fi.com/riddix)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-blue?logo=paypal&style=for-the-badge)](https://www.paypal.me/RiDDiX93)

Your support helps cover hosting costs and motivates continued development. Thank you! ❤️

---

## 📊 Project Stats

<div align="center">

![GitHub commit activity](https://img.shields.io/github/commit-activity/m/RiDDiX/home-assistant-matter-hub)
![GitHub last commit](https://img.shields.io/github/last-commit/RiDDiX/home-assistant-matter-hub)
![GitHub issues](https://img.shields.io/github/issues/RiDDiX/home-assistant-matter-hub)
![GitHub closed issues](https://img.shields.io/github/issues-closed/RiDDiX/home-assistant-matter-hub)
![GitHub pull requests](https://img.shields.io/github/issues-pr/RiDDiX/home-assistant-matter-hub)

</div>

---
