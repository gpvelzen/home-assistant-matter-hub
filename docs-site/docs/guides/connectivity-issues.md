# Troubleshooting for Network and Hub Connectivity Issues

If you're experiencing connectivity issues with your Matter Hub and voice assistants like Apple Home, Google Home, or
Alexa, follow this guide to address common problems.

## 1. Network Configuration and Firewall Settings

### IPv6

- Ensure **IPv6** is properly configured across your router, host, docker, and (if used) virtual machines. Misconfigured
  IPv6 settings can lead to connectivity issues.

### Firewall & VLAN

UDP, including mDNS, is typically not routed across segmented networks. To ensure proper functionality, UDP traffic must
flow freely between all network segments, and IPv6 must be fully operational across your network.

- Avoid VLAN configurations that may segment your network and isolate devices from each other. Ensure all devices,
  including your mobile device during the pairing process, are on the same network segment for seamless communication.
- If VLAN segmentation is unavoidable:
  - **Ports**: Verify that required ports (e.g., **5353, 5540, 5541** - TCP & UDP) are open and correctly routed.
  - **mDNS Forwarding**: Enable mDNS forwarding to allow communication between devices on different network segments.
  - **Firewall**: Ensure your firewall allows the necessary ports. Temporarily disable the firewall to determine if it
    is causing connectivity issues.

### IGMP Snooping

If not configured properly, IGMP Snooping may cause the suppression of mDNS messages. 
For this reason, it is recommended to disable it on networking devices such as switches and, if applicable, Hypervisors & Access Points.

## 2. Network Equipment Blocking mDNS/Multicast

Many routers, access points, and managed switches have features that **filter, throttle, or block multicast traffic by default** — which silently breaks Matter communication. This is one of the most common causes of intermittent "No Response" or connection drops.

> **💡 Community finding:** This was confirmed through systematic testing by [@omerfaruk-aran](https://github.com/omerfaruk-aran) in [#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129). The issue was traced to a TP-Link Archer AX50 (in AP mode) blocking mDNS/Bonjour traffic over time, causing Apple Home to lose reachability while Alexa continued to work fine.

### Symptoms

- Devices show **"No Response"** in Apple Home after some time (minutes to hours)
- Other controllers (e.g., Alexa) **continue to work** during the failure
- The HAMH bridge UI remains online and shows "Running"
- Removing/rebooting a Home Hub (HomePod/Apple TV) temporarily fixes it
- Problem returns after idle periods

### What to Check

| Setting | Action | Why |
|---------|--------|-----|
| **IGMP Snooping** | Disable or allow mDNS groups (`224.0.0.251` / `ff02::fb`) | Can silently filter mDNS multicast |
| **Multicast Optimization** | Disable (also called "Airtime Fairness" or "Multicast to Unicast") | Converts multicast to unicast, breaking mDNS |
| **AP Isolation / Client Isolation** | Must be **disabled** | Prevents devices on the same network from communicating |
| **mDNS / Bonjour Forwarding** | Enable if available | Some enterprise APs require explicit mDNS forwarding |
| **DHCP Server on APs** | Disable on all devices except your main router | Multiple DHCP servers cause IP conflicts and routing issues |
| **Firmware** | Update to latest | Multicast handling is frequently improved in firmware updates |

### Known Affected Equipment

| Device | Issue | Fix |
|--------|-------|-----|
| **TP-Link Archer AX50** (AP mode) | mDNS traffic blocked/limited over time | Firmware update + disable DHCP on the AP ([#129](https://github.com/RiDDiX/home-assistant-matter-hub/issues/129)) |
| **Ubiquiti UniFi APs** | IGMP Snooping can filter mDNS | Disable IGMP Snooping or enable mDNS Reflector |
| **Managed Switches** (various) | Multicast filtering enabled by default | Allow mDNS multicast groups |
| **Mesh Wi-Fi systems** | Some implementations isolate multicast between nodes | Check for multicast/mDNS settings, consider wired backhaul |

### mDNS Network Interface Binding

If your host has multiple network interfaces (e.g., `eth0`, `wlan0`, Docker bridges), Matter.js may advertise on the wrong interface. You can bind mDNS to a specific interface:

**Add-on configuration:**
```
--mdns-network-interface eth0
```

Common interface names:
- `eth0`, `end0`, `enp0s18` — Wired Ethernet
- `wlan0` — Wi-Fi
- Check with `ip addr` or `ifconfig` on your host

### Network Topology Best Practices

- **Keep the path simple**: Avoid placing access points or managed switches between your Matter bridge (Home Assistant) and your Home Hub (HomePod/Apple TV)
- **Use wired connections** where possible for Home Hubs and the Home Assistant host
- **Same subnet**: All Matter devices, controllers, and the bridge **must** be on the same Layer 2 network / subnet
- **IPv6 enabled**: Matter uses IPv6 link-local addresses — do not disable IPv6

## 3. Ecosystem and Device Compatibility / Requirements

### Apple Home

- **Home Hub Required**: Apple Home requires a **HomePod** (mini) or **Apple TV** as a Home Hub to maintain persistent Matter connections. Without a hub, the iPhone only maintains the connection while the Home app is active.
- **"No Response" after adding a Home Hub**: If devices become unresponsive after adding a HomePod or Apple TV, this is almost always a network issue — see [Section 2](#2-network-equipment-blocking-mdnsmulticast) above.
- **"Updating" status for Robot Vacuums**: Apple Home requires robot vacuums to be exposed as standalone devices, not bridged. Enable **Server Mode** — see [Robot Vacuum Documentation](../Devices/Robot%20Vacuum.md).
- **Phone reboot as a quick fix**: If Apple Home shows "No Response" but Alexa works fine, rebooting your iPhone/iPad can force Apple Home to re-establish subscriptions as a temporary workaround.
- **Apple TV vs. HomePod mini**: Apple TV (4K) generally handles larger bridges better than HomePod mini due to more CPU/RAM. If you have many devices, prefer Apple TV as your primary Home Hub.

### Alexa

- **Device Limitations**: Alexa cannot pair with a bridge if too many devices (around 80-100) are already attached.
  Remove unused devices to resolve this limitation.
- **Amazon Device Requirement**: Ensure at least one Amazon device supporting Matter is connected. Third-party
  Alexa-enabled devices (e.g. like Sonos) are insufficient for pairing with Matter devices.

### Google Home

- **Matter Hub Requirements**: Google Home requires a dedicated Matter hub, such as a **Google Nest** or
  **Google Mini**, for Matter integration.
- **Offline Devices**: If Google Home displays devices as "offline":
  - Check that a compatible Google Home device (e.g., Google Home Mini) is connected to your local network.
  - Verify that **IPv6** is correctly set up; issues with IPv6 can lead to offline device indications.
- **Certified Matter Device**: Google Home may reject uncertified Matter devices.
  Follow [this guide](https://github.com/project-chip/matter.js/blob/main/docs/ECOSYSTEMS.md#google-home-ecosystem) to
  register your hub properly with Google Home.

## 4. Additional Troubleshooting Tips

- **Logs**: Review logs for specific error messages to identify and resolve configuration issues.
- **Consult Resources**: Refer to
  the [Troubleshooting Guide](https://github.com/project-chip/matter.js/blob/main/docs/TROUBLESHOOTING.md)
  and [Known Issues](https://github.com/project-chip/matter.js/blob/main/docs/KNOWN_ISSUES.md) of the matter.js project.
