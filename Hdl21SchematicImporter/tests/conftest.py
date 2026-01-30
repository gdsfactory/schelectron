"""
Pytest configuration and fixtures for hdl21schematicimporter tests.
"""

import pytest
from pathlib import Path


@pytest.fixture
def fixtures_dir() -> Path:
    """Return the path to the test fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def inverter_svg(fixtures_dir) -> Path:
    """Path to a simple inverter schematic SVG."""
    return fixtures_dir / "inverter.sch.svg"


@pytest.fixture
def nand2_svg(fixtures_dir) -> Path:
    """Path to a NAND2 schematic with internal signals."""
    return fixtures_dir / "nand2.sch.svg"


@pytest.fixture
def custom_prelude_svg(fixtures_dir) -> Path:
    """Path to a schematic with custom prelude and Params."""
    return fixtures_dir / "custom_prelude.sch.svg"
