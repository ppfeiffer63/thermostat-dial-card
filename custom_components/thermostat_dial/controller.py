"""Regler: Zustand, Einstellungen und die PWM-Schaltschleife."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging

from homeassistant.components.climate import HVACMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    SERVICE_TURN_OFF,
    SERVICE_TURN_ON,
    STATE_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Event, HomeAssistant, State, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later, async_track_state_change_event

from .const import (
    CONF_COLORS,
    CONF_HEATER,
    CONF_MAX_TEMP,
    CONF_MIN_PULSE,
    CONF_MIN_TEMP,
    CONF_SENSOR,
    CONF_SETTINGS,
    CONF_STEP,
    DEFAULT_COLORS,
    DEFAULT_MAX_TEMP,
    DEFAULT_MIN_PULSE,
    DEFAULT_MIN_TEMP,
    DEFAULT_SETTINGS,
    DEFAULT_STEP,
    DEFAULT_TARGET,
    DOMAIN,
    SETTING_LIMITS,
)
from .logic import compute_zone, plan_phase, zone_duty

_LOGGER = logging.getLogger(__name__)


def rgb_to_hex(value: list[int] | tuple[int, ...] | str | None, fallback: str) -> str:
    """[r, g, b] oder Hex-String nach #rrggbb."""
    if isinstance(value, str) and value.startswith("#"):
        return value
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        r, g, b = (max(0, min(255, int(v))) for v in value[:3])
        return f"#{r:02x}{g:02x}{b:02x}"
    return fallback


class ThermostatController:
    """Hält Soll, Ist, Modus, Zonen-Einstellungen und schaltet den Heizer per PWM."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.settings: dict[str, float] = {
            **DEFAULT_SETTINGS,
            **entry.options.get(CONF_SETTINGS, {}),
        }
        self.hvac_mode: HVACMode = HVACMode.OFF
        self.target: float | None = self._clip(DEFAULT_TARGET)
        self.current: float | None = None
        self.heater_on = False
        self._task: asyncio.Task | None = None
        self._listeners: list[Callable[[], None]] = []
        self._unsubs: list[Callable[[], None]] = []

    # ---------- Konfiguration ----------
    def _opt(self, key: str, default):
        return self.entry.options.get(key, self.entry.data.get(key, default))

    @property
    def sensor_entity(self) -> str:
        return self._opt(CONF_SENSOR, "")

    @property
    def heater_entity(self) -> str:
        return self._opt(CONF_HEATER, "")

    @property
    def min_temp(self) -> float:
        return float(self._opt(CONF_MIN_TEMP, DEFAULT_MIN_TEMP))

    @property
    def max_temp(self) -> float:
        return float(self._opt(CONF_MAX_TEMP, DEFAULT_MAX_TEMP))

    @property
    def step(self) -> float:
        return float(self._opt(CONF_STEP, DEFAULT_STEP))

    @property
    def min_pulse_s(self) -> int:
        return int(self._opt(CONF_MIN_PULSE, DEFAULT_MIN_PULSE))

    @property
    def colors(self) -> list[str]:
        return [
            rgb_to_hex(self._opt(key, None), DEFAULT_COLORS[i])
            for i, key in enumerate(CONF_COLORS)
        ]

    # ---------- abgeleitete Werte ----------
    @property
    def zone(self) -> int | None:
        if self.hvac_mode != HVACMode.HEAT:
            return None
        return compute_zone(
            self.target, self.current, self.settings["gap12"], self.settings["gap23"]
        )

    @property
    def duty(self) -> float:
        return zone_duty(self.zone, self.settings)

    def _clip(self, value: float) -> float:
        return max(self.min_temp, min(self.max_temp, value))

    # ---------- Listener ----------
    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)

        @callback
        def remove() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return remove

    @callback
    def async_notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    # ---------- Lebenszyklus ----------
    async def async_start(self) -> None:
        """Sensor und Heizer beobachten."""
        self.current = self._parse_temp(self.hass.states.get(self.sensor_entity))
        heater = self.hass.states.get(self.heater_entity)
        self.heater_on = heater is not None and heater.state == STATE_ON
        self._unsubs.append(
            async_track_state_change_event(self.hass, [self.sensor_entity], self._on_sensor)
        )
        self._unsubs.append(
            async_track_state_change_event(self.hass, [self.heater_entity], self._on_heater)
        )

    async def async_stop(self) -> None:
        """Schleife beenden, Heizer ausschalten."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        await self._cancel_task()
        await self._set_heater(False)

    @callback
    def async_restore(self, mode: HVACMode, target: float | None) -> None:
        """Zustand nach Neustart wiederherstellen."""
        self.hvac_mode = mode
        if target is not None:
            self.target = self._clip(target)
        self._restart()
        self.async_notify()

    # ---------- Kommandos ----------
    async def async_set_hvac_mode(self, mode: HVACMode) -> None:
        if mode not in (HVACMode.HEAT, HVACMode.OFF):
            raise ValueError(f"Nicht unterstützter Modus: {mode}")
        self.hvac_mode = mode
        self._restart()
        self.async_notify()

    async def async_set_target(self, temperature: float) -> None:
        self.target = self._clip(float(temperature))
        self._restart()
        self.async_notify()

    async def async_set_setting(self, key: str, value: float) -> None:
        if key not in DEFAULT_SETTINGS:
            raise ValueError(f"Unbekannte Einstellung: {key}")
        lo, hi, step, _unit = SETTING_LIMITS[key]
        value = max(lo, min(hi, float(value)))
        value = round(round(value / step) * step, 2)
        if key in ("period", "p1", "p2", "p3"):
            value = int(round(value))
        self.settings[key] = value
        self._normalize_gaps(key)
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, CONF_SETTINGS: dict(self.settings)}
        )
        self._restart()
        self.async_notify()

    def _normalize_gaps(self, changed: str) -> None:
        """Grenze 1/2 muss größer als Grenze 2/3 bleiben."""
        g12, g23 = self.settings["gap12"], self.settings["gap23"]
        if g12 > g23:
            return
        if changed == "gap12":
            self.settings["gap23"] = max(0.1, round(g12 - 0.1, 2))
        else:
            self.settings["gap12"] = min(5.0, round(g23 + 0.1, 2))

    # ---------- Ereignisse ----------
    @staticmethod
    def _parse_temp(state: State | None) -> float | None:
        if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN, ""):
            return None
        try:
            return float(state.state)
        except ValueError:
            return None

    @callback
    def _on_sensor(self, event: Event) -> None:
        old_zone = self.zone
        self.current = self._parse_temp(event.data.get("new_state"))
        new_zone = self.zone
        self.async_notify()
        if self.hvac_mode != HVACMode.HEAT:
            return
        # Sofort neu bewerten, wenn der Heizer stoppen muss (Soll erreicht oder Sensor weg).
        # Andere Zonenwechsel gelten erst zur nächsten Phase, damit ein verrauschter
        # Sensor an einer Zonengrenze den PWM-Zyklus nicht ständig neu startet.
        if self.current is None or (old_zone is not None and new_zone is None):
            self._restart()

    @callback
    def _on_heater(self, event: Event) -> None:
        state = event.data.get("new_state")
        self.heater_on = state is not None and state.state == STATE_ON
        self.async_notify()

    # ---------- Schaltschleife ----------
    def _restart(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None
        if self.hvac_mode == HVACMode.HEAT:
            self._task = self.entry.async_create_background_task(
                self.hass, self._run(), f"{DOMAIN}_{self.entry.entry_id}_pwm"
            )
        else:
            self.hass.async_create_task(self._set_heater(False))

    async def _cancel_task(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        while self.hvac_mode == HVACMode.HEAT:
            duty = zone_duty(
                compute_zone(
                    self.target,
                    self.current,
                    self.settings["gap12"],
                    self.settings["gap23"],
                ),
                self.settings,
            )
            period_s = int(self.settings["period"] * 60)
            mode, first, second = plan_phase(duty, period_s, self.min_pulse_s)
            if mode == "off":
                await self._set_heater(False)
                await self._sleep(first)
            elif mode == "on":
                await self._set_heater(True)
                await self._sleep(first)
            else:
                await self._set_heater(True)
                await self._sleep(first)
                await self._set_heater(False)
                await self._sleep(second)

    async def _sleep(self, seconds: float) -> None:
        """Abbrechbares Warten über HA-Zeitgeber (im Test per Zeitsprung steuerbar)."""
        future: asyncio.Future[None] = self.hass.loop.create_future()

        @callback
        def _done(_now) -> None:
            if not future.done():
                future.set_result(None)

        cancel = async_call_later(self.hass, seconds, _done)
        try:
            await future
        finally:
            cancel()

    async def _set_heater(self, on: bool) -> None:
        if not self.heater_entity or on == self.heater_on:
            return
        try:
            await self.hass.services.async_call(
                "homeassistant",
                SERVICE_TURN_ON if on else SERVICE_TURN_OFF,
                {"entity_id": self.heater_entity},
                blocking=True,
            )
        except HomeAssistantError as err:
            _LOGGER.warning("Heizer %s schalten fehlgeschlagen: %s", self.heater_entity, err)
