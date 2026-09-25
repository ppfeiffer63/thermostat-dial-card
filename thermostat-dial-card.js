/* thermostat-dial-card — einfache Lovelace-Thermostat-Karte
 * LED-Bogen im SteelSeries-Stil für eine beliebige climate-Entität.
 * Vanilla JS, keine Abhängigkeiten, keine Zonen/PWM — das übernimmt die
 * Entität selbst (z. B. ein "Generic Thermostat"-Helper).
 */
const CARD_VERSION = "4.1.0";

const START = 135;  // Winkel am Bogenanfang (unten links)
const SWEEP = 270;  // Bogenlänge in Grad
const R = 86;
const CX = 100;
const CY = 100;

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

const toCss = (c, fallback) => {
  if (Array.isArray(c) && c.length >= 3) return `rgb(${c[0]},${c[1]},${c[2]})`;
  if (typeof c === "string" && c.trim()) return c.replace(/["'<>;]/g, "").trim();
  return fallback;
};

class ThermostatDialCard extends HTMLElement {
  constructor() {
    super();
    this._pending = null;
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
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
        { name: "color", selector: { color_rgb: {} } },
        { name: "step", selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box" } } },
        { name: "show_modes", selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Climate-Entität (Soll, Ist, Modus)",
          name: "Name",
          segments: "Anzahl LED-Segmente",
          face: "Zifferblatt",
          color: "Bogenfarbe (leer = automatisch nach Modus)",
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
    return 5;
  }

  // ---------- Aufbau ----------
  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
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
        .led { fill: none; stroke-width: 11; stroke-linecap: round; }
        .led.off { stroke: var(--off); }
        .glow path { fill: none; stroke-width: 20; stroke-linecap: round; opacity: .35; }
        .hl path { fill: none; stroke: rgba(255,255,255,.5); stroke-width: 1.6; stroke-linecap: round; }
        .hit { fill: none; stroke: transparent; stroke-width: 40; cursor: grab; }
        .hit.disabled { cursor: default; }
        .cur { fill: var(--tx); opacity: .9; }
        .tgt { fill: var(--tx); }
        .name { font-size: 11.5px; font-weight: 500; letter-spacing: .04em; fill: var(--tx2); text-anchor: middle; text-transform: uppercase; }
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
        .err { padding: 16px; color: var(--error-color, #db4437); font-size: 13px; }
      </style>
      <ha-card>
        <div class="modes left"></div>
        <div class="modes right"></div>
        <div class="body">
          <svg viewBox="0 0 200 190">
            <defs><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.4"/></filter></defs>
            <g class="glow" filter="url(#glow)"></g>
            <g class="leds"></g>
            <g class="hl"></g>
            <path class="hit" d="${arcPath(START, SWEEP)}"></path>
            <circle class="cur" r="2.8" style="display:none"></circle>
            <polygon class="tgt" style="display:none"></polygon>
            <text class="name" x="100" y="64"></text>
            <text class="target" x="100" y="108"></text>
            <text class="sub" x="100" y="129"></text>
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
      glow: $(".glow"),
      leds: $(".leds"),
      hl: $(".hl"),
      hit: $(".hit"),
      cur: $(".cur"),
      tgt: $(".tgt"),
      name: $(".name"),
      target: $(".target"),
      sub: $(".sub"),
      minus: $(".minus"),
      plus: $(".plus"),
      modesLeft: $(".modes.left"),
      modesRight: $(".modes.right"),
      body: $(".body"),
      err: $(".err"),
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

    const onModeClick = (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      this._hass.callService("climate", "set_hvac_mode", {
        entity_id: this._config.entity,
        hvac_mode: btn.dataset.mode,
      });
    };
    this._el.modesLeft.addEventListener("click", onModeClick);
    this._el.modesRight.addEventListener("click", onModeClick);

    this._built = true;
  }

  // ---------- Logik ----------
  _range() {
    const a = this._hass.states[this._config.entity].attributes;
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
    const st = this._hass.states[this._config.entity];
    const { step } = this._range();
    const base = this._pending ?? st.attributes.temperature;
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

  _color(st) {
    if (this._config.color) return toCss(this._config.color, "#ff9012");
    const action = st.attributes.hvac_action;
    if (action === "heating") return "#ff9012";
    if (action === "cooling") return "#3ea6f6";
    if (action === "drying") return "#f0c020";
    if (st.state === "off" || st.state === "unavailable") return "#7c828d";
    return "#4fc98a";
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
    const { min, max, step } = this._range();
    const unit = this._hass.config?.unit_system?.temperature || "°C";
    const unavailable = st.state === "unavailable" || st.state === "unknown";
    const off = st.state === "off";
    const target = this._pending ?? a.temperature;
    const cur = a.current_temperature ?? null;
    const active_ok = !off && !unavailable && target != null;
    const frac = (v) => Math.min(1, Math.max(0, (v - min) / (max - min)));
    const color = this._color(st);

    // LED-Segmente
    const N = this._config.segments;
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
      const d = arcPath(a0, swDeg);
      if (active_ok && mid <= tf) {
        if (cur != null && temp <= cur) {
          glow += `<path d="${d}" stroke="${color}"/>`;
          leds += `<path class="led" d="${d}" stroke="${color}"/>`;
          hl += `<path d="${arcPath(a0, swDeg, R - 3.5)}"/>`;
        } else {
          leds += `<path class="led" d="${d}" stroke="${color}" opacity=".32"/>`;
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
      const [cx, cy] = polar(START + SWEEP * frac(cur), R - 12);
      el.cur.setAttribute("cx", cx.toFixed(2));
      el.cur.setAttribute("cy", cy.toFixed(2));
      el.cur.style.display = "";
    } else {
      el.cur.style.display = "none";
    }
    if (active_ok) {
      const ta = START + SWEEP * frac(target);
      const pts = [polar(ta, R + 8), polar(ta - 3, R + 15), polar(ta + 3, R + 15)];
      el.tgt.setAttribute("points", pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "));
      el.tgt.style.display = "";
    } else {
      el.tgt.style.display = "none";
    }

    // Texte
    el.name.textContent = this._config.name || a.friendly_name || "";
    el.target.innerHTML = active_ok
      ? `${this._fmt(target, step)}<tspan class="unit" dx="3" dy="-17">${unit}</tspan>`
      : unavailable
      ? "–"
      : "Aus";
    const parts = [];
    if (cur != null) parts.push(`${this._fmt(cur, step)} ${unit} ist`);
    if (active_ok) parts.push(ACTION_LABELS[a.hvac_action] || MODE_LABELS[st.state] || st.state);
    el.sub.textContent = parts.join("  ·  ");

    // Bedienbarkeit
    const disabled = !active_ok;
    el.hit.classList.toggle("disabled", disabled);
    el.minus.classList.toggle("disabled", disabled);
    el.plus.classList.toggle("disabled", disabled);

    // Modus-Buttons: in den unteren Ecken, je zur Hälfte links/rechts gestapelt
    const modes = (a.hvac_modes || []).filter((m) => m in MODE_ICONS);
    const showModes = this._config.show_modes !== false && modes.length > 1;
    el.modesLeft.style.display = showModes ? "" : "none";
    el.modesRight.style.display = showModes ? "" : "none";
    if (showModes) {
      const split = Math.ceil(modes.length / 2);
      const left = modes.slice(0, split);
      const right = modes.slice(split);
      const render = (list) =>
        list
          .map((m) => {
            const active = m === st.state;
            const mc = active ? `style="--mode-color:${color}"` : "";
            return `<button data-mode="${m}" class="${active ? "active" : ""}" ${mc} title="${MODE_LABELS[m] || m}" aria-label="${MODE_LABELS[m] || m}">
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
  description: "LED-Bogen-Thermostat-Karte für eine beliebige climate-Entität",
  preview: true,
});

console.info(`%c THERMOSTAT-DIAL-CARD %c v${CARD_VERSION} `, "color:#fff;background:#ff9012;font-weight:700", "color:#ff9012");
