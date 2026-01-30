# Introduction

schelectron is an open-source schematic capture and symbol design tool built as a VSCode extension. It uses an SVG-based file format that's portable, git-friendly, and viewable anywhere.

## Why schelectron?

- **Hierarchical Schematic Design**: Visual tree representation of your full design structure in the sidebar, with Python generator scripts integrating directly with the hierarchy
- **Integrated Symbol Editor**: Drawing tools, port status panels, and double-click navigation between symbols and schematics
- **Python Generator Integration**: HDL21 compatible schematics that import seamlessly into Python programs
- **Git-Friendly Format**: SVG-based schematics that diff and merge cleanly

## Why SVG?

schelectron schematics are not *like* SVGs—they **are** SVGs.

- **Single File**: Each schematic is one file. No dependencies, no linked database.
- **Universal**: Any browser, any OS can render them. GitHub displays them natively.
- **Git-Friendly**: Text-based format diffs and merges cleanly.
- **Extensible**: Embed custom annotations, layout intent, or links to related documents.

Schematics use the `.sch.svg` extension. Symbols use `.sym.svg`. The VSCode extension automatically opens these in the appropriate editor mode.

## Project Structure

The editor is a TypeScript monorepo:

- **VsCodePlugin** — VSCode extension entry point
- **EditorCore** — React/Two.js editor UI and drawing logic
- **SchematicsCore** — Data model and SVG import/export
- **PlatformInterface** — Messaging abstraction between editor and host

## Roadmap

schelectron is building toward end-to-end analog/RF IC design:

- [ ] SPICE/FDTD simulation integration
- [ ] GDSFactory pcell conversion
- [ ] Layout editing capabilities
- [ ] DRC/LVS/PEX tooling
