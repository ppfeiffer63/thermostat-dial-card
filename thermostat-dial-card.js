/* thermostat-dial-card — Lovelace-Thermostat-Karte
 * LED-Bogen im SteelSeries-Stil für eine oder zwei climate-Entitäten.
 * Vanilla JS, keine Abhängigkeiten, keine Zonen/PWM — das übernimmt die
 * Entität(en) selbst (z. B. ein "Generic Thermostat"-Helper).
 */
const CARD_VERSION = "4.2.0";

const START = 135;  // Winkel am Bogenanfang (unten links)
const SWEEP = 270;  // Bogenlänge in Grad
const CX = 100;
const CY = 100;
const R_SINGLE = 86;
const R_OUTER = 86;
const R_INNER = 62;

const MODE_ICONS = {
  off: "mdi:power",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  auto: "mdi:calendar-sync",
  heat_cool: "mdi:thermometer-auto",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
};
const MODE_LABELS = {
  off: "Aus",
  heat: "Heizen",
  cool: "Kühlen",
  auto: "Auto",
  heat_cool: "Heizen/Kühlen",
  dry: "Entfeuchten",
  fan_only: "Lüfter",
};
const ACTION_LABELS = {
  heating: "Heizt",
  cooling: "Kühlt",
  idle: "Bereit",
  off: "Aus",
  drying: "Entfeuchtet",
  fan: "Lüfter",
};

const polar = (cx, cy, r, deg) => {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

const arcPath = (cx, cy, r, fromDeg, sweep) => {
  if (sweep <= 0) return "";
  const [x1, y1] = polar(cx, cy, r, fromDeg);
  const [x2, y2] = polar(cx, cy, r, fromDeg + sweep);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

const toCss = (c, fallback) => {
  if (Array.isArray(c) && c.length >= 3) return `rgb(${c[0]},${c[1]},${c[2]})`;
  if (typeof c === "string" && c.trim()) return c.replace(/["'<>;]/g, "").trim();
  return fallback;
};

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

const lerp = (a, b, f) => a + (b - a) * f;

// Baut aus einer sortierten color_stops-Liste ([{temp, color}]) eine Funktion
// temp -> CSS-Farbe, linear zwischen den Stützpunkten interpoliert.
const buildGradientFn = (stops) => {
  const parsed = stops
    .map((s) => ({ t: Number(s.temp), c: hexToRgb(s.color) }))
    .filter((s) => Number.isFinite(s.t) && s.c)
    .sort((a, b) => a.t - b.t);
  if (parsed.length < 2) return null;
  return (temp) => {
    if (temp <= parsed[0].t) return toCss(parsed[0].c);
    const last = parsed[parsed.length - 1];
    if (temp >= last.t) return toCss(last.c);
    for (let i = 0; i < parsed.length - 1; i++) {
      const a = parsed[i];
      const b = parsed[i + 1];
      if (temp >= a.t && temp <= b.t) {
        const f = (temp - a.t) / (b.t - a.t);
        return toCss([lerp(a.c[0], b.c[0], f), lerp(a.c[1], b.c[1], f), lerp(a.c[2], b.c[2], f)]);
      }
    }
    return toCss(last.c);
  };
};

class ThermostatDialCard extends HTMLElement {
  constructor() {
    super();
    this._pending = { a: null, b: null };
    this._active = "a";
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
        { name: "entity2", selector: { entity: { domain: "climate" } } },
        { name: "name", selector: { text: {} } },
        { name: "name2", selector: { text: {} } },
        { name: "segments", selector: { number: { min: 24, max: 72, step: 6, mode: "slider" } } },
        {
          name: "face",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "dark", label: "Dunkel (SteelSeries)" },
                { value: "theme", label: "HA-Theme" },
              ],
            },
          },
        },
        { name: "color", selector: { color_rgb: {} } },
        { name: "color2", selector: { color_rgb: {} } },
        { name: "step", selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box" } } },
        { name: "show_modes", selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Climate-Entität (Soll, Ist, Modus)",
          entity2: "2. Climate-Entität (optional — aktiviert den Doppel-Bogen)",
          name: "Name",
          name2: "Name (2. Entität)",
          segments: "Anzahl LED-Segmente",
          face: "Zifferblatt",
          color: "Bogenfarbe (leer = automatisch nach Modus)",
          color2: "Bogenfarbe 2. Entität (leer = automatisch nach Modus)",
          step: "Schrittweite (leer = Vorgabe der Entität)",
          show_modes: "Modus-Buttons anzeigen",
        }[s.name] || s.name),
    };
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find((id) => id.startsWith("climate."));
    return { entity: entity || "climate.thermostat", face: "dark" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("'entity' fehlt");
    const seg = Math.round(Number(config.segments) || 45);
    this._config = { face: "dark", show_modes: true, ...config, segments: Math.min(90, Math.max(12, seg)) };
    const dual = !!this._config.entity2;
    if (this._built && this._dual !== dual) this._built = false;
    this._dual = dual;
    this._pending = { a: null, b: null };
    this._active = "a";
    this._last = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const key = this._dual ? `${hass.states[this._config.entity]}|${hass.states[this._config.entity2]}` : hass.states[this._config.entity];
    if (key !== this._last) {
      this._last = key;
      this._render();
    }
  }

  getCardSize() {
    return this._dual ? 6 : 5;
  }

  // ---------- Aufbau ----------
  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const dual = this._dual;
    root.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --tx: var(--primary-text-color); --tx2: var(--secondary-text-color);
          --btn: var(--secondary-background-color, #eee); --off: var(--divider-color, #ddd);
          position: relative; padding: 18px; text-align: center; overflow: hidden;
        }
        ha-card.dark {
          --tx: #f4f4f5; --tx2: #8b909a; --btn: #262a30; --off: #2a2e35;
          background: #16181c; color: #f4f4f5;
        }
        svg { display: block; width: 100%; max-width: 300px; margin: 0 auto; touch-action: none; user-select: none; -webkit-user-select: none; overflow: visible; }
        .led { fill: none; stroke-linecap: round; }
        .led.off { stroke: var(--off); }
        .glow path { fill: none; stroke-linecap: round; opacity: .35; }
        .hl path { fill: none; stroke: rgba(255,255,255,.5); stroke-width: 1.6; stroke-linecap: round; }
        .hit { fill: none; stroke: transparent; cursor: grab; }
        .hit.disabled { cursor: default; }
        .cur { fill: var(--tx); opacity: .9; }
        .tgt { fill: var(--tx); }
        .selRing { fill: none; stroke-dasharray: 2 4; opacity: .35; }
        .name { font-size: 11.5px; font-weight: 500; letter-spacing: .04em; fill: var(--tx2); text-anchor: middle; text-transform: uppercase; }
        .name.clickable { cursor: pointer; }
        .target { font-size: 42px; font-weight: 300; fill: var(--tx); text-anchor: middle; letter-spacing: -0.01em; }
        .unit { font-size: 15px; font-weight: 400; fill: var(--tx2); }
        .sub { font-size: 11.5px; fill: var(--tx2); text-anchor: middle; }
        .btn { cursor: pointer; }
        .btn circle { fill: var(--btn); stroke: var(--off); stroke-width: 1; }
        .btn:active circle { fill: var(--off); }
        .btn text { font-size: 19px; fill: var(--tx); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
        .disabled { opacity: .35; pointer-events: none; }
        .modes {
          position: absolute; bottom: 16px; display: flex; flex-direction: column; gap: 8px;
        }
        .modes.left { left: 16px; }
        .modes.right { right: 16px; }
        .modes button {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--off); cursor: pointer;
          background: var(--btn); color: var(--tx2); --mdc-icon-size: 18px;
          transition: background .15s ease, color .15s ease, border-color .15s ease;
        }
        .modes button:hover { border-color: var(--mode-color, var(--off)); color: var(--tx); }
        .modes button.active { background: var(--mode-color); color: #fff; border-color: var(--mode-color); }
        .modes button.mixed { color: #fff; }
        .err { padding: 16px; color: var(--error-color, #db4437); font-size: 13px; }
      </style>
      <ha-card>
        <div class="modes left"></div>
        <div class="modes right"></div>
        <div class="body">
          <svg viewBox="0 0 200 190">
            <defs><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.4"/></filter></defs>
            ${
              dual
                ? `
            <circle class="selRing" cx="100" cy="100" r="94" style="display:none"></circle>
            <g class="glow glowB" filter="url(#glow)"></g>
            <g class="leds ledsB"></g>
            <path class="hit hitB" d="${arcPath(CX, CY, R_INNER, START, SWEEP)}" stroke-width="24"></path>
            <circle class="cur curB" r="2.2" style="display:none"></circle>
            <polygon class="tgt tgtB" style="display:none"></polygon>
            <g class="glow glowA" filter="url(#glow)"></g>
            <g class="leds ledsA"></g>
            <path class="hit hitA" d="${arcPath(CX, CY, R_OUTER, START, SWEEP)}" stroke-width="20"></path>
            <circle class="cur curA" r="2.6" style="display:none"></circle>
            <polygon class="tgt tgtA" style="display:none"></polygon>
            <g class="name nameA clickable"></g>
            <text class="target targetA" x="100" y="99"></text>
            <line class="sep" x1="72" y1="109" x2="128" y2="109" stroke="var(--off)" stroke-width="1"></line>
            <g class="name nameB clickable"></g>
            <text class="target targetB" x="100" y="146"></text>
            `
                : `
            <g class="glow glowA" filter="url(#glow)"></g>
            <g class="leds ledsA"></g>
            <g class="hl hlA"></g>
            <path class="hit hitA" d="${arcPath(CX, CY, R_SINGLE, START, SWEEP)}" stroke-width="40"></path>
            <circle class="cur curA" r="2.8" style="display:none"></circle>
            <polygon class="tgt tgtA" style="display:none"></polygon>
            <text class="name nameA" x="100" y="64"></text>
            <text class="target targetA" x="100" y="108"></text>
            <text class="sub subA" x="100" y="129"></text>
            `
            }
            <g class="btn minus" transform="translate(70 165)"><circle r="13"></circle><text>−</text></g>
            <g class="btn plus" transform="translate(130 165)"><circle r="13"></circle><text>+</text></g>
          </svg>
        </div>
        <div class="err" style="display:none"></div>
      </ha-card>`;

    const $ = (s) => root.querySelector(s);
    this._el = {
      card: $("ha-card"),
      svg: $("svg"),
      glowA: $(".glowA"),
      ledsA: $(".ledsA"),
      hlA: $(".hlA"),
      hitA: $(".hitA"),
      curA: $(".curA"),
      tgtA: $(".tgtA"),
      nameA: $(".nameA"),
      targetA: $(".targetA"),
      subA: $(".subA"),
      minus: $(".minus"),
      plus: $(".plus"),
      modesLeft: $(".modes.left"),
      modesRight: $(".modes.right"),
      body: $(".body"),
      err: $(".err"),
    };
    if (dual) {
      Object.assign(this._el, {
        glowB: $(".glowB"),
        ledsB: $(".ledsB"),
        hitB: $(".hitB"),
        curB: $(".curB"),
        tgtB: $(".tgtB"),
        nameB: $(".nameB"),
        targetB: $(".targetB"),
        selRing: $(".selRing"),
      });
    }

    this._el.minus.addEventListener("click", () => this._bump(-1));
    this._el.plus.addEventListener("click", () => this._bump(1));

    const attachDrag = (hitEl, key) => {
      hitEl.addEventListener("pointerdown", (e) => {
        this._dragging = key;
        this._active = key;
        this._el.svg.setPointerCapture(e.pointerId);
        this._onPointer(e);
      });
    };
    attachDrag(this._el.hitA, "a");
    if (dual) attachDrag(this._el.hitB, "b");

    this._el.svg.addEventListener("pointermove", (e) => {
      if (this._dragging) this._onPointer(e);
    });
    const end = () => {
      if (!this._dragging) return;
      this._dragging = null;
      this._commit();
    };
    this._el.svg.addEventListener("pointerup", end);
    this._el.svg.addEventListener("pointercancel", end);

    if (dual) {
      this._el.nameA.addEventListener("click", () => {
        this._active = "a";
        this._render();
      });
      this._el.nameB.addEventListener("click", () => {
        this._active = "b";
        this._render();
      });
    }

    const onModeClick = (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      this._hass.callService("climate", "set_hvac_mode", {
        entity_id: this._config.entity,
        hvac_mode: btn.dataset.mode,
      });
      if (this._dual) {
        this._hass.callService("climate", "set_hvac_mode", {
          entity_id: this._config.entity2,
          hvac_mode: btn.dataset.mode,
        });
      }
    };
    this._el.modesLeft.addEventListener("click", onModeClick);
    this._el.modesRight.addEventListener("click", onModeClick);

    this._built = true;
  }

  // ---------- Logik ----------
  _entityId(key) {
    return key === "b" ? this._config.entity2 : this._config.entity;
  }

  _range(key) {
    const a = this._hass.states[this._entityId(key)].attributes;
    const min = a.min_temp ?? 7;
    const max = a.max_temp ?? 35;
    const fahrenheit = this._hass.config?.unit_system?.temperature === "°F";
    const stepCfg = key === "b" ? this._config.step2 ?? this._config.step : this._config.step;
    const step = Number(stepCfg) || a.target_temp_step || (fahrenheit ? 1 : 0.5);
    return { min, max, step };
  }

  _snap(key, v) {
    const { min, max, step } = this._range(key);
    const snapped = Math.round(v / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(2));
  }

  _ringR(key) {
    return this._dual ? (key === "b" ? R_INNER : R_OUTER) : R_SINGLE;
  }

  _onPointer(e) {
    const key = this._dragging;
    if (!key) return;
    const R = this._ringR(key);
    const pt = this._el.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(this._el.svg.getScreenCTM().inverse());
    let ang = (Math.atan2(p.y - CY, p.x - CX) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    let rel = (ang - START + 360) % 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    const { min, max } = this._range(key);
    this._pending[key] = this._snap(key, min + (rel / SWEEP) * (max - min));
    this._render();
  }

  _bump(dir) {
    const key = this._active;
    const st = this._hass.states[this._entityId(key)];
    const { step } = this._range(key);
    const base = this._pending[key] ?? st.attributes.temperature;
    if (base == null) return;
    this._pending[key] = this._snap(key, base + dir * step);
    this._render();
    this._commit(key);
  }

  _commit(onlyKey) {
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => {
      ["a", "b"].forEach((key) => {
        if (onlyKey && key !== onlyKey) return;
        if (!this._dual && key === "b") return;
        if (this._pending[key] == null) return;
        this._hass.callService("climate", "set_temperature", {
          entity_id: this._entityId(key),
          temperature: this._pending[key],
        });
      });
      clearTimeout(this._clearTimer);
      this._clearTimer = setTimeout(() => {
        this._pending = { a: null, b: null };
        this._render();
      }, 2500);
    }, 600);
  }

  _fmt(v, step) {
    return Number(v).toFixed(step < 1 ? 1 : 0);
  }

  _flatColor(st, override) {
    if (override) return toCss(override, "#ff9012");
    const action = st.attributes.hvac_action;
    if (action === "heating") return "#ff9012";
    if (action === "cooling") return "#3ea6f6";
    if (action === "drying") return "#f0c020";
    if (st.state === "off" || st.state === "unavailable") return "#7c828d";
    return "#4fc98a";
  }

  // Liefert eine Funktion temp -> CSS-Farbe: Farbverlauf, falls color_stops
  // konfiguriert ist, sonst die flache Modus-/Konfigurationsfarbe.
  _colorFn(key, st) {
    const stopsCfg = key === "b" ? this._config.color_stops2 : this._config.color_stops;
    if (Array.isArray(stopsCfg) && stopsCfg.length >= 2) {
      const fn = buildGradientFn(stopsCfg);
      if (fn) return fn;
    }
    const override = key === "b" ? this._config.color2 : this._config.color;
    const flat = this._flatColor(st, override);
    return () => flat;
  }

  // ---------- Ein Ring zeichnen ----------
  _drawRing(key, st) {
    const el = this._el;
    const a = st.attributes;
    const { min, max, step } = this._range(key);
    const unavailable = st.state === "unavailable" || st.state === "unknown";
    const off = st.state === "off";
    const target = this._pending[key] ?? a.temperature;
    const cur = a.current_temperature ?? null;
    const active_ok = !off && !unavailable && target != null;
    const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min)));
    const colorFn = this._colorFn(key, st);
    const R = this._ringR(key);
    const segW = this._dual ? (key === "b" ? 7 : 9) : 11;

    const N = this._dual ? Math.max(18, Math.round(this._config.segments * (R / R_OUTER))) : this._config.segments;
    const stepDeg = SWEEP / N;
    const gapDeg = Math.min(2.2, stepDeg * 0.32);
    const swDeg = stepDeg - gapDeg;
    const tf = active_ok ? frac(target) : 0;
    let glow = "";
    let leds = "";
    let hl = "";
    for (let i = 0; i < N; i++) {
      const a0 = START + i * stepDeg + gapDeg / 2;
      const mid = (i + 0.5) / N;
      const temp = min + mid * (max - min);
      const d = arcPath(CX, CY, R, a0, swDeg);
      const color = colorFn(temp);
      if (active_ok && mid <= tf) {
        if (cur != null && temp <= cur) {
          glow += `<path d="${d}" stroke="${color}" stroke-width="${segW * 1.8}"/>`;
          leds += `<path class="led" d="${d}" stroke="${color}" stroke-width="${segW}"/>`;
          hl += `<path d="${arcPath(CX, CY, R - segW * 0.4, a0, swDeg)}"/>`;
        } else {
          leds += `<path class="led" d="${d}" stroke="${color}" stroke-width="${segW}" opacity=".32"/>`;
        }
      } else {
        leds += `<path class="led off" d="${d}" stroke-width="${segW}"/>`;
      }
    }
    el["glow" + (key === "b" ? "B" : "A")].innerHTML = glow;
    el["leds" + (key === "b" ? "B" : "A")].innerHTML = leds;
    if (el["hl" + (key === "b" ? "B" : "A")]) el["hl" + (key === "b" ? "B" : "A")].innerHTML = hl;

    const curEl = el["cur" + (key === "b" ? "B" : "A")];
    const tgtEl = el["tgt" + (key === "b" ? "B" : "A")];
    if (cur != null && cur >= min && cur <= max) {
      const [cx, cy] = polar(CX, CY, R - segW * 1.1, START + SWEEP * frac(cur));
      curEl.setAttribute("cx", cx.toFixed(2));
      curEl.setAttribute("cy", cy.toFixed(2));
      curEl.style.display = "";
    } else {
      curEl.style.display = "none";
    }
    if (active_ok) {
      const ta = START + SWEEP * frac(target);
      const pts = [
        polar(CX, CY, R + segW * 0.73, ta),
        polar(CX, CY, R + segW * 1.4, ta - 2.8),
        polar(CX, CY, R + segW * 1.4, ta + 2.8),
      ];
      tgtEl.setAttribute("points", pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "));
      tgtEl.style.display = "";
    } else {
      tgtEl.style.display = "none";
    }

    return { target, cur, unit: this._hass.config?.unit_system?.temperature || "°C", step, active_ok, unavailable, color: colorFn(target ?? min) };
  }

  // ---------- Darstellung ----------
  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const el = this._el;
    const stA = this._hass.states[this._config.entity];
    const stB = this._dual ? this._hass.states[this._config.entity2] : null;

    if (!stA || (this._dual && !stB)) {
      el.body.style.display = "none";
      el.err.style.display = "";
      el.err.textContent = `Entität nicht gefunden: ${!stA ? this._config.entity : this._config.entity2}`;
      return;
    }
    el.body.style.display = "";
    el.err.style.display = "none";
    el.card.classList.toggle("dark", this._config.face !== "theme");

    const infoA = this._drawRing("a", stA);

    if (!this._dual) {
      el.nameA.textContent = this._config.name || stA.attributes.friendly_name || "";
      el.targetA.innerHTML = infoA.active_ok
        ? `${this._fmt(infoA.target, infoA.step)}<tspan class="unit" dx="3" dy="-17">${infoA.unit}</tspan>`
        : infoA.unavailable
        ? "–"
        : "Aus";
      const parts = [];
      if (infoA.cur != null) parts.push(`${this._fmt(infoA.cur, infoA.step)} ${infoA.unit} ist`);
      if (infoA.active_ok) parts.push(ACTION_LABELS[stA.attributes.hvac_action] || MODE_LABELS[stA.state] || stA.state);
      el.subA.textContent = parts.join("  ·  ");

      const disabled = !infoA.active_ok;
      el.hitA.classList.toggle("disabled", disabled);
      el.minus.classList.toggle("disabled", disabled);
      el.plus.classList.toggle("disabled", disabled);
    } else {
      const infoB = this._drawRing("b", stB);
      const active = this._active;

      el.nameA.innerHTML = `<circle cx="-30" cy="-2.5" r="2.5" fill="${infoA.color}" style="${active === "a" ? "" : "opacity:.4"}"></circle><text x="-24" y="0" style="fill:${
        active === "a" ? infoA.color : "var(--tx2)"
      }">${(this._config.name || stA.attributes.friendly_name || "").toString()}</text>`;
      el.nameA.setAttribute("transform", "translate(100 76)");
      el.nameB.innerHTML = `<circle cx="-30" cy="-2.5" r="2.5" fill="${infoB.color}" style="${active === "b" ? "" : "opacity:.4"}"></circle><text x="-24" y="0" style="fill:${
        active === "b" ? infoB.color : "var(--tx2)"
      }">${(this._config.name2 || stB.attributes.friendly_name || "").toString()}</text>`;
      el.nameB.setAttribute("transform", "translate(100 124)");

      el.targetA.innerHTML = infoA.active_ok
        ? `${this._fmt(infoA.target, infoA.step)}<tspan class="unit" dx="2" dy="-10">${infoA.unit}</tspan>`
        : infoA.unavailable
        ? "–"
        : "Aus";
      el.targetB.innerHTML = infoB.active_ok
        ? `${this._fmt(infoB.target, infoB.step)}<tspan class="unit" dx="2" dy="-9">${infoB.unit}</tspan>`
        : infoB.unavailable
        ? "–"
        : "Aus";
      el.targetA.setAttribute("font-size", "26");
      el.targetB.setAttribute("font-size", "22");
      el.targetA.style.opacity = active === "a" ? "1" : ".55";
      el.targetB.style.opacity = active === "b" ? "1" : ".55";
      el.glowA.style.opacity = active === "a" ? "1" : ".55";
      el.ledsA.style.opacity = active === "a" ? "1" : ".55";
      el.glowB.style.opacity = active === "b" ? "1" : ".55";
      el.ledsB.style.opacity = active === "b" ? "1" : ".55";

      el.selRing.style.display = "";
      el.selRing.setAttribute("r", String((active === "a" ? R_OUTER : R_INNER) + 8));
      el.selRing.setAttribute("stroke", active === "a" ? infoA.color : infoB.color);

      const disabledActive = active === "a" ? !infoA.active_ok : !infoB.active_ok;
      el.minus.classList.toggle("disabled", disabledActive);
      el.plus.classList.toggle("disabled", disabledActive);
    }

    // Modus-Buttons: in den unteren Ecken, je zur Hälfte links/rechts gestapelt.
    // Im Doppel-Modus wirkt ein Klick auf beide Entitäten; Buttons zeigen einen
    // "gemischt"-Zustand (halb gefüllt), wenn A und B unterschiedliche Modi haben.
    const modesA = (stA.attributes.hvac_modes || []).filter((m) => m in MODE_ICONS);
    const modesB = this._dual ? (stB.attributes.hvac_modes || []).filter((m) => m in MODE_ICONS) : [];
    const modes = this._dual ? Array.from(new Set([...modesA, ...modesB])) : modesA;
    const showModes = this._config.show_modes !== false && modes.length > 1;
    el.modesLeft.style.display = showModes ? "" : "none";
    el.modesRight.style.display = showModes ? "" : "none";
    if (showModes) {
      const split = Math.ceil(modes.length / 2);
      const left = modes.slice(0, split);
      const right = modes.slice(split);
      const colorA = this._colorFn("a", stA)(stA.attributes.temperature ?? 20);
      const colorB = this._dual ? this._colorFn("b", stB)(stB.attributes.temperature ?? 20) : colorA;
      const render = (list) =>
        list
          .map((m) => {
            const onA = m === stA.state;
            const onB = this._dual ? m === stB.state : onA;
            let style = "";
            let cls = "";
            if (onA && onB) {
              cls = "active";
              style = `style="--mode-color:${onA ? colorA : colorB}"`;
            } else if (onA || onB) {
              cls = "mixed";
              const left_ = onA ? colorA : "var(--off)";
              const right_ = onB ? colorB : "var(--off)";
              style = `style="background:linear-gradient(90deg, ${left_} 50%, ${right_} 50%)"`;
            }
            return `<button data-mode="${m}" class="${cls}" ${style} title="${MODE_LABELS[m] || m}" aria-label="${MODE_LABELS[m] || m}">
               <ha-icon icon="${MODE_ICONS[m] || "mdi:thermostat"}"></ha-icon>
             </button>`;
          })
          .join("");
      const leftHtml = render(left);
      const rightHtml = render(right);
      if (el.modesLeft.innerHTML !== leftHtml) el.modesLeft.innerHTML = leftHtml;
      if (el.modesRight.innerHTML !== rightHtml) el.modesRight.innerHTML = rightHtml;
    }
  }
}

customElements.define("thermostat-dial-card", ThermostatDialCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-dial-card",
  name: "Thermostat Dial Card",
  description: "LED-Bogen-Thermostat-Karte für eine oder zwei climate-Entitäten",
  preview: true,
});

console.info(`%c THERMOSTAT-DIAL-CARD %c v${CARD_VERSION} `, "color:#fff;background:#ff9012;font-weight:700", "color:#ff9012");
