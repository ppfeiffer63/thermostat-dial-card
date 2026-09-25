# Changelog

## 3.0.0

- Umbau von "Card + separates YAML-Package" auf eine echte HACS-Integration (`custom_components/thermostat_dial`)
- Eigene `climate`-Entität mit PWM-Schaltschleife in Python statt YAML-Automation
- 6 `number`-Entitäten (Zonengrenzen, Zykluszeit, Leistung je Zone), Werte überstehen Neustarts
- Einrichtung und Optionen über die Oberfläche (Config- und Options-Flow), inkl. Zonenfarben
- Service `thermostat_dial.set_setting`
- Karte wird von der Integration automatisch als Frontend-Ressource geladen
- Karte liest Zonen/Leistung/Farben jetzt aus den Entity-Attributen statt aus `input_number`-Helpern
- Sofortiges Abschalten des Heizers bei erreichtem Soll, verlorenem Sensor oder Regler-Aus
- Mindestimpulslänge gegen zu kurzes Schalten des Relais
- Getestet mit `pytest-homeassistant-custom-component` gegen Home Assistant 2025.1

## 2.0.0

- LED-Bogen mit einstellbarer Segmentzahl, Glow und dunklem oder Theme-Zifferblatt
- Drei Zonen relativ zum Sollwert, Farben im Editor wählbar
- Einstellungsmenü für Leistung je Zone, Zonengrenzen und PWM-Zykluszeit (schreibt in `input_number`-Helper)
- Nur Heizbetrieb (Heizen / Aus), Flamme zeigt den echten Schaltzustand des Heizers
- HA-Package mit Helpern, virtuellem Thermostat und PWM-Automation (`examples/heizung_pwm.yaml`)
