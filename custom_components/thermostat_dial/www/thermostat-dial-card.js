/* thermostat-dial-card v3 — Heizer-Thermostat mit LED-Bogen und 3 PWM-Zonen
 * Teil der Integration "Thermostat Dial" (wird automatisch geladen).
 * Vanilla JS, keine Abhängigkeiten.
 * Zonen, Leistung und Farben kommen aus den Attributen der climate-Entität,
 * Änderungen gehen über den Service thermostat_dial.set_setting.
 */
const CARD_VERSION = "2.0.1";

const START = 135;  // Winkel am Bogenanfang (unten links)
const SWEEP = 270;  // Bogenlänge in Grad
const R = 80;
const CX = 100;
const CY = 100;

const DEFAULT_COLORS = ["#e8590c", "#ff9f1a", "#ffd23f"];
const DEFAULTS = { gap12: 2, gap23: 0.5, period: 10, p1: 100, p2: 60, p3: 25 };
const LIMITS = {
  gap12: { min: 0.2, max: 5, step: 0.1 },
  gap23: { min: 0.1, max: 4.9, step: 0.1 },
  period: { min: 2, max: 30, step: 1 },
  p1: { min: 0, max: 100, step: 5 },
  p2: { min: 0, max: 100, step: 5 },
  p3: { min: 0, max: 100, step: 5 },
};

const MODE_ICONS = { off: "mdi:power", heat: "mdi:fire" };
const MODE_LABELS = { off: "Aus", heat: "Heizen" };

const polar = (deg, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

const arcPath = (fromDeg, sweep, r = R) => {
  if (sweep <= 0) return "";
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(fromDeg + sweep, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};

// Farbe aus Hex/CSS-String oder [r,g,b] (color_rgb-Selector des Editors)
const toCss = (c, fallback) => {
  if (Array.isArray(c) && c.length >= 3) return `rgb(${c[0]},${c[1]},${c[2]})`;
  if (typeof c === "string" && c.trim()) return c.replace(/["'<>;]/g, "").trim();
  return fallback;
};

const dutyLabel = (d) => (d >= 100 ? "Dauer an" : d <= 0 ? "Aus" : `PWM ${Math.round(d)} %`);

class ThermostatDialCard extends HTMLElement {
  constructor() {
    super();
    this._local = {};
    this._lt = {};
    this._pending = null;
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "climate", integration: "thermostat_dial" } } },
        { name: "name", selector: { text: {} } },
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
        { name: "color_1", selector: { color_rgb: {} } },
        { name: "color_2", selector: { color_rgb: {} } },
        { name: "color_3", selector: { color_rgb: {} } },
        { name: "step", selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box" } } },
        { name: "show_modes", selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Thermostat Dial (climate-Entität)",
          name: "Name",
          segments: "Anzahl LED-Segmente",
          face: "Zifferblatt",
          color_1: "Farbe Zone 1 (leer = Wert aus den Integrationsoptionen)",
          color_2: "Farbe Zone 2 (leer = Wert aus den Integrationsoptionen)",
          color_3: "Farbe Zone 3 (leer = Wert aus den Integrationsoptionen)",
          step: "Schrittweite (leer = Vorgabe der Entität)",
          show_modes: "Modus-Buttons anzeigen",
        }[s.name] || s.name),
    };
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).find(
      (id) => id.startsWith("climate.") && hass.states[id].attributes?.zone_settings
    );
    return { entity: entity || "climate.heizung", face: "dark" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("'entity' fehlt");
    const seg = Math.round(Number(config.segments) || 45);
    this._config = { face: "dark", show_modes: true, ...config, segments: Math.min(90, Math.max(12, seg)) };
    this._pending = null;
    this._last = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const obj = hass.states[this._config.entity];
    if (obj !== this._last) {
      this._last = obj;
      this._render();
    }
  }

  getCardSize() {
    return this._open ? 8 : 5;
  }

  // ---------- Einstellungen aus den Entity-Attributen ----------
  _attrs() {
    return this._hass?.states[this._config.entity]?.attributes || {};
  }

  _val(key) {
    if (this._local[key] != null) return this._local[key];
    const v = Number(this._attrs().zone_settings?.[key]);
    return Number.isFinite(v) ? v : DEFAULTS[key];
  }

  _limits(key) {
    return { ...LIMITS[key], ...(this._attrs().setting_limits?.[key] || {}) };
  }

  _send(key) {
    if (this._local[key] == null) return;
    this._hass.callService("thermostat_dial", "set_setting", {
      entity_id: this._config.entity,
      key,
      value: this._local[key],
    });
    clearTimeout(this._lt[key]);
    this._lt[key] = setTimeout(() => {
      delete this._local[key];
      this._render();
    }, 2500);
  }

  // ---------- Aufbau ----------
  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const items = [
      { key: "p1", zone: 0 },
      { key: "p2", zone: 1 },
      { key: "p3", zone: 2 },
      { key: "gap12" },
      { key: "gap23" },
      { key: "period" },
    ];
    const settings = items
      .map(
        (it) => `
        <div class="item" data-key="${it.key}">
          <div class="lbl">${it.zone != null ? `<i class="dot" data-zone="${it.zone}"></i>` : ""}<span class="t"></span><span class="v"></span></div>
          <input type="range">
        </div>`
      )
      .join("");

    root.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          --tx: var(--primary-text-color); --tx2: var(--secondary-text-color);
          --btn: var(--secondary-background-color, #eee); --off: var(--divider-color, #ddd);
          position: relative; padding: 12px 12px 16px; text-align: center;
        }
        ha-card.dark { --tx: #f0f0f0; --tx2: #9aa0a8; --btn: #2b2f35; --off: #31353b; background: #1b1d21; color: #f0f0f0; }
        svg { width: 100%; max-width: 320px; touch-action: none; user-select: none; -webkit-user-select: none; }
        .led { fill: none; stroke-width: 12; stroke-linecap: butt; }
        .led.off { stroke: var(--off); }
        .glow path { fill: none; stroke-width: 18; opacity: .6; }
        .hl path { fill: none; stroke: #fff; stroke-width: 2; opacity: .35; }
        .hit { fill: none; stroke: transparent; stroke-width: 36; cursor: pointer; }
        .cur { fill: var(--tx); }
        .tgt { fill: var(--tx); }
        .title { font-size: 12px; fill: var(--tx2); text-anchor: middle; }
        .target { font-size: 38px; font-weight: 300; fill: var(--tx); text-anchor: middle; }
        .unit { font-size: 14px; fill: var(--tx2); }
        .sub { font-size: 11px; fill: var(--tx2); text-anchor: middle; }
        .btn { cursor: pointer; }
        .btn circle { fill: var(--btn); }
        .btn text { font-size: 18px; fill: var(--tx); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
        .disabled { opacity: .4; pointer-events: none; }
        .modes { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
        .modes button {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
          background: var(--btn); color: var(--tx); --mdc-icon-size: 22px;
        }
        .modes button.active { background: var(--mode-color); color: #fff; }
        .modes button.active.idle { opacity: .55; }
        .gear {
          position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border: none; border-radius: 50%;
          background: transparent; color: var(--tx2); cursor: pointer; --mdc-icon-size: 20px;
        }
        .settings { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--off); text-align: left; color: var(--tx); }
        .item { padding: 6px 4px; }
        .lbl { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tx2); }
        .lbl .t { flex: 1; }
        .lbl .v { color: var(--tx); white-space: nowrap; }
        .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex: none; }
        input[type=range] { width: 100%; margin: 4px 0 0; accent-color: var(--primary-color); }
        .err { padding: 16px; color: var(--error-color, #db4437); }
        [hidden] { display: none !important; }
      </style>
      <ha-card>
        <button class="gear" title="PWM-Einstellungen" hidden><ha-icon icon="mdi:cog"></ha-icon></button>
        <div class="body">
          <svg viewBox="0 0 200 175">
            <defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs>
            <g class="glow" filter="url(#glow)"></g>
            <g class="leds"></g>
            <g class="hl"></g>
            <path class="hit" d="${arcPath(START, SWEEP)}"></path>
            <circle class="cur" r="3" style="display:none"></circle>
            <polygon class="tgt" style="display:none"></polygon>
            <text class="title" x="100" y="70"></text>
            <text class="target" x="100" y="108"></text>
            <text class="sub l1" x="100" y="124"></text>
            <text class="sub l2" x="100" y="137"></text>
            <g class="btn minus" transform="translate(76 156)"><circle r="12"></circle><text>−</text></g>
            <g class="btn plus" transform="translate(124 156)"><circle r="12"></circle><text>+</text></g>
          </svg>
          <div class="modes"></div>
          <div class="settings" hidden>${settings}</div>
        </div>
        <div class="err" style="display:none"></div>
      </ha-card>`;

    const $ = (s) => root.querySelector(s);
    this._el = {
      card: $("ha-card"),
      svg: $("svg"),
      glow: $(".glow"),
      leds: $(".leds"),
      hl: $(".hl"),
      hit: $(".hit"),
      cur: $(".cur"),
      tgt: $(".tgt"),
      title: $(".title"),
      target: $(".target"),
      l1: $(".l1"),
      l2: $(".l2"),
      minus: $(".minus"),
      plus: $(".plus"),
      modes: $(".modes"),
      body: $(".body"),
      err: $(".err"),
      gear: $(".gear"),
      settings: $(".settings"),
    };

    this._el.minus.addEventListener("click", () => this._bump(-1));
    this._el.plus.addEventListener("click", () => this._bump(1));

    this._el.hit.addEventListener("pointerdown", (e) => {
      this._dragging = true;
      this._el.svg.setPointerCapture(e.pointerId);
      this._onPointer(e);
    });
    this._el.svg.addEventListener("pointermove", (e) => {
      if (this._dragging) this._onPointer(e);
    });
    const end = () => {
      if (!this._dragging) return;
      this._dragging = false;
      this._commit();
    };
    this._el.svg.addEventListener("pointerup", end);
    this._el.svg.addEventListener("pointercancel", end);

    this._el.modes.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      this._hass.callService("climate", "set_hvac_mode", {
        entity_id: this._config.entity,
        hvac_mode: btn.dataset.mode,
      });
    });

    this._el.gear.addEventListener("click", () => {
      this._open = !this._open;
      this._el.settings.hidden = !this._open;
    });
    this._el.settings.hidden = !this._open;
    this._el.settings.addEventListener("input", (e) => {
      const inp = e.target.closest("input[type=range]");
      if (!inp) return;
      this._local[inp.closest(".item").dataset.key] = Number(inp.value);
      this._render();
    });
    this._el.settings.addEventListener("change", (e) => {
      const inp = e.target.closest("input[type=range]");
      if (inp) this._send(inp.closest(".item").dataset.key);
    });

    this._built = true;
  }

  // ---------- Logik ----------
  _range() {
    const a = this._attrs();
    const min = a.min_temp ?? 7;
    const max = a.max_temp ?? 35;
    const fahrenheit = this._hass.config?.unit_system?.temperature === "°F";
    const step = Number(this._config.step) || a.target_temp_step || (fahrenheit ? 1 : 0.5);
    return { min, max, step };
  }

  _snap(v) {
    const { min, max, step } = this._range();
    const snapped = Math.round(v / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(2));
  }

  _onPointer(e) {
    const pt = this._el.svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(this._el.svg.getScreenCTM().inverse());
    let ang = (Math.atan2(p.y - CY, p.x - CX) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    let rel = (ang - START + 360) % 360;
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    const { min, max } = this._range();
    this._pending = this._snap(min + (rel / SWEEP) * (max - min));
    this._render();
  }

  _bump(dir) {
    const { step } = this._range();
    const base = this._pending ?? this._attrs().temperature;
    if (base == null) return;
    this._pending = this._snap(base + dir * step);
    this._render();
    this._commit();
  }

  _commit() {
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => {
      if (this._pending == null) return;
      this._hass.callService("climate", "set_temperature", {
        entity_id: this._config.entity,
        temperature: this._pending,
      });
      clearTimeout(this._clearTimer);
      this._clearTimer = setTimeout(() => {
        this._pending = null;
        this._render();
      }, 2500);
    }, 600);
  }

  _fmt(v, step) {
    return Number(v).toFixed(step < 1 ? 1 : 0);
  }

  // ---------- Darstellung ----------
  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const el = this._el;
    const st = this._hass.states[this._config.entity];

    if (!st) {
      el.body.style.display = "none";
      el.err.style.display = "";
      el.err.textContent = `Entität nicht gefunden: ${this._config.entity}`;
      return;
    }
    el.body.style.display = "";
    el.err.style.display = "none";
    el.card.classList.toggle("dark", this._config.face !== "theme");

    const a = st.attributes;
    const hasZones = !!a.zone_settings;
    el.gear.hidden = !hasZones;
    if (!hasZones) el.settings.hidden = true;

    const { min, max, step } = this._range();
    const unit = this._hass.config?.unit_system?.temperature || "°C";
    const unavailable = st.state === "unavailable" || st.state === "unknown";
    const off = st.state === "off";
    const target = this._pending ?? a.temperature;
    const cur = a.current_temperature ?? null;
    const colors = [1, 2, 3].map((i) =>
      toCss(this._config["color_" + i] ?? a.zone_colors?.[i - 1], DEFAULT_COLORS[i - 1])
    );
    const active_ok = !off && !unavailable && target != null;
    const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min)));

    // Zonen relativ zum Sollwert (gleiche Logik wie im Regler der Integration)
    const gap12 = this._val("gap12");
    const gap23 = this._val("gap23");
    const b1 = active_ok ? target - gap12 : 0;
    const b2 = active_ok ? target - gap23 : 0;
    let zone = -1;
    if (active_ok && cur != null && cur < target) {
      const d = target - cur;
      zone = d > gap12 ? 0 : d > gap23 ? 1 : 2;
    }
    const duty = zone >= 0 ? this._val("p" + (zone + 1)) : 0;

    // LED-Segmente
    const N = this._config.segments;
    const stepDeg = SWEEP / N;
    const gapDeg = Math.min(2, stepDeg * 0.3);
    const swDeg = stepDeg - gapDeg;
    const tf = active_ok ? frac(target) : 0;
    let glow = "";
    let leds = "";
    let hl = "";
    for (let i = 0; i < N; i++) {
      const a0 = START + i * stepDeg + gapDeg / 2;
      const mid = (i + 0.5) / N;
      const temp = min + mid * (max - min);
      const d = arcPath(a0, swDeg);
      if (active_ok && mid <= tf) {
        const col = colors[temp < b1 ? 0 : temp < b2 ? 1 : 2];
        if (cur != null && temp <= cur) {
          glow += `<path d="${d}" stroke="${col}"/>`;
          leds += `<path class="led" d="${d}" stroke="${col}"/>`;
          hl += `<path d="${arcPath(a0, swDeg, R - 3)}"/>`;
        } else {
          leds += `<path class="led" d="${d}" stroke="${col}" opacity=".3"/>`;
        }
      } else {
        leds += `<path class="led off" d="${d}"/>`;
      }
    }
    el.glow.innerHTML = glow;
    el.leds.innerHTML = leds;
    el.hl.innerHTML = hl;

    // Marker
    if (cur != null && cur >= min && cur <= max) {
      const [cx, cy] = polar(START + SWEEP * frac(cur), R - 13);
      el.cur.setAttribute("cx", cx.toFixed(2));
      el.cur.setAttribute("cy", cy.toFixed(2));
      el.cur.style.display = "";
    } else {
      el.cur.style.display = "none";
    }
    if (active_ok) {
      const ta = START + SWEEP * frac(target);
      const pts = [polar(ta, R + 9), polar(ta - 3.2, R + 17), polar(ta + 3.2, R + 17)];
      el.tgt.setAttribute("points", pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "));
      el.tgt.style.display = "";
    } else {
      el.tgt.style.display = "none";
    }

    // Texte
    el.title.textContent = this._config.name || a.friendly_name || "";
    el.target.innerHTML = active_ok
      ? `${this._fmt(target, step)}<tspan class="unit" dx="2" dy="-14">${unit}</tspan>`
      : unavailable
      ? "–"
      : "Aus";
    el.l1.textContent = cur != null ? `Ist ${this._fmt(cur, step)} ${unit}` : "";
    if (!active_ok) el.l2.textContent = "";
    else if (zone < 0) el.l2.textContent = "Soll erreicht";
    else el.l2.textContent = hasZones ? `Zone ${zone + 1} · ${dutyLabel(duty)}` : `Zone ${zone + 1}`;

    // Bedienbarkeit
    const disabled = !active_ok;
    el.hit.classList.toggle("disabled", disabled);
    el.minus.classList.toggle("disabled", disabled);
    el.plus.classList.toggle("disabled", disabled);

    // Modus-Buttons: Flamme in Zonenfarbe, gedimmt solange der Heizer gerade pausiert
    const modes = (a.hvac_modes || []).filter((m) => m in MODE_ICONS);
    const showModes = this._config.show_modes !== false && modes.length > 1;
    el.modes.style.display = showModes ? "" : "none";
    if (showModes) {
      const idle = a.heater_on === undefined ? zone < 0 : !a.heater_on;
      el.modes.style.setProperty("--mode-color", zone >= 0 ? colors[zone] : "var(--off)");
      const html = modes
        .map(
          (m) =>
            `<button data-mode="${m}" class="${m === st.state ? "active" : ""}${m === st.state && idle && m === "heat" ? " idle" : ""}" title="${MODE_LABELS[m] || m}">
               <ha-icon icon="${MODE_ICONS[m]}"></ha-icon>
             </button>`
        )
        .join("");
      if (el.modes.innerHTML !== html) el.modes.innerHTML = html;
    }

    if (hasZones) this._renderSettings(colors, gap12, gap23);
  }

  _renderSettings(colors, gap12, gap23) {
    this._el.settings.querySelectorAll(".item").forEach((item) => {
      const key = item.dataset.key;
      const lim = this._limits(key);
      const inp = item.querySelector("input");
      const v = this._val(key);
      inp.min = lim.min;
      inp.max = lim.max;
      inp.step = lim.step;
      if (Number(inp.value) !== v) inp.value = v;

      const t = item.querySelector(".t");
      const val = item.querySelector(".v");
      if (/^p[123]$/.test(key)) {
        const z = Number(key[1]) - 1;
        item.querySelector(".dot").style.background = colors[z];
        t.textContent =
          z === 0
            ? `Zone 1 · über ${gap12.toFixed(1)} K unter Soll`
            : z === 1
            ? `Zone 2 · ${gap23.toFixed(1)} bis ${gap12.toFixed(1)} K`
            : `Zone 3 · unter ${gap23.toFixed(1)} K`;
        val.textContent = dutyLabel(v);
      } else if (key === "period") {
        t.textContent = "Zykluszeit";
        val.textContent = `${Math.round(v)} min`;
      } else {
        t.textContent = key === "gap12" ? "Grenze Zone 1 / 2" : "Grenze Zone 2 / 3";
        val.textContent = `${v.toFixed(1)} K`;
      }
    });
  }
}

if (!customElements.get("thermostat-dial-card")) {
  customElements.define("thermostat-dial-card", ThermostatDialCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "thermostat-dial-card",
    name: "Thermostat Dial Card",
    description: "Heizer-Thermostat mit LED-Bogen, 3 PWM-Zonen und wählbaren Zonenfarben",
    preview: true,
  });

  console.info(`%c THERMOSTAT-DIAL-CARD %c v${CARD_VERSION} `, "color:#fff;background:#ff8100;font-weight:700", "color:#ff8100");
}
