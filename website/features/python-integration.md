# Python Integration

schelectron integrates with HDL21 to enable schematic-driven circuit design in Python.

## HDL21 Schematic Importer

The `hdl21schematicimporter` package provides seamless import of SVG schematics as HDL21 generators.

### Installation

```bash
pip install hdl21schematicimporter
```

### Basic Usage

```python
import hdl21schematicimporter

# Import hooks into Python's import system
# Place schematics alongside your Python modules

from . import my_amplifier  # imports my_amplifier.sch.svg
```

### How It Works

1. The importer registers a custom import hook
2. When importing, it looks for `.sch.svg` files matching the module name
3. The SVG is parsed to extract circuit connectivity
4. An HDL21 generator is created with proper port definitions

## Generator Scripts

Python generator scripts (`.py` files) integrate with the design hierarchy:

### Naming Convention

| Script | Symbol |
|--------|--------|
| `Amplifier.py` | `Amplifier.sym.svg` |
| `FilterBank.py` | `FilterBank.sym.svg` |

### Script Templates

Create new generator scripts with HDL21 templates from the command palette.

## Validation

The extension provides visual indicators for script and symbol consistency:

- **Green checkmark**: Script and symbol are in sync
- **Yellow warning**: Missing symbol or port mismatch
- **Red error**: Script has errors

## Example Workflow

1. **Design schematic** in the editor
2. **Create symbol** for the circuit
3. **Import in Python**:

```python
import hdl21 as h
from hdl21.prefix import µ, n
import hdl21schematicimporter

from . import differential_pair

@h.generator
def amplifier(params: AmplifierParams) -> h.Module:
    m = h.Module()
    m.inp = differential_pair()
    # ... rest of the circuit
    return m
```

## PDK Integration

The importer supports PDK device resolution:

```python
# Device strings in schematics map to PDK primitives
# Nmos(w=1*µ, l=20*n) → sky130.Nmos(...)
```
