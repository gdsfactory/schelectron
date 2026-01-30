# Features Overview

schelectron provides a complete environment for analog/RF IC schematic design directly in VSCode.

## Core Features

### [Schematic Editor](./schematic-editor)
The main editing environment for creating and modifying circuit schematics. Includes wire drawing, component placement, and PDK integration.

### [Symbol Editor](./symbol-editor)
Create and edit custom symbols with drawing tools, port mapping, and visual validation.

### [Python Integration](./python-integration)
Seamless integration with HDL21 for importing schematics as Python generators.

## Design Hierarchy

The sidebar provides a visual tree representation of your design:

- **Schematics** (`.sch.svg`) - Circuit implementations
- **Symbols** (`.sym.svg`) - Component definitions
- **Scripts** (`.py`) - Python generators

Automatic linking between components via naming conventions (e.g., `Amplifier.py` links to `Amplifier.sym.svg`).

## File Format

All files are standard SVG, enabling:

- **Version control** with meaningful diffs
- **Universal viewing** in any browser
- **GitHub rendering** directly in repositories
- **External editing** with tools like Inkscape
