# Asset index map

All images live in `assets/balance2/` (the per-target folder; the target is `balance2` in
`app.json`), in **indexed-P** mode with 1-byte transparency (palette index 0 = transparent).
Files are named descriptively (e.g. `background.png`, `day_mon.png`, `gauge_cal_3.png`) rather
than by the original numeric scheme — see [Naming](#naming) below for why and how they map to
the old numbers.

At build time `zeus build` converts these PNGs to the native ZeppOS **TGA** format in the
device package — so the source stays as plain PNG and you don't hand-encode TGA. (`Preview.png`
is the one exception in spirit: keep it a plain PNG here; Zeus resizes/encodes the cover.)

See the widget table in [ARCHITECTURE.md](ARCHITECTURE.md) for where each is placed.

## Referenced assets

| Files | Count | What | Used by |
|-------|-------|------|---------|
| `background.png` | 1 | Background — Pip-Boy frame, scanlines, all static labels (ВРЕМЯ, gauge frames, PIP-BOY 3000 / ROBCO INDUSTRIES, separator dots) | background `IMG` |
| `time_digit_0.png`–`time_digit_9.png` | 10 | Large clock digits 0–9 | `IMG_TIME` (hours, minutes) |
| `digit_small_0.png`–`digit_small_9.png` | 10 | Small/medium digits 0–9 | date, temperature, seconds |
| `minus.png` | 1 | Minus sign `−` | temperature `negative_image` |
| `degree.png` | 1 | Degree symbol `°` | after the temperature value |
| `am.png` / `pm.png` | 2 | AM / PM glyphs | **currently unused** (AM/PM was omitted in the `@zos` rewrite; kept in case it's re-added) |
| `day_mon.png`–`day_sun.png` | 7 | Day-of-week labels, Monday→Sunday | day-of-week `IMG`, driven manually from `Time.getDay()` (see finding in [ZEPPOS-FINDINGS.md](ZEPPOS-FINDINGS.md); the firmware's `WEEK` binding drops Sunday) |
| `decimal_point.png` | 1 | Decimal point (7×22) | distance `dot_image` |
| `percent.png` | 1 | Percent `%` | battery `%` `IMG` |
| `icon_lock.png` | 1 | Lock icon | `IMG_STATUS` `LOCK` |
| `icon_disconnect.png` | 1 | Bluetooth/disconnect icon | `IMG_STATUS` `DISCONNECT` |
| `icon_alarm.png` | 1 | Alarm/clock icon | `IMG_STATUS` `CLOCK` |
| `pipboy_0.png`–`pipboy_7.png` | 8 | Vault Boy walk-cycle frames | firmware-driven `IMG_ANIM` (`anim_prefix: 'pipboy'`, 8 fps) — see [ZEPPOS-FINDINGS.md](ZEPPOS-FINDINGS.md) #13 |
| `digit_bold_0.png`–`digit_bold_9.png` | 10 | Bold metric digits 0–9 | calories, pulse, distance, steps, battery |
| `weather_00.png`–`weather_26.png` | 27 | Weather condition icons, indexed by `hmUI.data_type.WEATHER_CURRENT` | weather `IMG_LEVEL` |
| `gauge_cal_0.png`–`gauge_cal_5.png` | 6 | Calories gauge fill (level 0→5, empty→full) | calories gauge, plain `IMG` with `src` swapped in `updateGauges()` |
| `gauge_pulse_0.png`–`gauge_pulse_5.png` | 6 | Pulse gauge fill (level 0→5) | pulse gauge, same mechanism |
| `gauge_dist_0.png`–`gauge_dist_5.png` | 6 | Distance gauge fill (level 0→5) | distance gauge, same mechanism |
| `gauge_steps_0.png`–`gauge_steps_5.png` | 6 | Steps gauge fill (level 0→5) | steps gauge, same mechanism |

**Weather icon index → condition:** not documented by ZeppOS anywhere (SDK or firmware docs), so
the files stay numbered (`weather_00`…`weather_26`) rather than guessed — see
[ZEPPOS-FINDINGS.md](ZEPPOS-FINDINGS.md) for the research trail.

The four gauges are plain `IMG` widgets whose `src` is swapped by index, **not** `IMG_LEVEL` —
see finding #2 in [ZEPPOS-FINDINGS.md](ZEPPOS-FINDINGS.md) for why (`IMG_LEVEL type`-binding is
unreliable for these metrics on this device).

### Gauge fill sprites (`gauge_*_N.png`)

Each gauge's six images are a complete bar at six fill levels — the frame outline plus the
solid fill, with a transparent empty interior — ordered **empty (index 0) → full (index 5)**.
The gauge box sits over the (erased) background and the app picks the index from the metric
fraction in `updateGauges()`. These were produced by resizing the source's native gauge sprites
to each box's pixel size.

## Named files

| File | What |
|------|------|
| `Preview.png` | App cover — a full render of the face, a **plain PNG**. `zeus build` resizes it and encodes the device cover. Referenced by `app.json` `icon`/`cover`. (When packaged by hand instead of Zeus, the cover must be hand-encoded as a ZeppOS TGA — see finding #6 in [ZEPPOS-FINDINGS.md](ZEPPOS-FINDINGS.md).) |
| `transparent.png` | Small fully-transparent placeholder. |
| `fonts/2Expansiva-bold.ttf` | TrueType font carried from the reference watch face (used by the ZeppOS runtime). |

## Naming

Assets were originally named by the numeric scheme the GTR→Balance2 converter produced
(`0000.png`, `0011.png`, …, `0223.png`) and were renamed to the descriptive names above once the
watch face's logic (and thus the meaning of each file) stabilized. `git log --follow <file>`
recovers the pre-rename history for any asset.

**Why not a single combined sprite sheet ("CSS-sprite" style, cropped by coordinates)?**
`hmUI`'s image widgets (`IMG`, `IMG_LEVEL`, `IMG_ANIM`, `TEXT_IMG`, …) have no crop/offset/
sub-region property anywhere in the vendored `@zeppos/device-types` SDK typings — every widget
addresses one whole separate image file by name (`src`, `image_array[i]`, `anim_prefix +
'_' + i`). There's no atlas mechanism to switch to; many small files, swapped by filename, is
what the platform supports.

## Pruned source sprites

The original GTR conversion carried 24 unreferenced leftover sprites (`0022`, `0033`,
`0036`–`0051`, `0053`, `0056`, `0065`–`0068`). They were **removed** — `zeus build`'s PNG→TGA
converter rejects degenerate/too-small images (it failed on `0033.png`), and they were unused
anyway. Among them, `0046`–`0051` were the source's original native-size gauge sprites that had
already been resized into the per-gauge fill copies. (The original Vault Boy frames `0057`–`0064`
were later replaced outright by the `pipboy_0`–`pipboy_7` `IMG_ANIM` frames — see above.)
