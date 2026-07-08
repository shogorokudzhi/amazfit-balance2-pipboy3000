import * as hmUI from '@zos/ui'
import { Time, Step, Calorie, Distance, HeartRate } from '@zos/sensor'
import { createTimer, stopTimer } from '@zos/timer'
import {
  launchApp, SYSTEM_APP_STATUS, SYSTEM_APP_HR, SYSTEM_APP_WEATHER,
  SYSTEM_APP_CALENDAR, SYSTEM_APP_ALARM, SYSTEM_APP_COUNTDOWN,
} from '@zos/router'

// ---- Asset groups (in assets/balance2/, referenced by bare name) ----
const DATE_FONT = [
  '0011.png', '0012.png', '0013.png', '0014.png', '0015.png',
  '0016.png', '0017.png', '0018.png', '0019.png', '0020.png',
]
const BIG_TIME = [
  '0001.png', '0002.png', '0003.png', '0004.png', '0005.png',
  '0006.png', '0007.png', '0008.png', '0009.png', '0010.png',
]
const METRIC_FONT = [
  '0069.png', '0070.png', '0071.png', '0072.png', '0073.png',
  '0074.png', '0075.png', '0076.png', '0077.png', '0078.png',
]
// Gauge fill sprites, level 0 (empty, frame only) → 5 (full). Driven as plain IMG src swaps.
const CAL_BARS = ['0200.png', '0201.png', '0202.png', '0203.png', '0204.png', '0205.png']
const PULSE_BARS = ['0206.png', '0207.png', '0208.png', '0209.png', '0210.png', '0211.png']
const DIST_BARS = ['0212.png', '0213.png', '0214.png', '0215.png', '0216.png', '0217.png']
const STEP_BARS = ['0218.png', '0219.png', '0220.png', '0221.png', '0222.png', '0223.png']
// Day-of-week labels, ordered Monday→Sunday: index 0=MO (0026) … 6=SU (0032).
// Driven manually from Time.getDay() (see updateDate()) because the firmware's
// data_type.WEEK binding renders every day but Sunday — the value it feeds the
// IMG_LEVEL for Sunday falls outside this array. getDay() is the documented
// JS convention (0=SU … 6=SA), so we map it ourselves.
const WEEK_IMG = ['0026.png', '0027.png', '0028.png', '0029.png', '0030.png', '0031.png', '0032.png']
const WEATHER_IMG = Array.from({ length: 27 }, (_, i) => `${(79 + i).toString().padStart(4, '0')}.png`)
// Vault Boy walk: firmware-driven IMG_ANIM over frames pipboy_0.png … pipboy_7.png.

// Date digits sit at these absolute x positions (snug to the baked separator dots), y=78.
const DATE_X = [82, 94, 111, 123, 143, 155, 167, 179]

// Gauge full-scale references (fallbacks when a sensor goal isn't available).
const CAL_GOAL = 300       // fallback active-kcal goal
const STEP_GOAL = 8000     // fallback step goal
const DIST_FULL_M = 10000  // distance bar full at ~10 km
const HR_MIN = 40          // pulse bar maps linearly over [HR_MIN, HR_MAX]
const HR_MAX = 180

const REFRESH_PERIOD = 60000 // ms between date/gauge refreshes

const timeSensor = new Time()
const stepSensor = new Step()
const calSensor = new Calorie()
const distSensor = new Distance()
const hrSensor = new HeartRate()

// Run a fn, swallowing errors — sensor/router calls can throw if unsupported / not ready.
const safe = (fn) => {
  try { return fn() } catch (e) { /* non-fatal */ }
}

// Map a 0..1 fraction to a sprite index in [0, n-1].
const gaugeLevel = (frac, n) => {
  const max = n - 1
  return Math.max(0, Math.min(max, Math.round((frac || 0) * max)))
}

// Each gauge: position, its fill sprites (empty→full), and how to read its 0..1 fraction.
// Same source as the displayed number, so the bar always tracks what the user reads.
const GAUGES = [
  { x: 90, y: 159, bars: CAL_BARS, frac: () => calSensor.getCurrent() / (calSensor.getTarget() || CAL_GOAL) },
  { x: 73, y: 224, bars: PULSE_BARS, frac: () => ((hrSensor.getCurrent() || hrSensor.getLast() || 0) - HR_MIN) / (HR_MAX - HR_MIN) },
  { x: 90, y: 286, bars: DIST_BARS, frac: () => distSensor.getCurrent() / DIST_FULL_M },
  { x: 194, y: 349, bars: STEP_BARS, frac: () => stepSensor.getCurrent() / (stepSensor.getTarget() || STEP_GOAL) },
]

WatchFace({
  build() {
    // ---- Background ----
    hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: '0000.png' })

    // ---- Day of week (manual; see WEEK_IMG note) ----
    this._weekImg = hmUI.createWidget(hmUI.widget.IMG, { x: 150, y: 24, src: WEEK_IMG[0] })

    // ---- Date DD.MM.YYYY: per-digit IMGs, refreshed from the Time sensor ----
    this._dateImgs = DATE_X.map((x) =>
      hmUI.createWidget(hmUI.widget.IMG, { x, y: 78, src: '0011.png' })
    )

    // ---- Weather icon + temperature (auto-bound) ----
    hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
      x: 330, y: 78, image_array: WEATHER_IMG, image_length: 27, type: hmUI.data_type.WEATHER_CURRENT,
    })
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 338, y: 78, w: 56, h: 24, font_array: DATE_FONT, h_space: -3,
      negative_image: '0021.png', align_h: hmUI.align.RIGHT, type: hmUI.data_type.WEATHER_CURRENT,
    })
    hmUI.createWidget(hmUI.widget.IMG, { x: 394, y: 78, src: '0023.png' }) // degree °

    // ---- Vault Boy (firmware-driven sprite animation: IMG_ANIM over pipboy_0..7) ----
    // Native widget = the firmware cycles the frames; no manual timer (robust on Balance 2,
    // where the old getScreenType-gated timer froze — see docs/ZEPPOS-FINDINGS.md #13).
    hmUI.createWidget(hmUI.widget.IMG_ANIM, {
      x: 186, y: 130,
      anim_path: '', anim_prefix: 'pipboy', anim_ext: 'png',
      anim_fps: 8, anim_size: 8, anim_repeat: true, repeat_count: 255,
      anim_status: hmUI.anim_status.START,
    })

    // ---- Time: hours/minutes (big) + seconds (small), auto-bound ----
    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_startX: 328, hour_startY: 132, hour_array: BIG_TIME, hour_zero: 1, hour_align: hmUI.align.LEFT,
      minute_startX: 328, minute_startY: 246, minute_array: BIG_TIME, minute_zero: 1, minute_align: hmUI.align.LEFT,
      second_startX: 371, second_startY: 348, second_array: DATE_FONT, second_zero: 1, second_align: hmUI.align.LEFT,
    })

    // ---- Activity metric numbers (auto-bound) ----
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 17, y: 149, w: 72, h: 24, font_array: METRIC_FONT, h_space: -3,
      align_h: hmUI.align.RIGHT, type: hmUI.data_type.CAL,
    })
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 15, y: 216, w: 58, h: 24, font_array: METRIC_FONT, h_space: -3,
      align_h: hmUI.align.RIGHT, type: hmUI.data_type.HEART,
    })
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 8, y: 277, w: 80, h: 24, font_array: METRIC_FONT, h_space: -3,
      dot_image: '0034.png', align_h: hmUI.align.RIGHT, type: hmUI.data_type.DISTANCE,
    })
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 195, y: 369, w: 96, h: 24, font_array: METRIC_FONT, h_space: -3,
      align_h: hmUI.align.CENTER_H, type: hmUI.data_type.STEP,
    })

    // ---- Gauge bars: plain IMG, src swapped in updateGauges() (always framed — see
    //      docs/ZEPPOS-FINDINGS.md #2). Level tracks the sensor; level 0 = empty frame. ----
    this._gauges = GAUGES.map((g) =>
      hmUI.createWidget(hmUI.widget.IMG, { x: g.x, y: g.y, src: g.bars[0] })
    )

    // ---- Battery (auto-bound) + % glyph ----
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 74, y: 379, w: 58, h: 24, font_array: METRIC_FONT, h_space: -3,
      align_h: hmUI.align.RIGHT, type: hmUI.data_type.BATTERY,
    })
    hmUI.createWidget(hmUI.widget.IMG, { x: 132, y: 379, src: '0035.png' })

    // ---- Status icons (auto-bound) ----
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 312, y: 368, src: '0054.png', type: hmUI.system_status.DISCONNECT })
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 351, y: 368, src: '0052.png', type: hmUI.system_status.LOCK })
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 405, y: 366, src: '0055.png', type: hmUI.system_status.CLOCK })

    // ---- Tap-to-launch shortcuts (invisible overlays; created last so they capture touches) ----
    const tapZone = (x, y, w, h, appId) =>
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x, y, w, h, text: '',
        normal_src: 'transparent.png', press_src: 'transparent.png',
        click_func: () => safe(() => launchApp({ appId, native: true })),
      })
    tapZone(300, 70, 135, 44, SYSTEM_APP_WEATHER)    // weather icon + temperature
    tapZone(78, 72, 120, 32, SYSTEM_APP_CALENDAR)    // date DD.MM.YYYY
    tapZone(300, 120, 160, 113, SYSTEM_APP_ALARM)     // time: hours (top) -> Alarm
    tapZone(300, 233, 160, 107, SYSTEM_APP_COUNTDOWN) // time: minutes (bottom) -> Timer
    tapZone(10, 146, 155, 32, SYSTEM_APP_STATUS)     // calories -> Activity
    tapZone(10, 210, 140, 34, SYSTEM_APP_HR)         // pulse -> Heart Rate
    tapZone(5, 272, 160, 34, SYSTEM_APP_STATUS)      // distance -> Activity
    tapZone(185, 345, 110, 52, SYSTEM_APP_STATUS)    // steps -> Activity
    // battery -> battery page: a firmware "jumpable shortcut" (no SYSTEM_APP_BATTERY exists).
    hmUI.createWidget(hmUI.widget.IMG_CLICK, { x: 40, y: 372, w: 120, h: 34, type: hmUI.data_type.BATTERY })

    // ---- Refresh gauges when the activity sensors change (cheap, event-driven) ----
    this._onGauge = () => this.updateGauges()
    safe(() => stepSensor.onChange(this._onGauge))
    safe(() => calSensor.onChange(this._onGauge))
    safe(() => distSensor.onChange(this._onGauge))

    // The periodic refresh + walk animation run only while the face is visible (battery / AOD).
    // resume_call/pause_call fire on show/hide; we also resume now so the first paint + walk
    // don't wait on the first resume event.
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => this.onResume(),
      pause_call: () => this.onPause(),
    })
    safe(() => this.onResume())
  },

  // Start the periodic refresh timer (idempotent). The Vault Boy walk is firmware-driven
  // (IMG_ANIM) and needs no manual start/stop.
  onResume() {
    if (this._running) return
    this._running = true
    this.updateDate()
    this.updateGauges()
    if (!this._refreshTimer) {
      this._refreshTimer = createTimer(0, REFRESH_PERIOD, () => {
        this.updateDate()
        this.updateGauges()
      })
    }
  },

  // Stop the refresh timer when the face is hidden (saves battery).
  onPause() {
    this._running = false
    if (this._refreshTimer) { stopTimer(this._refreshTimer); this._refreshTimer = undefined }
  },

  updateGauges() {
    GAUGES.forEach((g, i) =>
      safe(() => this._gauges[i].setProperty(hmUI.prop.SRC, g.bars[gaugeLevel(g.frac(), g.bars.length)]))
    )
  },

  updateDate() {
    const day = String(timeSensor.getDate()).padStart(2, '0')
    const month = String(timeSensor.getMonth()).padStart(2, '0')
    const year = String(timeSensor.getFullYear()).padStart(4, '0')
    const seq = day + month + year // 8 digits -> DATE_X
    for (let i = 0; i < this._dateImgs.length; i++) {
      this._dateImgs[i].setProperty(hmUI.prop.SRC, DATE_FONT[Number(seq[i])])
    }
    // Day of week: Time.getDay() is the JS convention (0=SU … 6=SA); WEEK_IMG is
    // ordered MO→SU, so map (getDay()+6)%7 (SU→6, MO→0, …, SA→5).
    const weekIdx = (timeSensor.getDay() + 6) % 7
    this._weekImg.setProperty(hmUI.prop.SRC, WEEK_IMG[weekIdx])
  },

  onDestroy() {
    this.onPause()
    if (this._onGauge) {
      safe(() => stepSensor.offChange(this._onGauge))
      safe(() => calSensor.offChange(this._onGauge))
      safe(() => distSensor.offChange(this._onGauge))
    }
  },
})
