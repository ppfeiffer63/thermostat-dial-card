# Thermostat Dial

Home-Assistant-Integration für einen **Heizer-Thermostat** (kein Kühlen) mit Zonen-PWM und
mitgelieferter Lovelace-Karte. Die PWM-Logik läuft als Python in der Integration, nicht als
YAML-Automation. Die Karte wird automatisch geladen, es ist keine Ressource einzutragen.

## Funktionen

- `climate`-Entität mit Heizen und Aus, PWM-Schaltschleife in Python
- 3 Zonen relativ zum Sollwert, je Zone Leistung 0–100 % (Aus, PWM, Dauer an)
- 6 `number`-Entitäten für Zonengrenzen, Zykluszeit und Leistung je Zone, Werte überstehen Neustarts
- Service `thermostat_dial.set_setting` für Automationen und die Karte
- Mindestimpulslänge (Standard 30 s), um das Relais zu schonen
- Einrichtung und Optionen über die Oberfläche: Sensor, Heizer-Schalter, Temperaturgrenzen, Zonenfarben
- Karte: LED-Bogen im SteelSeries-Stil, einstellbare Segmentzahl, Soll per Ziehen oder +/-, Zahnrad für PWM-Einstellungen

## Installation

### HACS (Custom Repository)

HACS liest nur GitHub. Der Spiegel liegt unter `ppfeiffer63/thermostat-dial-card`,
das Original hier auf Forgejo.

1. HACS, Menü (drei Punkte), **Benutzerdefinierte Repositories**
2. Repository `https://github.com/ppfeiffer63/thermostat-dial-card`, Typ **Integration**
3. Installieren und Home Assistant neu starten

Updates erscheinen in HACS, sobald ein neues Release auf GitHub liegt.

### Manuell

`custom_components/thermostat_dial/` nach `/config/custom_components/thermostat_dial/` kopieren
und Home Assistant neu starten.

## Einrichtung

Einstellungen, Geräte & Dienste, Integration hinzufügen, **Thermostat Dial** suchen.

- **Temperatursensor**: ein `sensor` mit `device_class: temperature`
- **Heizer-Schalter**: `switch`, `light` oder `input_boolean`
- **Min/Max-Solltemperatur** und **Schrittweite**

Danach legt die Integration eine `climate`-Entität und sechs `number`-Entitäten an. Über die
Optionen der Integration lassen sich Sensor, Heizer, Temperaturgrenzen, Mindestimpuls und die
drei Zonenfarben ändern.

## Karte

Die Karte registriert sich beim Start von Home Assistant selbst und erscheint im Karten-Editor
als **Thermostat Dial Card**.

```yaml
type: custom:thermostat-dial-card
entity: climate.heizung
face: dark
segments: 45
color_1: "#e8590c"
color_2: "#ff9f1a"
color_3: "#ffd23f"
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | climate-Entität der Integration |
| `name` | Friendly Name | Anzeigename |
| `segments` | `45` | Anzahl LED-Segmente |
| `face` | `dark` | `dark` oder `theme` |
| `color_1` bis `color_3` | Werte aus den Integrationsoptionen | Zonenfarben überschreiben, als Hex-Wert oder per Farbwähler |
| `step` | Vorgabe der Entität | Schrittweite des Sollwerts |
| `show_modes` | `true` | Modus-Buttons anzeigen |

Zonen, Leistung und Grenzen zeigt und ändert die Karte über das Zahnrad; sie liest sie aus den
Attributen der Entität und schreibt sie über `thermostat_dial.set_setting`.

## Zonen-PWM

Zonen nach Abstand = Soll minus Ist:

| Zone | Bedingung | Standard |
| --- | --- | --- |
| 1 | Abstand größer als Grenze 1/2 (2,0 K) | Dauer an |
| 2 | Abstand zwischen Grenze 2/3 und 1/2 | PWM 60 % |
| 3 | Abstand bis Grenze 2/3 (0,5 K) | PWM 25 % |
| aus | Ist erreicht Soll | Heizer aus |

Leistung 0 % heißt aus, 100 % Dauer an, dazwischen wird pro Zykluszeit (Standard 10 min) anteilig
ein- und ausgeschaltet. Impulse unter dem Mindestimpuls (Standard 30 s) werden nicht geschaltet.
Wird der Sensor nicht verfügbar oder der Regler auf Aus gestellt, schaltet die Integration den
Heizer sofort aus.

## Service

```yaml
service: thermostat_dial.set_setting
target:
  entity_id: climate.heizung
data:
  key: p2      # gap12, gap23, period, p1, p2, p3
  value: 60
```

## Entwicklung und Releases

Entwickelt wird auf Forgejo (`HA-Addons/thermostat-dial-card`). Der Workflow **HACS Release**
zählt die Version in `manifest.json` und `CARD_VERSION` hoch, setzt den Tag und legt das
Forgejo-Release an. Der Tag löst **GitHub Sync (HACS)** aus, das main, Tag und Release nach
GitHub spiegelt, weil HACS Updates nur über GitHub-Releases erkennt.

Benötigte Secrets: `RELEASE_TOKEN` (Forgejo) und `GH_MIRROR_TOKEN` (GitHub).

Tests: `pytest` mit `pytest-homeassistant-custom-component` (siehe `tests/`).

## Lizenz

MIT
