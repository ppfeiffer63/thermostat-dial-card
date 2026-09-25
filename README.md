# Thermostat Dial Card

Lovelace-Thermostat-Karte mit LED-Bogen im SteelSeries-Stil für eine beliebige
`climate`-Entität. Keine Zonen, kein PWM — die Karte ist reine Anzeige und Bedienung,
die eigentliche Regelung liegt bei der climate-Entität selbst.

## Funktionen

- LED-Bogen mit einstellbarer Segmentzahl (24 bis 72), Glow und dunklem oder Theme-Zifferblatt
- Soll per Ziehen am Bogen oder mit +/- einstellen, Ist als Punkt im Bogen
- Farbe automatisch nach `hvac_action` (Heizen orange, Kühlen blau, Entfeuchten gelb, Bereit grün, Aus grau) oder fest wählbar
- Modus-Buttons je nach `hvac_modes` der Entität (Heizen, Kühlen, Auto, Aus, …)
- Keine Abhängigkeiten, Vanilla JS

## Installation

### HACS (Custom Repository)

1. HACS, Menü (drei Punkte), **Benutzerdefinierte Repositories**
2. Repository `https://github.com/ppfeiffer63/thermostat-dial-card`, Typ **Dashboard**
3. Karte herunterladen und Browser-Cache leeren

### Manuell

`thermostat-dial-card.js` nach `/config/www/` kopieren und unter Einstellungen, Dashboards,
Ressourcen als JavaScript-Modul eintragen: `/local/thermostat-dial-card.js`

## Konfiguration

```yaml
type: custom:thermostat-dial-card
entity: climate.wohnzimmer
name: Wohnzimmer      # optional
segments: 45
face: dark
color: "#ff8100"       # optional, sonst automatisch nach Modus
step: 0.5               # optional, sonst target_temp_step der Entität
show_modes: true
```

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Beliebige `climate`-Entität |
| `name` | Friendly Name | Anzeigename |
| `segments` | `45` | Anzahl LED-Segmente |
| `face` | `dark` | `dark` oder `theme` |
| `color` | automatisch | Bogenfarbe fest vorgeben, als Hex-Wert oder per Farbwähler im Editor |
| `step` | Vorgabe der Entität | Schrittweite des Sollwerts |
| `show_modes` | `true` | Modus-Buttons anzeigen |

## Eine passende climate-Entität einrichten

Die Karte braucht nur eine ganz normale `climate`-Entität mit Soll- und Ist-Temperatur.
Falls du noch keine hast (z. B. weil du nur einen Temperatursensor und einen Heizer-Schalter
besitzt), kannst du dir mit dem **Generic Thermostat**-Helper von Home Assistant direkt eine
erzeugen, ganz ohne YAML:

1. **Einstellungen → Geräte & Dienste → Helfer → Helfer erstellen**
2. **Generic Thermostat** auswählen
3. Temperatursensor und Heizer-Schalter (oder Kühler) auswählen, Name vergeben, fertig

Danach steht eine `climate.<name>`-Entität bereit, die du direkt als `entity:` in der Karte
einträgst. Der Generic-Thermostat-Helper schaltet den Ausgang einfach ein/aus (Hysterese-
Regelung), ganz ohne PWM oder Zonen — für die meisten Heizungen reicht das völlig aus.

## Lizenz

MIT
