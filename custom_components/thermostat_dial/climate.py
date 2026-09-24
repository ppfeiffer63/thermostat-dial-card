"""Climate-Entität: Soll, Ist, Heizen/Aus und Zonen-Attribute für die Karte."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.climate import (
    ClimateEntity,
    ClimateEntityFeature,
    HVACAction,
    HVACMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_TEMPERATURE, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_platform
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DEFAULT_SETTINGS, DOMAIN, SERVICE_SET_SETTING, SETTING_LIMITS
from .controller import ThermostatController


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    controller: ThermostatController = entry.runtime_data
    async_add_entities([ThermostatDialClimate(entry, controller)])

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        SERVICE_SET_SETTING,
        {
            vol.Required("key"): vol.In(list(DEFAULT_SETTINGS)),
            vol.Required("value"): vol.Coerce(float),
        },
        "async_set_setting",
    )


class ThermostatDialClimate(ClimateEntity, RestoreEntity):
    """Heizer-Thermostat mit Zonen-PWM."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_should_poll = False
    _attr_hvac_modes = [HVACMode.HEAT, HVACMode.OFF]
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.TURN_ON
        | ClimateEntityFeature.TURN_OFF
    )

    def __init__(self, entry: ConfigEntry, controller: ThermostatController) -> None:
        self._entry = entry
        self._controller = controller
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Thermostat Dial",
            model="Zonen-PWM-Thermostat",
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self._controller.async_add_listener(self.async_write_ha_state))

        last = await self.async_get_last_state()
        mode = HVACMode.OFF
        target = None
        if last is not None:
            if last.state == HVACMode.HEAT:
                mode = HVACMode.HEAT
            if last.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                try:
                    target = float(last.attributes.get(ATTR_TEMPERATURE))
                except (TypeError, ValueError):
                    target = None
        self._controller.async_restore(mode, target)

    # ---------- Zustand ----------
    @property
    def temperature_unit(self) -> str:
        return self.hass.config.units.temperature_unit

    @property
    def min_temp(self) -> float:
        return self._controller.min_temp

    @property
    def max_temp(self) -> float:
        return self._controller.max_temp

    @property
    def target_temperature_step(self) -> float:
        return self._controller.step

    @property
    def precision(self) -> float:
        return 0.1

    @property
    def current_temperature(self) -> float | None:
        return self._controller.current

    @property
    def target_temperature(self) -> float | None:
        return self._controller.target

    @property
    def hvac_mode(self) -> HVACMode:
        return self._controller.hvac_mode

    @property
    def hvac_action(self) -> HVACAction:
        if self._controller.hvac_mode == HVACMode.OFF:
            return HVACAction.OFF
        return HVACAction.HEATING if self._controller.heater_on else HVACAction.IDLE

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        c = self._controller
        return {
            "zone": c.zone,
            "duty": c.duty,
            "heater": c.heater_entity,
            "heater_on": c.heater_on,
            "zone_settings": dict(c.settings),
            "setting_limits": {
                key: {"min": lo, "max": hi, "step": step, "unit": unit}
                for key, (lo, hi, step, unit) in SETTING_LIMITS.items()
            },
            "zone_colors": c.colors,
        }

    # ---------- Kommandos ----------
    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        await self._controller.async_set_hvac_mode(hvac_mode)

    async def async_set_temperature(self, **kwargs: Any) -> None:
        if (temperature := kwargs.get(ATTR_TEMPERATURE)) is None:
            return
        await self._controller.async_set_target(temperature)

    async def async_set_setting(self, key: str, value: float) -> None:
        """Entity-Service thermostat_dial.set_setting."""
        await self._controller.async_set_setting(key, value)
