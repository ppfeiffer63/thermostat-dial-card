# Thermostat Dial Card

Lovelace-Thermostat-Karte für einen **Heizer** (kein Kühlen) mit LED-Bogen im SteelSeries-Stil.
Der Bogen ist in **3 Zonen** mit frei wählbaren Farben geteilt. Für jede Zone stellst du die
Heizleistung ein (Aus, PWM oder Dauer an). Die PWM-Logik läuft in Home Assistant, die Karte
liest und schreibt nur die Einstellungen.

## Funktionen

- LED-Bogen mit einstellbarer Segmentzahl (24 bis 72), Glow und dunklem oder Theme-Zifferblatt
- Soll per Ziehen am Bogen oder mit +/- einstellen, Ist als Punkt im Bogen
- 3 Zonen relativ zum Sollwert, Farben im visuellen Editor wählbar
- Einstellungsmenü (Zahnrad): Leistung je Zone, Zonengrenzen, PWM-Zykluszeit
- Modus-Buttons (Heizen / Aus), Flamme zeigt den echten Schaltzustand des Heizers
- Keine Abhängigkeiten, Vanilla JS

## Installation

### HACS (Custom Repository)

HACS liest nur GitHub. Der Spiegel liegt unter `ppfeiffer63/thermostat-dial-card`,
das Original hier auf Forgejo.

1. HACS, Menü (drei Punkte), **Benutzerdefinierte Repositories**
2. Repository `https://github.com/ppfeiffer63/thermostat-dial-card`, Typ **Dashboard**
3. Karte herunterladen und Browser-Cache leeren

Updates erscheinen in HACS, sobald ein neues Release auf GitHub liegt.

### Manuell

`thermostat-dial-card.js` nach `/config/www/` kopieren und unter Einstellungen, Dashboards,
Ressourcen als JavaScript-Modul eintragen: `/local/thermostat-dial-card.js`

## Konfiguration

```yaml
type: custom:thermostat-dial-card
entity: climate.heizung_wohnzimmer
heater: switch.heizung
pwm_prefix: heizung
face: dark
segments: 45
color_1: "#e8590c"
color_2: "#ff9f1a"
color_3: "#ffd23f"
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Climate-Entität (Soll, Ist, Modus) |
| `name` | Friendly Name | Anzeigename |
| `heater` | | Heizer-Schalter, zeigt den echten Schaltzustand |
| `pwm_prefix` | | Präfix der Helper, aktiviert das Einstellungsmenü |
| `segments` | `45` | Anzahl LED-Segmente |
| `face` | `dark` | `dark` oder `theme` |
| `color_1` bis `color_3` | Orange, Amber, Gelb | Zonenfarben als Hex-Wert oder per Farbwähler im Editor |
| `step` | Vorgabe der Entität | Schrittweite des Sollwerts |
| `show_modes` | `true` | Modus-Buttons anzeigen |

## PWM in Home Assistant

Das Package [`examples/heizung_pwm.yaml`](examples/heizung_pwm.yaml) legt Helper, einen virtuellen
Thermostat und die Automation an. Ablage unter `/config/packages/`, zwei Entitäten anpassen
(Temperatursensor und Heizer-Schalter), HA neu starten.

Zonen nach Abstand = Soll minus Ist:

| Zone | Bedingung | Standard |
| --- | --- | --- |
| 1 | Abstand größer als Grenze 1/2 (2,0 K) | Dauer an |
| 2 | Abstand zwischen Grenze 2/3 und 1/2 | PWM 60 % |
| 3 | Abstand bis Grenze 2/3 (0,5 K) | PWM 25 % |
| aus | Ist erreicht Soll | Heizer aus |

Leistung 0 % heißt aus, 100 % Dauer an, dazwischen wird pro Zykluszeit (Standard 10 min)
anteilig ein- und ausgeschaltet. Impulse unter 30 s werden nicht geschaltet, um das Relais zu schonen.

Der Climate-Regler darf den echten Heizer nicht selbst schalten. Er steuert nur den virtuellen
Schalter, den echten Heizer schaltet ausschließlich die Automation.

## Entwicklung und Releases

Entwickelt wird auf Forgejo (`HA-Addons/thermostat-dial-card`). Der Workflow **HACS Release**
zählt die Version hoch, setzt den Tag und legt das Forgejo-Release mit dem JS als Asset an.
Der Tag löst **GitHub Sync (HACS)** aus, das main, Tag und Release nach GitHub spiegelt.

Benötigte Secrets: `RELEASE_TOKEN` (Forgejo) und `GH_MIRROR_TOKEN` (GitHub).

## Lizenz

MIT
