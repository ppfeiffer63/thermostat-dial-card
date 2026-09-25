# Changelog

## 4.2.0

- Zweite climate-Entität (`entity2`) verwaltbar: konzentrischer Doppel-Bogen (außen `entity`, innen `entity2`), jeweils eigener Soll-/Ist-Wert
- Tap auf einen Ring oder seinen Namen aktiviert ihn — nur der aktive Ring reagiert auf +/-, der inaktive wird gedimmt dargestellt; ein gepunkteter Auswahlring markiert die aktive Entität
- Ziehen direkt am jeweiligen Bogen steuert immer diesen, unabhängig vom aktiven Ring
- Modus-Buttons wirken im Doppel-Modus auf beide Entitäten gleichzeitig und zeigen einen "gemischt"-Zustand (halb gefüllt), wenn beide unterschiedliche Modi haben
- Neu: Farbverlauf über `color_stops` (bzw. `color_stops2`) — Liste aus `{temp, color}`, zwischen den Stützpunkten wird linear interpoliert, statt einer festen Bogenfarbe
- Neue optionale Optionen: `entity2`, `name2`, `color2`, `step2`, `color_stops`, `color_stops2`
- Ohne `entity2` verhält sich die Karte unverändert wie v4.1.0 (ein Bogen, volle Größe)

## 4.1.0

- Modus-Buttons in die unteren Ecken der Karte verschoben (nicht mehr als eigene Zeile darunter)
- Bogenradius vergrößert (78 → 86), der gewonnene Platz kommt dem LED-Bogen zugute
- Bei mehr als zwei Modi werden die Buttons automatisch zur Hälfte links/rechts gestapelt

## 4.0.1

- Optik überarbeitet: runde LED-Kappen statt abgeschnittener Enden, stärkerer Glow
- Titel jetzt kleines Label in Versalien, Ist-Temperatur und Status klar getrennt in einer Zeile
- Größere +/- Buttons mit Rand und Klick-Feedback, Modus-Buttons mit Rand und Hover-Zustand
- Mehr Innenabstand, dunkles Zifferblatt farblich nachgezogen (#16181c)

## 4.0.0

- Rückbau von der HACS-Integration auf eine einfache Dashboard-Card ohne Zonen/PWM
- Karte bindet an eine beliebige `climate`-Entität, keine eigene Regelung mehr
- Bogenfarbe automatisch nach `hvac_action` oder fest wählbar (`color`)
- README: Hinweis zum Einrichten einer climate-Entität über den Generic-Thermostat-Helper

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
