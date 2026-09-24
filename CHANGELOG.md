# Changelog

## 2.0.0

- LED-Bogen mit einstellbarer Segmentzahl, Glow und dunklem oder Theme-Zifferblatt
- Drei Zonen relativ zum Sollwert, Farben im Editor wählbar
- Einstellungsmenü für Leistung je Zone, Zonengrenzen und PWM-Zykluszeit (schreibt in `input_number`-Helper)
- Nur Heizbetrieb (Heizen / Aus), Flamme zeigt den echten Schaltzustand des Heizers
- HA-Package mit Helpern, virtuellem Thermostat und PWM-Automation (`examples/heizung_pwm.yaml`)
