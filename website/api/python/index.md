# hdl21schematicimporter

Python package for importing schelectron SVG schematics as HDL21 generators.

## Installation

```bash
pip install hdl21schematicimporter
```

## Quick Start

```python
import hdl21schematicimporter

# Import a schematic as a generator
from . import my_circuit  # imports my_circuit.sch.svg
```

## Modules

### hdl21schematicimporter

Main package entry point. Registers the import hook when imported.

### hdl21schematicimporter.circuit

Circuit data structures for representing parsed schematics.

### hdl21schematicimporter.svg

SVG parsing utilities for extracting circuit elements from SVG files.

### hdl21schematicimporter.pyimporter

Python import hook implementation that enables importing `.sch.svg` files as modules.

### hdl21schematicimporter.pdk_discovery

PDK component discovery for mapping device strings to PDK primitives.

## Full API Documentation

For detailed API documentation generated from docstrings, build the Sphinx docs:

```bash
cd Hdl21SchematicImporter/docs
pip install sphinx myst-parser furo
make html
```

Then open `_build/html/index.html`.
