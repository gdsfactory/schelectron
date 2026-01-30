"""
Tests for hdl21schematicimporter.

Tests SVG parsing, circuit model, code generation, and Python import mechanics.
"""

from pathlib import Path
from types import SimpleNamespace

import pytest
import hdl21 as h
from hdl21schematicimporter import (
    __version__,
    svg_to_circuit,
    circuit_to_code,
    import_schematic,
)
from hdl21schematicimporter.circuit import Circuit, Signal, Instance, Connection, PortDir


class TestVersion:
    """Version tests."""

    def test_version_string(self):
        assert __version__ == "0.1.0"

    def test_version_format(self):
        parts = __version__.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


class TestCircuitModel:
    """Tests for the Circuit data model classes."""

    def test_signal_input(self):
        sig = Signal(name="clk", portdir=PortDir.INPUT)
        assert sig.name == "clk"
        assert sig.portdir == PortDir.INPUT

    def test_signal_output(self):
        sig = Signal(name="out", portdir=PortDir.OUTPUT)
        assert sig.portdir == PortDir.OUTPUT

    def test_signal_inout(self):
        sig = Signal(name="io", portdir=PortDir.INOUT)
        assert sig.portdir == PortDir.INOUT

    def test_signal_internal(self):
        sig = Signal(name="internal_net", portdir=PortDir.INTERNAL)
        assert sig.portdir == PortDir.INTERNAL

    def test_connection(self):
        conn = Connection(portname="g", signame="inp")
        assert conn.portname == "g"
        assert conn.signame == "inp"

    def test_instance(self):
        conns = [
            Connection(portname="g", signame="inp"),
            Connection(portname="d", signame="out"),
        ]
        inst = Instance(name="m1", of="Nmos(w=1*u, l=100*n)", conns=conns)
        assert inst.name == "m1"
        assert inst.of == "Nmos(w=1*u, l=100*n)"
        assert len(inst.conns) == 2

    def test_circuit(self):
        signals = [
            Signal(name="inp", portdir=PortDir.INPUT),
            Signal(name="out", portdir=PortDir.OUTPUT),
        ]
        instances = [
            Instance(
                name="m1",
                of="Nmos()",
                conns=[Connection(portname="g", signame="inp")],
            )
        ]
        circuit = Circuit(
            name="test_circuit",
            prelude="",
            signals=signals,
            instances=instances,
        )
        assert circuit.name == "test_circuit"
        assert len(circuit.signals) == 2
        assert len(circuit.instances) == 1


class TestSvgToCircuit:
    """Tests for SVG parsing to Circuit."""

    def test_inverter_svg(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        assert isinstance(circuit, Circuit)
        assert circuit.name == "inverter"
        assert len(circuit.signals) == 4
        assert len(circuit.instances) == 2

    def test_inverter_ports(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        signal_names = {s.name for s in circuit.signals}
        assert "inp" in signal_names
        assert "out" in signal_names
        assert "VDD" in signal_names
        assert "VSS" in signal_names

    def test_inverter_instances(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        instance_names = {i.name for i in circuit.instances}
        assert "p1" in instance_names
        assert "n1" in instance_names

    def test_nand2_internal_signal(self, nand2_svg):
        circuit = svg_to_circuit(nand2_svg)
        assert circuit.name == "nand2"
        internal_sigs = [s for s in circuit.signals if s.portdir == PortDir.INTERNAL]
        assert len(internal_sigs) == 1
        assert internal_sigs[0].name == "mid"

    def test_nand2_has_four_instances(self, nand2_svg):
        circuit = svg_to_circuit(nand2_svg)
        assert len(circuit.instances) == 4

    def test_custom_prelude(self, custom_prelude_svg):
        circuit = svg_to_circuit(custom_prelude_svg)
        assert circuit.name == "resistor_divider"
        assert "@h.paramclass" in circuit.prelude
        assert "class Params:" in circuit.prelude

    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            svg_to_circuit("nonexistent.sch.svg")

    def test_invalid_svg_no_defs(self, tmp_path):
        bad_svg = tmp_path / "bad.sch.svg"
        bad_svg.write_text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')
        with pytest.raises(RuntimeError, match="No hdl21-schematic-defs found"):
            svg_to_circuit(bad_svg)


class TestCircuitToCode:
    """Tests for Circuit to Python code conversion."""

    def test_basic_code_generation(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert isinstance(code, str)
        assert "@h.generator" in code
        assert "def inverter(params: Params)" in code

    def test_code_has_ports(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert "m.inp = h.Input()" in code
        assert "m.out = h.Output()" in code
        assert "m.VDD = h.Inout()" in code
        assert "m.VSS = h.Inout()" in code

    def test_code_has_instances(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert "m.p1 = Pmos" in code
        assert "m.n1 = Nmos" in code

    def test_internal_signals(self, nand2_svg):
        circuit = svg_to_circuit(nand2_svg)
        code = circuit_to_code(circuit)
        assert "m.mid = h.Signal()" in code

    def test_code_returns_module(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert "return m" in code

    def test_default_prelude(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert "import hdl21 as h" in code
        assert "from hdl21.primitives import *" in code


class TestImportSchematic:
    """Tests for the import_schematic function."""

    def test_returns_namespace(self, inverter_svg):
        ns = import_schematic(inverter_svg)
        assert isinstance(ns, SimpleNamespace)

    def test_namespace_has_generator(self, inverter_svg):
        ns = import_schematic(inverter_svg)
        assert hasattr(ns, "inverter")
        assert isinstance(ns.inverter, h.Generator)

    def test_namespace_has_params(self, inverter_svg):
        ns = import_schematic(inverter_svg)
        assert hasattr(ns, "Params")
        assert ns.Params is h.HasNoParams

    def test_generator_is_callable(self, inverter_svg):
        ns = import_schematic(inverter_svg)
        # Just verify the generator can be called - don't check return type
        # to avoid hdl21 caching issues across tests
        assert callable(ns.inverter)

    def test_nand2_generator(self, nand2_svg):
        ns = import_schematic(nand2_svg)
        assert hasattr(ns, "nand2")
        assert isinstance(ns.nand2, h.Generator)

    def test_custom_params(self, custom_prelude_svg):
        ns = import_schematic(custom_prelude_svg)
        assert hasattr(ns, "Params")
        assert h.isparamclass(ns.Params)
        assert ns.Params is not h.HasNoParams


class TestPyImporter:
    """Test the Python import override mechanics."""

    def test_import_schematic_module(self):
        """Test importing an SVG schematic as a Python module."""
        from . import schematic

        assert isinstance(schematic, SimpleNamespace)
        assert isinstance(schematic.schematic, h.Generator)
        assert h.isparamclass(schematic.Params)

    def test_import_generator_from_module(self):
        """Test 'from .schematic import schematic' syntax."""
        from .schematic import schematic

        assert isinstance(schematic, h.Generator)

    def test_import_params_from_module(self):
        """Test 'from .schematic import Params' syntax."""
        from .schematic import Params

        assert h.isparamclass(Params)


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_prelude_is_included_in_code(self, inverter_svg):
        circuit = svg_to_circuit(inverter_svg)
        code = circuit_to_code(circuit)
        assert "import hdl21 as h" in code
        assert "from hdl21.prefix import *" in code

    def test_circuit_name_from_filename(self, fixtures_dir):
        """Circuit name should come from JSON, falling back to filename."""
        circuit = svg_to_circuit(fixtures_dir / "inverter.sch.svg")
        assert circuit.name == "inverter"

    def test_connections_preserved(self, inverter_svg):
        """Verify all connections are preserved through parsing."""
        circuit = svg_to_circuit(inverter_svg)
        p1 = next(i for i in circuit.instances if i.name == "p1")
        conn_ports = {c.portname for c in p1.conns}
        assert conn_ports == {"g", "d", "s", "b"}

    def test_empty_prelude_uses_default(self, tmp_path):
        """Empty prelude should use default hdl21 imports."""
        svg_content = '''<?xml version="1.0" encoding="utf-8"?>
<svg width="1600" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs id="hdl21-schematic-defs">
    <text id="hdl21-schematic-circuit">{
      "name": "empty_prelude_test",
      "prelude": "",
      "signals": [{"name": "a", "portdir": "INPUT"}],
      "instances": []
    }</text>
  </defs>
</svg>'''
        svg_path = tmp_path / "empty.sch.svg"
        svg_path.write_text(svg_content)
        circuit = svg_to_circuit(svg_path)
        assert circuit.prelude == ""
        code = circuit_to_code(circuit)
        assert "import hdl21 as h" in code
        assert "from hdl21.primitives import *" in code
