# Installation

## Building the VSCode Extension

The editor requires [Yarn](https://classic.yarnpkg.com/en/docs/install) as its only dependency.

### Installing Yarn

**On macOS:**
```bash
brew install yarn
```

**On Debian/Ubuntu:**
```bash
sudo apt install nodejs npm
sudo npm install -g n && sudo n stable
```

### Build and Install

```bash
cd Hdl21SchematicEditor/packages/VsCodePlugin/
yarn
yarn package
code --install-extension hdl21-schematics-vscode-0.0.1.vsix
```

## Python Importer

The Python importer enables importing schematics as HDL21 generators:

```bash
pip install hdl21schematicimporter
```

### Usage

```python
import hdl21schematicimporter

# Import a schematic as a generator
from . import my_circuit  # imports my_circuit.sch.svg
```

## File Extensions

The extension registers handlers for:

| Extension | Description |
|-----------|-------------|
| `.sch.svg` | Schematic files - opens in schematic editor |
| `.sym.svg` | Symbol files - opens in symbol editor |
