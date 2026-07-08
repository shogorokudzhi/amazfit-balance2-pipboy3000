import * as hmUI from '@zos/ui'
import { Time, Step, Calorie, Distance, HeartRate } from '@zos/sensor'
import { createTimer, stopTimer } from '@zos/timer'
import {
  launchApp, SYSTEM_APP_STATUS, SYSTEM_APP_HR, SYSTEM_APP_WEATHER,
  SYSTEM_APP_CALENDAR, SYSTEM_APP_ALARM, SYSTEM_APP_COUNTDOWN,
} from '@zos/router'

// ---- Asset groups (in assets/balance2/, referenced by bare name) ----
const DATE_FONT = [
  'digit_small_0.png', 'digit_small_1.png', 'digit_small_2.png', 'digit_small_3.png', 'digit_small_4.png',
  'digit_small_5.png', 'digit_small_6.png', 'digit_small_7.png', 'digit_small_8.png', 'digit_small_9.png',
]
const BIG_TIME = [
  'time_digit_0.png', 'time_digit_1.png', 'time_digit_2.png', 'time_digit_3.png', 'time_digit_4.png',
  'time_digit_5.png', 'time_digit_6.png', 'time_digit_7.png', 'time_digit_8.png', 'time_digit_9.png',
]
const METRIC_FONT = [
  'digit_bold_0.png', 'digit_bold_1.png', 'digit_bold_2.png', 'digit_bold_3.png', 'digit_bold_4.png',
  'digit_bold_5.png', 'digit_bold_6.png', 'digit_bold_7.png', 'digit_bold_8.png', 'digit_bold_9.png',
]
// Gauge fill sprites, level 0 (empty, frame only) → 5 (full). Driven as plain IMG src swaps.
const CAL_BARS = ['gauge_cal_0.png', 'gauge_cal_1.png', 'gauge_cal_2.png', 'gauge_cal_3.png', 'gauge_cal_4.png', 'gauge_cal_5.png']
const PULSE_BARS = ['gauge_pulse_0.png', 'gauge_pulse_1.png', 'gauge_pulse_2.png', 'gauge_pulse_3.png', 'gauge_pulse_4.png', 'gauge_pulse_5.png']
const DIST_BARS = ['gauge_dist_0.png', 'gauge_dist_1.png', 'gauge_dist_2.png', 'gauge_dist_3.png', 'gauge_dist_4.png', 'gauge_dist_5.png']
const STEP_BARS = ['gauge_steps_0.png', 'gauge_steps_1.png', 'gauge_steps_2.png', 'gauge_steps_3.png', 'gauge_steps_4.png', 'gauge_steps_5.png']
// Day-of-week labels, ordered Monday→Sunday: index 0=Monday (day_mon.png) … 6=Sunday (day_sun.png).
// Driven manually from Time.getDay() (see updateDate()) because the firmware's
// data_type.WEEK binding renders every day but Sunday — the value it feeds the
// IMG_LEVEL for Sunday falls outside this array. getDay() is the documented
// JS convention (0=SU … 6=SA), so we map it ourselves.
const WEEK_IMG = ['day_mon.png', 'day_tue.png', 'day_wed.png', 'day_thu.png', 'day_fri.png', 'day_sat.png', 'day_sun.png']
// Weather condition icon per hmUI.data_type.WEATHER_CURRENT index; the firmware doesn't
// document what each index depicts, so these stay numbered rather than guessed.
const WEATHER_IMG = Array.from({ length: 27 }, (_, i) => `weather_${String(i).padStart(2, '0')}.png`)
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
    hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: 'background.png' })

    // ---- Day of week (manual; see WEEK_IMG note) ----
    this._weekImg = hmUI.createWidget(hmUI.widget.IMG, { x: 150, y: 24, src: WEEK_IMG[0] })

    // ---- Date DD.MM.YYYY: per-digit IMGs, refreshed from the Time sensor ----
    this._dateImgs = DATE_X.map((x) =>
      hmUI.createWidget(hmUI.widget.IMG, { x, y: 78, src: 'digit_small_0.png' })
    )

    // ---- Weather icon + temperature (auto-bound) ----
    hmUI.createWidget(hmUI.widget.IMG_LEVEL, {
      x: 330, y: 78, image_array: WEATHER_IMG, image_length: 27, type: hmUI.data_type.WEATHER_CURRENT,
    })
    hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: 338, y: 78, w: 56, h: 24, font_array: DATE_FONT, h_space: -3,
      negative_image: 'minus.png', align_h: hmUI.align.RIGHT, type: hmUI.data_type.WEATHER_CURRENT,
    })
    hmUI.createWidget(hmUI.widget.IMG, { x: 394, y: 78, src: 'degree.png' }) // degree °

    // ---- Vault Boy (firmware-driven sprite animation: IMG_ANIM over pipboy_0..7) ----
    // Native widget = the firmware cycles the frames; no manual timer (robust on Balance 2,
    // where the old getScreenType-gated timer froze — see docs/ZEPPOS-FINDINGS.md #13).
    hmUI.createWidget(hmUI.widget.IMG_ANIM, {
      x: 185, y: 120,
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
      dot_image: 'decimal_point.png', align_h: hmUI.align.RIGHT, type: hmUI.data_type.DISTANCE,
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
    hmUI.createWidget(hmUI.widget.IMG, { x: 132, y: 379, src: 'percent.png' })

    // ---- Status icons (auto-bound) ----
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 312, y: 368, src: 'icon_disconnect.png', type: hmUI.system_status.DISCONNECT })
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 351, y: 368, src: 'icon_lock.png', type: hmUI.system_status.LOCK })
    hmUI.createWidget(hmUI.widget.IMG_STATUS, { x: 405, y: 366, src: 'icon_alarm.png', type: hmUI.system_status.CLOCK })

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
