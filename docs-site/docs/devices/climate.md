# Climate / Thermostat

Home Assistant `climate` entities are mapped to Matter **Thermostat** devices. The bridge auto-detects your device's capabilities from its `hvac_modes` attribute and exposes the correct feature set.

## Feature Variants

The thermostat type is automatically selected based on which HVAC modes your device supports:

| HA hvac_modes | Matter Features | Description |
|---------------|----------------|-------------|
| `heat` only | Heating | Heat-only TRVs, water heaters |
| `cool` only | Cooling | Cool-only ACs |
| `heat` + `cool` (no `heat_cool`) | Heating + Cooling | Dual-mode without auto switching. Apple Home won't show Auto button. |
| `heat_cool` present | Heating + Cooling + AutoMode | Full HVAC with dual setpoints |
| `heat_cool` only (no explicit `heat`/`cool`) | Heating + Cooling | Zoned ACs — `controlSequenceOfOperation` switches dynamically based on `hvac_action` |

## HVAC Mode Mapping

| HA Mode | Matter SystemMode |
|---------|------------------|
| `off` | Off |
| `heat` | Heat |
| `cool` | Cool |
| `heat_cool` | Auto |
| `auto` | Auto* |
| `dry` | Dry |
| `fan_only` | FanOnly |

> **Important:** Matter's "Auto" mode means automatic switching between heat/cool based on temperature. This matches HA's `heat_cool` mode, NOT the `auto` mode which typically means "device decides".

## Supported Attributes

| HA Attribute | Matter Property | Notes |
|-------------|----------------|-------|
| `current_temperature` | Local Temperature | Falls back to setpoint if unavailable |
| `temperature` | Occupied Heating/Cooling Setpoint | Single setpoint modes |
| `target_temp_high` | Occupied Cooling Setpoint | Auto mode (dual setpoint) |
| `target_temp_low` | Occupied Heating Setpoint | Auto mode (dual setpoint) |
| `hvac_action` | Thermostat Running State | Shows active heating/cooling |
| `min_temp` / `max_temp` | Absolute Min/Max limits | Constrains setpoint range |

## Temperature Display Unit

The `ThermostatUserInterfaceConfiguration` cluster exposes your HA temperature unit preference (°C or °F) to Matter controllers. Controllers may use this to display temperatures in your preferred unit.

## Compatibility

| Controller | Heat | Cool | Auto | Dry | Fan Only |
|------------|------|------|------|-----|----------|
| Apple Home | ✅ | ✅ | ✅ | ❌ | ❌ |
| Google Home | ✅ | ✅ | ✅ | ❌ | ❌ |
| Amazon Alexa | ✅ | ✅ | ✅ | ❌ | ❌ |

> Dry and Fan Only modes are exposed via Matter but controller support varies. Apple Home and Google Home typically only show Heat, Cool, Auto, and Off.

## Troubleshooting

### Apple Home shows Auto button but shouldn't

If your device only supports `heat` and `cool` (not `heat_cool`), HAMH intentionally does NOT expose AutoMode. If Auto still appears, check that your HA entity does not include `heat_cool` in its `hvac_modes` list (Developer Tools → States).

### Mode flipping / conflicting commands from Apple Home

This was fixed in v2.0.20. AutoMode is now only exposed when the device truly supports `heat_cool` (dual setpoint). Update to the latest version.

### Alexa rejects temperature commands

Single-capability thermostats (heat-only or cool-only) had a conformance issue with `controlSequenceOfOperation` that caused Alexa to reject commands. Fixed in v2.0.27 — the sequence is now dynamically set to `CoolingOnly` or `HeatingOnly` instead of `CoolingAndHeating`.

### Current temperature shows wrong value

If `current_temperature` is `null` or unavailable, the bridge falls back to the setpoint value. Check your HA entity's `current_temperature` attribute in Developer Tools.

### Zoned AC with only heat_cool mode

Devices that report only `heat_cool` in `hvac_modes` (no explicit `heat` or `cool`) are handled since v2.0.27. The `controlSequenceOfOperation` dynamically switches between `CoolingOnly` and `HeatingOnly` based on `hvac_action`.
