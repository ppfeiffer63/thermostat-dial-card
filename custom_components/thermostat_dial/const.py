"""Konstanten für Thermostat Dial."""

from __future__ import annotations

DOMAIN = "thermostat_dial"

CONF_SENSOR = "temperature_sensor"
CONF_HEATER = "heater"
CONF_MIN_TEMP = "min_temp"
CONF_MAX_TEMP = "max_temp"
CONF_STEP = "target_temp_step"
CONF_MIN_PULSE = "min_pulse_s"
CONF_COLORS = ("color_1", "color_2", "color_3")
CONF_SETTINGS = "settings"

DEFAULT_NAME = "Heizung"
DEFAULT_MIN_TEMP = 7.0
DEFAULT_MAX_TEMP = 30.0
DEFAULT_STEP = 0.5
DEFAULT_MIN_PULSE = 30
DEFAULT_TARGET = 20.0
DEFAULT_COLORS = ("#e8590c", "#ff9f1a", "#ffd23f")

# Zonen relativ zum Sollwert (Abstand = Soll - Ist):
#   gap12: Abstand größer als dieser Wert -> Zone 1
#   gap23: Abstand größer als dieser Wert -> Zone 2, sonst Zone 3
#   period: PWM-Zykluszeit in Minuten
#   p1..p3: Leistung je Zone in Prozent (0 = aus, 100 = Dauer an)
DEFAULT_SETTINGS: dict[str, float] = {
    "gap12": 2.0,
    "gap23": 0.5,
    "period": 10,
    "p1": 100,
    "p2": 60,
    "p3": 25,
}

# key -> (min, max, step, unit)
SETTING_LIMITS: dict[str, tuple[float, float, float, str]] = {
    "gap12": (0.2, 5.0, 0.1, "K"),
    "gap23": (0.1, 4.9, 0.1, "K"),
    "period": (2, 30, 1, "min"),
    "p1": (0, 100, 5, "%"),
    "p2": (0, 100, 5, "%"),
    "p3": (0, 100, 5, "%"),
}

URL_BASE = "/thermostat_dial"
CARD_FILE = "thermostat-dial-card.js"
SERVICE_SET_SETTING = "set_setting"
