"""Thermostat Dial: Heizer-Thermostat mit Zonen-PWM und mitgelieferter Lovelace-Karte."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import CARD_FILE, CONF_SETTINGS, DOMAIN, URL_BASE
from .controller import ThermostatController

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.CLIMATE, Platform.NUMBER]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type ThermostatDialConfigEntry = ConfigEntry[ThermostatController]


async def async_register_card(hass: HomeAssistant) -> None:
    """Karte unter /thermostat_dial/ ausliefern und in jedes Dashboard laden."""
    integration = await async_get_integration(hass, DOMAIN)
    www = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(www), cache_headers=False)]
    )
    add_extra_js_url(hass, f"{URL_BASE}/{CARD_FILE}?v={integration.version}")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    await async_register_card(hass)
    return True


def _signature(entry: ConfigEntry) -> tuple:
    """Alle Werte außer den Zonen-Einstellungen: nur deren Änderung braucht einen Reload."""
    merged = {**entry.data, **entry.options}
    return tuple(sorted((k, str(v)) for k, v in merged.items() if k != CONF_SETTINGS))


async def async_setup_entry(hass: HomeAssistant, entry: ThermostatDialConfigEntry) -> bool:
    controller = ThermostatController(hass, entry)
    entry.runtime_data = controller
    await controller.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    signature = _signature(entry)

    async def _async_options_updated(hass: HomeAssistant, updated: ConfigEntry) -> None:
        # Zonen-Einstellungen werden im Betrieb ohne Reload übernommen.
        if _signature(updated) != signature:
            await hass.config_entries.async_reload(updated.entry_id)

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ThermostatDialConfigEntry) -> bool:
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        await entry.runtime_data.async_stop()
    return unload_ok
