# SVG Schema Specification

SVG schematics are interpreted by two categories of programs:

1. **General-purpose viewers** (browsers, InkScape) that render them as pictures
2. **Circuit importers** that extract connectivity and device information

This section specifies the schema for circuit importers.

## Schematic Structure

Each schematic is an SVG element stored in a `.sch.svg` file:

```svg
<?xml version="1.0" encoding="utf-8"?>
<svg width="1600" height="800" xmlns="http://www.w3.org/2000/svg">
  <!-- Content -->
</svg>
```

**Size**: Default is 1600x800 pixels. Dictated by `width` and `height` attributes.

**Coordinates**: Origin at top-left, x increases right, y increases down. All elements placed on a 10x10 pixel grid.

## Schematic Elements

Each schematic contains four types of elements:

| Element | Description |
|---------|-------------|
| **Instances** | Circuit element placements |
| **Wires** | Connections between elements |
| **Ports** | External interface annotations |
| **Dots** | Junction indicators for wire connections |

### Instances

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

| Field | Description |
|-------|-------------|
| `name` | Unique instance identifier |
| `of` | Python code string defining the device type |
| `kind` | Element type (from the symbol class) |

### Wires

Wires are SVG groups with class `hdl21-wire`:

```svg
<g class="hdl21-wire">
    <path class="hdl21-wire" d="M 100 150 L 100 350 L 200 350" />
    <text class="hdl21-wire-name">net1</text>
</g>
```

Wire paths follow Manhattan routing (orthogonal segments only). Wires with the same name are connected.

### Ports

Ports annotate wires as external interfaces:

```svg
<g class="hdl21-port" transform="matrix(1 0 0 1 X Y)">
    <g class="hdl21-ports-input">
        <!-- Symbol graphics -->
    </g>
    <text class="hdl21-port-name">portname</text>
</g>
```

### Dots

Dots indicate wire junctions:

```svg
<circle cx="100" cy="200" class="hdl21-dot" />
```

Dots are visual aids only—they don't affect circuit semantics.

## Orientation

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

## Element Library

The built-in element library includes SPICE primitives: NMOS, PMOS, NPN, PNP, resistors, capacitors, inductors, diodes, and voltage/current sources.

Each element defines:
- A pictorial symbol
- A list of named, located ports

The `of` string on each instance determines the actual device—symbols are technology-agnostic.
