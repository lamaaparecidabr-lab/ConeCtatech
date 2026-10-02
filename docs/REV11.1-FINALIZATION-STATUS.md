# REV11.1 Vehicle Identity — Finalization status

This revision keeps Vehicle Identity independent from transport (J1850/CAN) and validates VIN structure/check digit before marking an identity as IDENTIFIED.

## Audited rules
- 17-character VIN validation and ISO/NHTSA-style check digit.
- Model-year decoding MY2000–MY2026.
- Legacy VIN market is read from VIN position 1 (1 domestic / 5 international) where applicable.
- Modern configuration/calibration is read separately and versioned by era.
- Manufacturing origin, assembly plant, market/configuration and protocol are separate concepts.
- Protocol is supplied by the actual connection, never inferred from VIN.
- VERIFIED remains reserved for future cross-check against ECU/calibration evidence.

## Safety rule
A missing/ambiguous catalog combination must return PARTIAL rather than inventing a motorcycle. Catalog data is year-scoped; a code found in one model-year is not automatically valid in another.

## CAN readiness
The identifier has no dependency on J1850 framing. A future CAN transport must only obtain/provide the VIN and actual connected protocol to the same identity layer.
