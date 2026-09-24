"""Reine Regel-Logik ohne Home-Assistant-Abhängigkeiten (leicht testbar)."""

from __future__ import annotations

from typing import Literal

Mode = Literal["off", "on", "pwm"]


def compute_zone(
    target: float | None,
    current: float | None,
    gap12: float,
    gap23: float,
) -> int | None:
    """Zone 1..3 nach Abstand (Soll - Ist), None wenn nicht geheizt werden soll."""
    if target is None or current is None:
        return None
    delta = target - current
    if delta <= 0:
        return None
    if delta > gap12:
        return 1
    if delta > gap23:
        return 2
    return 3


def zone_duty(zone: int | None, settings: dict[str, float]) -> float:
    """Leistung der Zone in Prozent (0 wenn keine Zone aktiv)."""
    if zone is None:
        return 0.0
    return float(settings[f"p{zone}"])


def plan_phase(duty: float, period_s: int, min_s: int) -> tuple[Mode, int, int]:
    """Nächste Schaltphase bestimmen.

    Rückgabe (modus, wert1, wert2):
      ("off", wartezeit, 0)  Heizer aus, danach neu bewerten
      ("on", wartezeit, 0)   Heizer dauerhaft an, danach neu bewerten
      ("pwm", an_s, aus_s)   erst an_s an, dann aus_s aus, danach neu bewerten
    Zu kurze Impulse (unter min_s) werden nicht geschaltet.
    """
    on_s = round(period_s * duty / 100)
    off_s = period_s - on_s
    wait = min(60, period_s)
    if duty <= 0 or on_s < min_s:
        return ("off", wait, 0)
    if duty >= 100 or off_s < min_s:
        return ("on", wait, 0)
    return ("pwm", on_s, off_s)
