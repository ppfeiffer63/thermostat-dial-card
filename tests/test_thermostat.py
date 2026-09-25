import asyncio
from datetime import timedelta
from unittest.mock import patch

from homeassistant.components.climate import HVACAction, HVACMode
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
    mock_restore_cache,
)
from homeassistant.core import State

from custom_components.thermostat_dial.const import (
    CONF_HEATER,
    CONF_MAX_TEMP,
    CONF_MIN_TEMP,
    CONF_SENSOR,
    CONF_STEP,
    DOMAIN,
)

SENSOR = "sensor.temp"
HEATER = "switch.heizer"
CLIMATE = "climate.heizung"


def _register_heater_services(hass: HomeAssistant) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []

    async def turn_on(call: ServiceCall) -> None:
        calls.append(("on", call.data["entity_id"]))
        hass.states.async_set(call.data["entity_id"], "on")

    async def turn_off(call: ServiceCall) -> None:
        calls.append(("off", call.data["entity_id"]))
        hass.states.async_set(call.data["entity_id"], "off")

    hass.services.async_register("homeassistant", "turn_on", turn_on)
    hass.services.async_register("homeassistant", "turn_off", turn_off)
    return calls


async def _setup(hass: HomeAssistant, sensor="20.3", options=None) -> tuple[MockConfigEntry, list]:
    hass.config.components.update({"http", "frontend"})
    calls = _register_heater_services(hass)
    hass.states.async_set(SENSOR, sensor, {"device_class": "temperature", "unit_of_measurement": "°C"})
    hass.states.async_set(HEATER, "off")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Heizung",
        data={CONF_SENSOR: SENSOR, CONF_HEATER: HEATER, CONF_MIN_TEMP: 7, CONF_MAX_TEMP: 30, CONF_STEP: 0.5},
        options=options or {},
    )
    entry.add_to_hass(hass)
    with patch("custom_components.thermostat_dial.async_register_card"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await _settle(hass)
    return entry, calls


async def _settle(hass: HomeAssistant) -> None:
    """Hintergrund-Task des Reglers wird von async_block_till_done nicht abgewartet."""
    for _ in range(5):
        await asyncio.sleep(0)
        await hass.async_block_till_done()


async def _tick(hass: HomeAssistant, freezer, seconds: float) -> None:
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass, dt_util.utcnow())
    await _settle(hass)


async def _heat(hass: HomeAssistant, target: float) -> None:
    await hass.services.async_call(
        "climate", "set_temperature", {"entity_id": CLIMATE, "temperature": target}, blocking=True
    )
    await hass.services.async_call(
        "climate", "set_hvac_mode", {"entity_id": CLIMATE, "hvac_mode": "heat"}, blocking=True
    )
    await _settle(hass)


async def test_entities_and_defaults(hass: HomeAssistant) -> None:
    await _setup(hass)
    state = hass.states.get(CLIMATE)
    assert state is not None
    assert state.state == HVACMode.OFF
    assert state.attributes["min_temp"] == 7
    assert state.attributes["max_temp"] == 30
    assert state.attributes["current_temperature"] == 20.3
    assert state.attributes["zone_settings"]["p2"] == 60
    assert state.attributes["zone_colors"] == ["#e8590c", "#ff9f1a", "#ffd23f"]
    numbers = [s for s in hass.states.async_entity_ids("number")]
    assert len(numbers) == 6


async def test_pwm_zone_2(hass: HomeAssistant, freezer) -> None:
    await _setup(hass)  # Ist 20.3
    await _heat(hass, 21.5)  # Abstand 1.2 -> Zone 2, 60 %, Zyklus 10 min
    assert hass.states.get(CLIMATE).attributes["zone"] == 2
    assert hass.states.get(CLIMATE).attributes["duty"] == 60
    assert hass.states.get(HEATER).state == "on"
    assert hass.states.get(CLIMATE).attributes["hvac_action"] == HVACAction.HEATING

    await _tick(hass, freezer, 359)
    assert hass.states.get(HEATER).state == "on"
    await _tick(hass, freezer, 2)  # 361 s: Ende der An-Phase
    assert hass.states.get(HEATER).state == "off"
    assert hass.states.get(CLIMATE).attributes["hvac_action"] == HVACAction.IDLE
    await _tick(hass, freezer, 240)  # Ende der Aus-Phase: neuer Zyklus
    assert hass.states.get(HEATER).state == "on"


async def test_zone_1_continuous_and_target_reached(hass: HomeAssistant, freezer) -> None:
    await _setup(hass, sensor="18.0")
    await _heat(hass, 21.5)  # Abstand 3.5 -> Zone 1, 100 %
    assert hass.states.get(CLIMATE).attributes["zone"] == 1
    assert hass.states.get(HEATER).state == "on"
    await _tick(hass, freezer, 61)
    assert hass.states.get(HEATER).state == "on"

    # Soll erreicht: sofort aus, ohne auf das Phasenende zu warten
    hass.states.async_set(SENSOR, "21.6", {"device_class": "temperature"})
    await _settle(hass)
    assert hass.states.get(HEATER).state == "off"
    assert hass.states.get(CLIMATE).attributes["zone"] is None


async def test_sensor_lost_turns_heater_off(hass: HomeAssistant) -> None:
    await _setup(hass, sensor="18.0")
    await _heat(hass, 21.5)
    assert hass.states.get(HEATER).state == "on"
    hass.states.async_set(SENSOR, "unavailable")
    await _settle(hass)
    assert hass.states.get(HEATER).state == "off"


async def test_hvac_off_turns_heater_off(hass: HomeAssistant) -> None:
    await _setup(hass, sensor="18.0")
    await _heat(hass, 21.5)
    assert hass.states.get(HEATER).state == "on"
    await hass.services.async_call(
        "climate", "set_hvac_mode", {"entity_id": CLIMATE, "hvac_mode": "off"}, blocking=True
    )
    await _settle(hass)
    assert hass.states.get(HEATER).state == "off"
    assert hass.states.get(CLIMATE).state == HVACMode.OFF


async def test_set_setting_service_persists_without_reload(hass: HomeAssistant) -> None:
    entry, _ = await _setup(hass)
    controller = entry.runtime_data
    await hass.services.async_call(
        DOMAIN, "set_setting", {"entity_id": CLIMATE, "key": "p2", "value": 40}, blocking=True
    )
    await hass.async_block_till_done()
    assert entry.runtime_data is controller  # kein Reload
    assert entry.options["settings"]["p2"] == 40
    assert hass.states.get(CLIMATE).attributes["zone_settings"]["p2"] == 40

    registry = er.async_get(hass)
    number_id = registry.async_get_entity_id("number", DOMAIN, f"{entry.entry_id}_p2")
    assert float(hass.states.get(number_id).state) == 40.0

    # Grenzen bleiben konsistent (Grenze 1/2 > Grenze 2/3)
    await hass.services.async_call(
        DOMAIN, "set_setting", {"entity_id": CLIMATE, "key": "gap12", "value": 0.3}, blocking=True
    )
    s = hass.states.get(CLIMATE).attributes["zone_settings"]
    assert s["gap12"] > s["gap23"]


async def test_number_entity_sets_setting(hass: HomeAssistant) -> None:
    entry, _ = await _setup(hass)
    registry = er.async_get(hass)
    number_id = registry.async_get_entity_id("number", DOMAIN, f"{entry.entry_id}_period")
    await hass.services.async_call(
        "number", "set_value", {"entity_id": number_id, "value": 20}, blocking=True
    )
    assert entry.runtime_data.settings["period"] == 20


async def test_restore_state(hass: HomeAssistant) -> None:
    mock_restore_cache(hass, [State(CLIMATE, "heat", {"temperature": 22.5})])
    await _setup(hass, sensor="18.0")
    state = hass.states.get(CLIMATE)
    assert state.state == HVACMode.HEAT
    assert state.attributes["temperature"] == 22.5
    assert hass.states.get(HEATER).state == "on"


async def test_settings_survive_reload(hass: HomeAssistant) -> None:
    entry, _ = await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_setting", {"entity_id": CLIMATE, "key": "p3", "value": 45}, blocking=True
    )
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(CLIMATE).attributes["zone_settings"]["p3"] == 45


async def test_unload_turns_heater_off(hass: HomeAssistant) -> None:
    entry, _ = await _setup(hass, sensor="18.0")
    await _heat(hass, 21.5)
    assert hass.states.get(HEATER).state == "on"
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(HEATER).state == "off"
