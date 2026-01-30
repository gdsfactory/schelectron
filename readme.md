<p align="center">
  <img src="logo.png" alt="schelectron logo" width="128" height="128">
</p>

<h1 align="center">schelectron</h1>

<p align="center"><strong>A VSCode Editor for End-to-End Analog/RF IC Design</strong></p>

<p align="center">
  <a href="https://github.com/gdsfactory/schelectron/actions/workflows/test.yaml">
    <img src="https://github.com/gdsfactory/schelectron/actions/workflows/test.yaml/badge.svg" alt="Build">
  </a>
  <a href="https://github.com/gdsfactory/schelectron/actions/workflows/docs.yaml">
    <img src="https://github.com/gdsfactory/schelectron/actions/workflows/docs.yaml/badge.svg" alt="Docs">
  </a>
  <img src="https://img.shields.io/badge/python-3.9%20%7C%203.10%20%7C%203.11%20%7C%203.12-blue" alt="Python">
</p>

schelectron is an open-source schematic capture and symbol design tool built as a VSCode extension. It uses an SVG-based file format that's portable, git-friendly, and viewable anywhere.

_Jump to [Installation](#installation)_ | _[Development](#development)_ | _[Roadmap](#roadmap)_

---

## Features

### Hierarchical Schematic Design
- **Design Hierarchy View**: Visual tree representation of your full design structure in the sidebar
- **Script Integration**: Python generator scripts (.py) integrate directly with the hierarchy
- **Automatic Symbol Linking**: Scripts automatically link to symbols via naming convention (Name.py → Name.sym.svg)

### Integrated Symbol Editor
- **Drawing Tools**: Lines, rectangles, circles, and text with click-to-click placement
- **Port Status Panel**: Color-coded indicators showing port mapping between symbols and schematics
- **Double-Click Navigation**: Jump directly to associated schematics or generator scripts

### Schematic Editor
- **Wire Drawing**: Intuitive wire routing with single-click termination
- **PDK Component Browser**: Sidebar-based component selector for PDK primitives
- **Power Ports**: Built-in VSS/VDD port support

### Python Generator Integration
- **Hdl21 Compatible**: Schematics import seamlessly into Hdl21-based Python programs
- **Script Templates**: Create new generator scripts with HDL21 templates
- **Validation**: Visual indicators for script and symbol consistency

---

## Why SVG?

schelectron schematics are not _like_ SVGs—they **are** SVGs.

- **Single File**: Each schematic is one file. No dependencies, no linked database.
- **Universal**: Any browser, any OS can render them. GitHub displays them natively.
- **Git-Friendly**: Text-based format diffs and merges cleanly.
- **Extensible**: Embed custom annotations, layout intent, or links to related documents.

Schematics use the `.sch.svg` extension. Symbols use `.sym.svg`. The VSCode extension automatically opens these in the appropriate editor mode.

---

## Installation

### Building the VSCode Extension

The editor requires [Yarn](https://classic.yarnpkg.com/en/docs/install) as its only dependency.

**On macOS:**
```bash
brew install yarn
```

**On Debian/Ubuntu:**
```bash
sudo apt install nodejs npm
sudo npm install -g n && sudo n stable
```

**Build and install:**
```bash
cd Hdl21SchematicEditor/packages/VsCodePlugin/
yarn
yarn package
code --install-extension hdl21-schematics-vscode-0.0.1.vsix
```

### Python Importer

The Python importer enables importing schematics as Hdl21 generators:

```bash
pip install hdl21schematicimporter
```

**Usage:**
```python
import hdl21schematicimporter

# Import a schematic as a generator
from . import my_circuit  # imports my_circuit.sch.svg
```

---

## The SVG Schematic Schema

SVG schematics are interpreted by two categories of programs:

1. **General-purpose viewers** (browsers, InkScape) that render them as pictures
2. **Circuit importers** that extract connectivity and device information

This section specifies the schema for circuit importers.

### Schematic Structure

Each schematic is an SVG element stored in a `.sch.svg` file:

```svg
<?xml version="1.0" encoding="utf-8"?>
<svg width="1600" height="800" xmlns="http://www.w3.org/2000/svg">
  <!-- Content -->
</svg>
```

**Size**: Default is 1600x800 pixels. Dictated by `width` and `height` attributes.

**Coordinates**: Origin at top-left, x increases right, y increases down. All elements placed on a 10x10 pixel grid.

### Schematic Elements

Each schematic contains four types of elements:

- **Instances**: Circuit element placements
- **Wires**: Connections between elements
- **Ports**: External interface annotations
- **Dots**: Junction indicators for wire connections

#### Instances

Instances are SVG groups with class `hdl21-instance`:

```svg
<g class="hdl21-instance" transform="matrix(1 0 0 1 X Y)">
    <g class="hdl21-elements-nmos">
        <!-- Symbol graphics -->
    </g>
    <text class="hdl21-instance-name">inst_name</text>
    <text class="hdl21-instance-of">Nmos(w=1*µ, l=20*n)</text>
</g>
```

Fields:
- `name`: Unique instance identifier
- `of`: Python code string defining the device type
- `kind`: Element type (from the symbol class)

#### Wires

Wires are SVG groups with class `hdl21-wire`:

```svg
<g class="hdl21-wire">
    <path class="hdl21-wire" d="M 100 150 L 100 350 L 200 350" />
    <text class="hdl21-wire-name">net1</text>
</g>
```

Wire paths follow Manhattan routing (orthogonal segments only). Wires with the same name are connected.

#### Ports

Ports annotate wires as external interfaces:

```svg
<g class="hdl21-port" transform="matrix(1 0 0 1 X Y)">
    <g class="hdl21-ports-input">
        <!-- Symbol graphics -->
    </g>
    <text class="hdl21-port-name">portname</text>
</g>
```

#### Dots

Dots indicate wire junctions:

```svg
<circle cx="100" cy="200" class="hdl21-dot" />
```

Dots are visual aids only—they don't affect circuit semantics.

### Orientation

Elements support 8 orientations: 4 rotations × optional reflection. Encoded in the SVG `matrix` transform:

| a | b | c | d | Rotation | Reflected |
|---|---|---|---|----------|-----------|
| 1 | 0 | 0 | 1 | 0° | No |
| 0 | 1 | -1 | 0 | 90° | No |
| -1 | 0 | 0 | -1 | 180° | No |
| 0 | -1 | 1 | 0 | 270° | No |
| 1 | 0 | 0 | -1 | 0° | Yes |
| 0 | 1 | 1 | 0 | 90° | Yes |
| -1 | 0 | 0 | 1 | 180° | Yes |
| 0 | -1 | -1 | 0 | 270° | Yes |

### Element Library

The built-in element library includes SPICE primitives: NMOS, PMOS, NPN, PNP, resistors, capacitors, inductors, diodes, and voltage/current sources.

Each element defines:
- A pictorial symbol
- A list of named, located ports

The `of` string on each instance determines the actual device—symbols are technology-agnostic.

---

## Development

### Quick Start

**VSCode Extension (debug mode):**
```bash
cd Hdl21SchematicEditor/packages/VsCodePlugin/
yarn
yarn watch
# Press F5 in VSCode to launch debug mode
```

Or open the repository root in VSCode and press `F5`.

**Python Importer:**
```bash
cd Hdl21SchematicImporter
pip install -e ".[dev]"
pytest
```

### Project Structure

The editor is a TypeScript monorepo:

- **[VsCodePlugin](./Hdl21SchematicEditor/packages/VsCodePlugin/)** — VSCode extension entry point
- **[EditorCore](./Hdl21SchematicEditor/packages/EditorCore/)** — React/Two.js editor UI and drawing logic
- **[SchematicsCore](./Hdl21SchematicEditor/packages/SchematicsCore/)** — Data model and SVG import/export
- **[PlatformInterface](./Hdl21SchematicEditor/packages/PlatformInterface/)** — Messaging abstraction between editor and host

---

## Roadmap

schelectron is building toward end-to-end analog/RF IC design:

- [ ] SPICE/FDTD simulation integration
- [ ] GDSFactory pcell conversion
- [ ] Layout editing capabilities
- [ ] DRC/LVS/PEX tooling

---

## Contributors

Thanks to these wonderful people who have contributed to this project:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table style="border: none; border-collapse: collapse;">
  <tbody>
    <tr style="border: none;">
      <td align="center" valign="top" width="14.28%" style="border: none;"><a href="https://github.com/dan-fritchman"><img src="https://avatars.githubusercontent.com/u/20178855?v=4?s=100" width="100px;" alt="Dan Fritchman" style="border-radius: 50%;"/><br /><sub><b>Dan Fritchman</b></sub></a><br /><a href="https://github.com/gdsfactory/schelectron/commits?author=dan-fritchman" title="Code">💻</a> <a href="https://github.com/gdsfactory/schelectron/commits?author=dan-fritchman" title="Documentation">📖</a> <a href="#design-dan-fritchman" title="Design">🎨</a> <a href="#ideas-dan-fritchman" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-dan-fritchman" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%" style="border: none;"><a href="https://github.com/growly"><img src="https://avatars.githubusercontent.com/u/125257?v=4?s=100" width="100px;" alt="Arya Reais-Parsi" style="border-radius: 50%;"/><br /><sub><b>Arya Reais-Parsi</b></sub></a><br /><a href="https://github.com/gdsfactory/schelectron/commits?author=growly" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%" style="border: none;"><a href="https://github.com/uduse"><img src="https://avatars.githubusercontent.com/u/4717005?v=4?s=100" width="100px;" alt="Zeyi Wang" style="border-radius: 50%;"/><br /><sub><b>Zeyi Wang</b></sub></a><br /><a href="https://github.com/gdsfactory/schelectron/commits?author=uduse" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%" style="border: none;"><a href="https://github.com/ThomasPluck"><img src="https://avatars.githubusercontent.com/u/26680070?v=4?s=100" width="100px;" alt="Thomas Pluck" style="border-radius: 50%;"/><br /><sub><b>Thomas Pluck</b></sub></a><br /><a href="https://github.com/gdsfactory/schelectron/commits?author=ThomasPluck" title="Code">💻</a> <a href="#maintenance-ThomasPluck" title="Maintenance">🚧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
