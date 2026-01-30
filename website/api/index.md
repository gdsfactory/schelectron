# API Reference

This section contains auto-generated API documentation for both the TypeScript packages and the Python importer.

## TypeScript Packages

The editor is built as a TypeScript monorepo with four main packages:

### [SchematicsCore](./typescript/SchematicsCore/src/)
Core data model and SVG import/export functionality.

- Schematic, Instance, Wire, Port interfaces
- SVG parsing and generation
- Circuit connectivity extraction

### [EditorCore](./typescript/EditorCore/src/)
React/Two.js editor UI and drawing logic.

- Editor state management
- Drawing modes and tools
- Rendering components

### [PlatformInterface](./typescript/PlatformInterface/src/)
Messaging abstraction between editor and host platform.

- Cross-platform message passing
- Editor-host communication protocol

## Python Package

### [hdl21schematicimporter](./python/)
Python package for importing SVG schematics as HDL21 generators.

- SVG parsing
- Circuit data structures
- Python import hook
- PDK device discovery

## Building API Docs

TypeScript API docs are generated with TypeDoc:

```bash
cd website
npm run build:api
```

Python API docs are generated with Sphinx:

```bash
cd Hdl21SchematicImporter/docs
make html
```
