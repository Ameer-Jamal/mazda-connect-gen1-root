# Compatibility evidence

Evidence reviewed on 2026-10-20. No hardware/firmware combination has been independently qualified by this fork. “Reported working” is not a supported profile, and a different firmware, market, hardware revision, or prior modification can invalidate an assumption.

| System / vehicle | Firmware / region | Evidence class | Source and limits | Verdict |
| --- | --- | --- | --- | --- |
| Desktop simulator | Current Chromium; Node.js 22+ tooling | Reproduced desktop tests | [Validation record](validation.md); no real framework or hardware involved | Desktop preview only |
| Reported 2020 CX-5 | 70.00.335; region unspecified | Community report | [Upstream discussion #10](https://github.com/mzd-evo/mzd-connect-1-root/discussions/10): author reports success, without a reproducible action-by-action test record | Unqualified |
| Unspecified vehicle | 74.00.324 EUN | Community report | Comment in [discussion #6](https://github.com/mzd-evo/mzd-connect-1-root/discussions/6); exact hardware and exercised actions absent | Unqualified |
| Unspecified vehicle | 70.00.021; region unspecified | Compatibility question | [Discussion #6](https://github.com/mzd-evo/mzd-connect-1-root/discussions/6) asks about this version; another firmware's success is not an answer for it | Unknown |
| Owner's 2022 MX-5 Miata Grand Touring, ND2 | Firmware, market, and CMU revision unconfirmed | Owner vehicle identification | Factory Gen 1 expected; no physical inspection or tests performed | Unknown for this method |
| Other Gen 1 vehicles | Any other combination | No qualification evidence collected | Do not extrapolate from a model-year range | Unknown |
| Mazda Connect Gen 2 | Any | No supporting implementation/qualification evidence | Reviewed source targets older internal APIs; no Gen 2 adapter supplied | Unsupported by available evidence |

The Miata's ND1/ND2 revisions and Mazda Connect generations are separate classifications. Mazda's [2023 MX-5 specifications](https://news.mazdausa.com/vehicles-2023-mx-5) describe the seven-inch system; its [2024 announcement](https://news.mazdausa.com/2024-01-25-24MY-2024-Mazda-MX-5-Miata-Pricing-and-Packaging?asPDF=1) describes the upgraded 8.8-inch system. A screen size or vehicle badge alone is insufficient for qualifying this method.

## Evidence required before changing a verdict

Record the exact CMU hardware identifier, full OS/firmware string including region, vehicle model/year/market, pre-existing changes, source commit and package hash, action performed, expected and observed results, power conditions, failures, and recovery outcome. Keep VINs, account details, location history, and other personal data out of public reports.

A bench run must establish behavior for each action and verify a recovery path appropriate to that unit. Road use and daily-driver trials are outside this milestone. Successful simulator runs do not populate the hardware-qualified category.
