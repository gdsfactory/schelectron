# Schematic Editor

The schematic editor is the primary interface for creating and editing circuit schematics.

## Opening Schematics

Any file with the `.sch.svg` extension automatically opens in the schematic editor.

## Editor Interface

### Canvas

The main drawing area where you place and connect components:

- **Grid-based**: All elements snap to a 10x10 pixel grid
- **Coordinates**: Origin at top-left, x increases right, y increases down
- **Default size**: 1600x800 pixels

### Sidebar Panels

- **Design Hierarchy**: Tree view of all schematics, symbols, and scripts
- **PDK Browser**: Component palette for placing primitives
- **Custom Symbols**: User-defined symbols available for placement

## Drawing Wires

Wires follow Manhattan routing (orthogonal segments only):

1. Click to start a wire
2. Click intermediate points for corners
3. Click on a port or existing wire to complete

Wires with the same name are electrically connected.

## Placing Components

### From PDK Browser

1. Open the PDK Browser panel
2. Click on a component to select it
3. Click on the canvas to place
4. The instance editor opens to set parameters

### Instance Parameters

Each instance has:
- **Name**: Unique identifier (e.g., `M1`, `R1`)
- **Of**: Python device string (e.g., `Nmos(w=1*µ, l=20*n)`)

## Ports

Ports define the external interface of the schematic:

- **Input**: Signal enters the circuit
- **Output**: Signal leaves the circuit
- **Inout**: Bidirectional signal

### Power Ports

Built-in support for VSS and VDD power connections.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Cancel current operation |
| `Delete` | Delete selected elements |
| `R` | Rotate selected element |
| `F` | Flip selected element |
