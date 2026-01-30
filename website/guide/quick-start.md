# Quick Start

## Development Mode

### VSCode Extension (Debug Mode)

```bash
cd Hdl21SchematicEditor/packages/VsCodePlugin/
yarn
yarn watch
# Press F5 in VSCode to launch debug mode
```

Or simply open the repository root in VSCode and press `F5`.

### Python Importer Development

```bash
cd Hdl21SchematicImporter
pip install -e ".[dev]"
pytest
```

## Creating Your First Schematic

1. **Open VSCode** with the extension installed
2. **Create a new file** with the `.sch.svg` extension
3. **Open the schematic editor** - VSCode will automatically use the schematic editor
4. **Add components** from the PDK browser in the sidebar
5. **Draw wires** to connect components
6. **Save** - the file is a valid SVG viewable anywhere

## Creating a Symbol

1. **Create a new file** with the `.sym.svg` extension
2. **Draw the symbol shape** using lines, rectangles, and circles
3. **Add ports** to define connection points
4. **Save** - the symbol is now available in schematics

## Using with HDL21

Once you have a schematic, import it into Python:

```python
import hdl21schematicimporter

# The importer hooks into Python's import system
from . import my_amplifier  # imports my_amplifier.sch.svg

# Use the generator
amp = my_amplifier()
```
