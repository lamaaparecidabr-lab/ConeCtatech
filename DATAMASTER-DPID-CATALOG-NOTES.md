# ConeCtaHarley — DataMaster DPID catalog notes (Rev11 experimental)

## Current scope: J1850 only
The Rev11 scanner experiment sends only the catalogued J1850 HDC2/Mode 0x2A DPIDs 0x11 through 0x21.
All experimental reads are log-only except DPID 0x11 battery, already validated on the real motorcycle.

Generic J1850 / related mapped groups retained for validation:
- 0x11 RPM / Desired Idle / Battery / MAP / TPS
- 0x12 Engine Temp / IAT / ET-IAT-MAP-TPS sensor volts
- 0x13 Spark F-R / Knock Fast F-R / IAC / Engine Flag
- 0x14 Injectors / O2 / Fuel Trim / Vehicle Speed
- 0x15 Desired AFR / AF Feedback F-R / MAP
- 0x16 Accel Enrichment / Injector BPW F-R
- 0x17 Decel Enleanment / Spark Advance F-R hi-res
- 0x18 VE / Warm Up AFR / IAC
- 0x19 temperature group / TPS
- 0x1A O2 Raw F-R / Knock Retard F-R
- 0x1B RPM / Run Time / Barometer / Sync / Vehicle Speed
- 0x1C Battery / Ion-Q / flags
- 0x1D Generic O2: O2 F-R / integrators / long-term
- 0x1E Crank Time / Sidestand / Gear
- 0x1F Cruise / Fuel Pump / Throttle / TGS
- 0x20 Post-cat O2 / DBW sensor voltages
- 0x21 Cruise-control disengage data

## Future scope: CAN — intentionally NOT implemented in Rev11
The DataMaster configuration also exposes CAN-oriented DPID groups in the 0x200–0x210 range.
These references are retained for the future CAN implementation, because ConeCtaHarley is intended to support motorcycles that use CAN later.

They MUST NOT be sent through the current J1850 scanner path. Future work should create a separate CAN transport/protocol layer and map the applicable DataMaster CAN datastream/OS configuration before real-bike testing.
