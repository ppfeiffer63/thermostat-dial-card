from custom_components.thermostat_dial.logic import compute_zone, plan_phase, zone_duty


def test_zones():
    assert compute_zone(21.5, 18.0, 2.0, 0.5) == 1
    assert compute_zone(21.5, 19.5, 2.0, 0.5) == 2  # Abstand genau an der Grenze: Zone 2
    assert compute_zone(21.5, 20.3, 2.0, 0.5) == 2
    assert compute_zone(21.5, 21.0, 2.0, 0.5) == 3
    assert compute_zone(21.5, 21.5, 2.0, 0.5) is None
    assert compute_zone(21.5, 23.0, 2.0, 0.5) is None
    assert compute_zone(None, 20, 2.0, 0.5) is None
    assert compute_zone(21.5, None, 2.0, 0.5) is None


def test_duty():
    s = {"p1": 100, "p2": 60, "p3": 25}
    assert zone_duty(1, s) == 100
    assert zone_duty(2, s) == 60
    assert zone_duty(3, s) == 25
    assert zone_duty(None, s) == 0


def test_plan_phase():
    assert plan_phase(60, 600, 30) == ("pwm", 360, 240)
    assert plan_phase(25, 600, 30) == ("pwm", 150, 450)
    assert plan_phase(100, 600, 30) == ("on", 60, 0)
    assert plan_phase(0, 600, 30) == ("off", 60, 0)
    # zu kurzer Impuls: 5 % von 2 min = 6 s < 30 s -> aus
    assert plan_phase(5, 120, 30) == ("off", 60, 0)
    # zu kurze Pause: 98 % von 10 min -> 12 s aus < 30 s -> dauer an
    assert plan_phase(98, 600, 30) == ("on", 60, 0)
    # kurzer Zyklus begrenzt die Wartezeit
    assert plan_phase(0, 30, 5) == ("off", 30, 0)
