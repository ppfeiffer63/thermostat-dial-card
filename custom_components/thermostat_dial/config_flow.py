"""Einrichtung und Optionen über die Oberfläche."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_COLORS,
    CONF_HEATER,
    CONF_MAX_TEMP,
    CONF_MIN_PULSE,
    CONF_MIN_TEMP,
    CONF_SENSOR,
    CONF_STEP,
    DEFAULT_COLORS,
    DEFAULT_MAX_TEMP,
    DEFAULT_MIN_PULSE,
    DEFAULT_MIN_TEMP,
    DEFAULT_NAME,
    DEFAULT_STEP,
    DOMAIN,
)


def _hex_to_rgb(value: str) -> list[int]:
    value = value.lstrip("#")
    return [int(value[i : i + 2], 16) for i in (0, 2, 4)]


def _number(min_: float, max_: float, step: float, unit: str | None = None):
    config = selector.NumberSelectorConfig(
        min=min_, max=max_, step=step, mode=selector.NumberSelectorMode.BOX
    )
    if unit:
        config["unit_of_measurement"] = unit
    return selector.NumberSelector(config)


def _base_fields() -> dict:
    return {
        vol.Required(CONF_SENSOR): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="temperature")
        ),
        vol.Required(CONF_HEATER): selector.EntitySelector(
            selector.EntitySelectorConfig(domain=["switch", "light", "input_boolean"])
        ),
        vol.Required(CONF_MIN_TEMP, default=DEFAULT_MIN_TEMP): _number(-10, 40, 0.5),
        vol.Required(CONF_MAX_TEMP, default=DEFAULT_MAX_TEMP): _number(0, 50, 0.5),
        vol.Required(CONF_STEP, default=DEFAULT_STEP): _number(0.1, 5, 0.1),
    }


def _validate(user_input: dict[str, Any]) -> dict[str, str]:
    if float(user_input[CONF_MIN_TEMP]) >= float(user_input[CONF_MAX_TEMP]):
        return {"base": "min_max"}
    return {}


class ThermostatDialConfigFlow(ConfigFlow, domain=DOMAIN):
    """Neuen Thermostat anlegen."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> OptionsFlow:
        return ThermostatDialOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                data = {k: v for k, v in user_input.items() if k != CONF_NAME}
                return self.async_create_entry(title=user_input[CONF_NAME], data=data)

        schema = vol.Schema({vol.Required(CONF_NAME, default=DEFAULT_NAME): str, **_base_fields()})
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema, user_input),
            errors=errors,
        )


class ThermostatDialOptionsFlow(OptionsFlow):
    """Sensor, Heizer, Temperaturgrenzen, Mindestimpuls und Zonenfarben ändern."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self.config_entry
        if user_input is not None:
            errors = _validate(user_input)
            if not errors:
                return self.async_create_entry(data={**entry.options, **user_input})

        fields = {
            **_base_fields(),
            vol.Required(CONF_MIN_PULSE, default=DEFAULT_MIN_PULSE): _number(0, 600, 5, "s"),
        }
        for key in CONF_COLORS:
            fields[vol.Optional(key)] = selector.ColorRGBSelector()
        schema = vol.Schema(fields)

        current = {**entry.data, **entry.options}
        suggestions: dict[str, Any] = dict(user_input or current)
        for i, key in enumerate(CONF_COLORS):
            value = suggestions.get(key)
            if value is None:
                suggestions[key] = _hex_to_rgb(DEFAULT_COLORS[i])
            elif isinstance(value, str):
                suggestions[key] = _hex_to_rgb(value)
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(schema, suggestions),
            errors=errors,
        )
