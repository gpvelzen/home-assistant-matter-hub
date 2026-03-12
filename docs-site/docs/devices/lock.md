# Lock

Home Assistant `lock` entities are mapped to Matter **DoorLock** devices with PIN code support where available.

## Features

- **Lock** — Always allowed, no PIN required
- **Unlock** — Requires PIN if credentials are configured
- **Unlatch / Unbolt** — Available when the HA entity supports the `OPEN` feature. Maps to `lock.open` action. Apple Home shows an "Unlatch" button.

## State Mapping

| HA State | Matter Lock State |
|----------|------------------|
| `locked` / `locking` | Locked |
| `unlocked` / `unlocking` | Unlocked |
| `open` / `opening` | Unlatched |

## PIN Credentials

You can configure PIN codes through the **Entity Mapping** UI to require a code when unlocking from a Matter controller.

### Setup

1. Go to your Bridge in the Dashboard
2. Find your lock entity
3. Click **Edit Mapping**
4. In the **PIN Credentials** section, add one or more PIN codes
5. Save the mapping

When PIN credentials are configured, controllers will prompt for a code before unlocking. The PIN is validated by the bridge — only matching codes will trigger the `lock.unlock` action in HA.

### Lock without PIN

Locking is always allowed without a PIN. Only the unlock action requires PIN entry when credentials are configured.

## Unlatch (Unbolting)

Since v2.0.25, the Unbolting feature is automatically enabled when your HA lock entity supports the `OPEN` feature (reported in `supported_features`).

When enabled:
- Apple Home shows an "Unlatch" button alongside Lock/Unlock
- Pressing Unlatch calls `lock.open` in HA
- Useful for door openers, electric strikes, and motorized locks with separate unlatch capability

## Compatibility

| Controller | Lock | Unlock | PIN Entry | Unlatch |
|------------|------|--------|-----------|---------|
| Apple Home | ✅ | ✅ | ✅ | ✅ |
| Google Home | ✅ | ⚠️ | ⚠️ | ❌ |
| Amazon Alexa | ✅ | ✅ | ⚠️ | ❌ |

> **Google Home** has disabled voice unlock for Matter locks (Google policy). You can still unlock via the Google Home app.
>
> **PIN entry** support varies by controller. Apple Home has the best PIN code support.

## Troubleshooting

### Controller won't unlock the door

1. Check if you have PIN credentials configured — if so, ensure the controller supports PIN entry
2. Try unlocking via the controller app (not voice) to see if a PIN prompt appears
3. Google Home blocks voice unlock for Matter locks by policy

### Unlatch button not showing in Apple Home

1. Verify your HA lock entity supports the `OPEN` feature (check `supported_features` in Developer Tools → States)
2. Remove and re-add the device in Apple Home (device capabilities changed)
3. Ensure you're on v2.0.25 or later

### Lock state not updating

Check that your HA lock entity is updating its state correctly in Developer Tools. Some lock integrations have a delay between the physical lock state and the HA state update. The bridge reflects whatever state HA reports.
