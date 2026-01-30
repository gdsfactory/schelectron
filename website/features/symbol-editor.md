# Symbol Editor

The symbol editor allows you to create and edit custom component symbols.

## Opening Symbols

Any file with the `.sym.svg` extension automatically opens in the symbol editor.

## Drawing Tools

### Shapes

- **Lines**: Click two points to draw a line segment
- **Rectangles**: Click two corners to define the rectangle
- **Circles**: Click center, then drag to set radius
- **Text**: Click to place, then type the label

### Drawing Mode

1. Select a tool from the toolbar
2. Click on the canvas to place points
3. Tool remains active for continuous drawing
4. Press `Esc` to return to selection mode

## Ports

Ports define connection points for the symbol:

### Adding Ports

1. Select the port tool
2. Choose port direction (input/output/inout)
3. Click on the symbol boundary to place

### Port Properties

- **Name**: Identifier used in schematics
- **Direction**: Input, output, or bidirectional
- **Location**: Position relative to symbol origin

### Port Status Panel

Color-coded indicators show port mapping status:

- **Green**: Port properly mapped
- **Yellow**: Port defined but unused
- **Red**: Missing port definition

## Symbol Guidelines

### Design Recommendations

- Keep symbols simple and readable
- Use consistent sizing across similar components
- Place ports at grid intersections
- Orient ports for logical signal flow (inputs left, outputs right)

### Naming Convention

Symbols link to generators via naming:
- `Amplifier.sym.svg` → `Amplifier.py`

## Navigation

- **Double-click** a symbol to open its associated schematic
- **Right-click** for context menu with navigation options
