from unittest.mock import patch

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.thermostat_dial.const import DOMAIN

from .test_thermostat import CLIMATE, HEATER, SENSOR, _register_heater_services


async def test_user_flow(hass: HomeAssistant) -> None:
    hass.config.components.update({"http", "frontend"})
    _register_heater_services(hass)
    hass.states.async_set(SENSOR, "20", {"device_class": "temperature"})
    hass.states.async_set(HEATER, "off")

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM

    bad = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            "name": "Heizung",
            "temperature_sensor": SENSOR,
            "heater": HEATER,
            "min_temp": 30,
            "max_temp": 10,
            "target_temp_step": 0.5,
        },
    )
    assert bad["errors"] == {"base": "min_max"}

    with patch("custom_components.thermostat_dial.async_register_card"):
        done = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {
                "name": "Heizung",
                "temperature_sensor": SENSOR,
                "heater": HEATER,
                "min_temp": 7,
                "max_temp": 30,
                "target_temp_step": 0.5,
            },
        )
        await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert done["title"] == "Heizung"
    assert done["data"]["heater"] == HEATER
    assert hass.states.get(CLIMATE) is not None


async def test_options_flow_colors_reload(hass: HomeAssistant) -> None:
    hass.config.components.update({"http", "frontend"})
    _register_heater_services(hass)
    hass.states.async_set(SENSOR, "20", {"device_class": "temperature"})
    hass.states.async_set(HEATER, "off")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Heizung",
        data={"temperature_sensor": SENSOR, "heater": HEATER, "min_temp": 7, "max_temp": 30, "target_temp_step": 0.5},
        options={"settings": {"p2": 70}},
    )
    entry.add_to_hass(hass)
    with patch("custom_components.thermostat_dial.async_register_card"):
        await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

        result = await hass.config_entries.options.async_init(entry.entry_id)
        assert result["type"] is FlowResultType.FORM
        done = await hass.config_entries.options.async_configure(
            result["flow_id"],
            {
                "temperature_sensor": SENSOR,
                "heater": HEATER,
                "min_temp": 7,
                "max_temp": 30,
                "target_temp_step": 0.5,
                "min_pulse_s": 45,
                "color_1": [255, 0, 0],
                "color_2": [0, 255, 0],
                "color_3": [0, 0, 255],
            },
        )
        await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    attrs = hass.states.get(CLIMATE).attributes
    assert attrs["zone_colors"] == ["#ff0000", "#00ff00", "#0000ff"]
    assert attrs["zone_settings"]["p2"] == 70  # Einstellungen bleiben erhalten
    assert entry.runtime_data.min_pulse_s == 45
