"""Number-Entitäten für Zonengrenzen, Leistung je Zone und Zykluszeit."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DEFAULT_SETTINGS, DOMAIN, SETTING_LIMITS
from .controller import ThermostatController


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    controller: ThermostatController = entry.runtime_data
    async_add_entities(
        ThermostatDialSetting(entry, controller, key) for key in DEFAULT_SETTINGS
    )


class ThermostatDialSetting(NumberEntity):
    """Eine Zonen-Einstellung des Reglers."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_mode = NumberMode.BOX
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: ConfigEntry, controller: ThermostatController, key: str) -> None:
        lo, hi, step, unit = SETTING_LIMITS[key]
        self._controller = controller
        self._key = key
        self._attr_translation_key = key
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_native_min_value = lo
        self._attr_native_max_value = hi
        self._attr_native_step = step
        self._attr_native_unit_of_measurement = unit
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)})

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._controller.async_add_listener(self.async_write_ha_state))

    @property
    def native_value(self) -> float:
        return self._controller.settings[self._key]

    async def async_set_native_value(self, value: float) -> None:
        await self._controller.async_set_setting(self._key, value)
