# Thermostat Dial Card

Lovelace-Thermostat-Karte mit LED-Bogen im SteelSeries-Stil für eine oder zwei
`climate`-Entitäten. Keine Zonen, kein PWM — die Karte ist reine Anzeige und Bedienung,
die eigentliche Regelung liegt bei der climate-Entität selbst.

## Funktionen

- LED-Bogen mit einstellbarer Segmentzahl (24 bis 72), Glow und dunklem oder Theme-Zifferblatt
- Soll per Ziehen am Bogen oder mit +/- einstellen, Ist als Punkt im Bogen
- Farbe automatisch nach `hvac_action` (Heizen orange, Kühlen blau, Entfeuchten gelb, Bereit grün, Aus grau), fest wählbar, oder als Farbverlauf über `color_stops`
- Modus-Buttons je nach `hvac_modes` der Entität (Heizen, Kühlen, Auto, Aus, …), in den unteren Ecken der Karte
- Optional eine zweite `climate`-Entität (`entity2`) verwalten: konzentrischer Doppel-Bogen mit getrennten Sollwerten, ein Tap auf einen Ring aktiviert ihn für +/-, gemeinsame Modus-Buttons für beide
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

### Eine Entität

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

### Zwei Entitäten (Doppel-Bogen)

```yaml
type: custom:thermostat-dial-card
entity: climate.wohnzimmer      # äußerer Ring
entity2: climate.schlafzimmer   # innerer Ring
name: Wohnzimmer                 # optional
name2: Schlafzimmer               # optional
color: "#ff8100"                  # optional
color2: "#4fc98a"                 # optional
```

Ein Tap auf einen Ring oder seinen Namen aktiviert ihn — nur der aktive Ring reagiert auf
die +/- Buttons, der inaktive wird gedimmt dargestellt. Direktes Ziehen an einem Ring steuert
immer diesen Ring, unabhängig davon, welcher gerade aktiv ist. Die Modus-Buttons wirken auf
beide Entitäten gleichzeitig und zeigen einen "gemischt"-Zustand (halb gefüllt), wenn beide
Entitäten unterschiedliche Modi haben.

### Farbverlauf statt fester Farbe

```yaml
color_stops:
  - { temp: 17, color: "#3ea6f6" }
  - { temp: 20, color: "#4fc98a" }
  - { temp: 23, color: "#f0c020" }
  - { temp: 26, color: "#ff9012" }
```

Jedes LED-Segment bekommt seine Farbe nach seiner eigenen Temperaturposition, linear
zwischen den angegebenen Stützpunkten interpoliert. Mindestens zwei Stützpunkte nötig. Für
die zweite Entität analog `color_stops2`. Ist `color_stops` gesetzt, hat es Vorrang vor `color`.

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `entity` | erforderlich | Beliebige `climate`-Entität (äußerer Ring im Doppel-Modus) |
| `entity2` | – | Optional: zweite `climate`-Entität, aktiviert den Doppel-Bogen (innerer Ring) |
| `name` / `name2` | Friendly Name | Anzeigename |
| `segments` | `45` | Anzahl LED-Segmente (äußerer Ring; innerer Ring proportional weniger) |
| `face` | `dark` | `dark` oder `theme` |
| `color` / `color2` | automatisch | Bogenfarbe fest vorgeben |
| `color_stops` / `color_stops2` | – | Farbverlauf: Liste aus `{temp, color}`, überschreibt `color` |
| `step` / `step2` | Vorgabe der Entität | Schrittweite des Sollwerts |
| `show_modes` | `true` | Modus-Buttons anzeigen |

## Eine passende climate-Entität einrichten

Die Karte braucht nur eine ganz normale `climate`-Entität mit Soll- und Ist-Temperatur.
Falls du noch keine hast (z. B. weil du nur einen Temperatursensor und einen Heizer-Schalter
besitzt), kannst du dir mit dem **Generic Thermostat**-Helper von Home Assistant direkt eine
erzeugen, ganz ohne YAML:

1. **Einstellungen → Geräte & Dienste → Helfer → Helfer erstellen**
2. **Generic Thermostat** auswählen
3. Temperatursensor und Heizer-Schalter (oder Kühler) auswählen, Name vergeben, fertig

Danach steht eine `climate.<name>`-Entität bereit, die du direkt als `entity:` (oder `entity2:`)
in der Karte einträgst. Der Generic-Thermostat-Helper schaltet den Ausgang einfach ein/aus
(Hysterese-Regelung), ganz ohne PWM oder Zonen — für die meisten Heizungen reicht das völlig aus.

## Lizenz

MIT
