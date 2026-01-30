"""
PDK Discovery Service

Discovers and introspects HDL21 PDKs installed in the Python environment.
Provides device information including parameters and ports for the schematic editor.

Communication is via JSON-RPC over stdin/stdout.
"""

import sys
import json
import inspect
import importlib
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Optional, Any
from enum import Enum


@dataclass
class PortInfo:
    """Port information for a PDK device"""
    name: str
    direction: str = "inout"  # "input", "output", "inout"


@dataclass
class ParamInfo:
    """Parameter information for a PDK device"""
    name: str
    dtype: str = "Any"
    default: Optional[Any] = None
    description: str = ""


@dataclass
class DeviceInfo:
    """Complete device information"""
    name: str
    module_path: str  # e.g., "gf180.nmos"
    category: str  # "transistors", "passives", "diodes", etc.
    ports: List[PortInfo] = field(default_factory=list)
    params: List[ParamInfo] = field(default_factory=list)
    symbol_type: str = "Nmos"  # Maps to existing Element types


@dataclass
class PdkInfo:
    """PDK package information"""
    name: str
    version: str
    description: str = ""
    devices: List[DeviceInfo] = field(default_factory=list)


# Known HDL21 PDK packages and their module names
KNOWN_PDKS: Dict[str, str] = {
    "gf180-hdl21": "gf180_hdl21",
    "sky130-hdl21": "sky130_hdl21",
    "asap7-hdl21": "asap7_hdl21",
    "gpdk045-hdl21": "gpdk045",
    "gpdk090-hdl21": "gpdk090",
}

# Local PDK paths to search (set by add_local_path command)
LOCAL_PDK_PATHS: List[str] = []

# Mapping from device name patterns to symbol types
# Order matters - more specific patterns should come first
SYMBOL_PATTERNS: List[tuple] = [
    # Transistors - check specific patterns first
    (["nfet", "nmos", "nch"], "Nmos"),
    (["pfet", "pmos", "pch"], "Pmos"),
    # BJTs - check before generic patterns
    (["npn"], "Npn"),
    (["pnp"], "Pnp"),
    # Passives
    (["mim", "cap_", "cap"], "Cap"),
    (["nplus", "pplus", "nwell", "polyf", "rm1", "rm2", "rm3", "tm6k", "tm9k", "tm11k", "tm30k", "res"], "Res3"),
    (["ind", "inductor"], "Ind"),
    # Diodes - match common diode naming patterns
    (["diode", "nd2ps", "pd2nw", "nw2ps", "pw2dw", "dw2ps", "schottky", "sc_diode"], "Diode"),
    # Sources
    (["vsource", "vdc", "vpulse"], "Vsource"),
    (["isource", "idc", "ipulse"], "Isource"),
]

# Category patterns - order matters, more specific first
CATEGORY_PATTERNS: List[tuple] = [
    # BJTs are transistors
    (["npn", "pnp", "bjt"], "transistors"),
    # FETs
    (["nfet", "pfet", "nmos", "pmos", "nch", "pch", "fet"], "transistors"),
    # Diodes
    (["diode", "nd2ps", "pd2nw", "nw2ps", "pw2dw", "dw2ps", "schottky", "sc_diode"], "diodes"),
    # Passives - resistors, capacitors, inductors
    (["mim", "cap_", "cap"], "passives"),
    (["nplus", "pplus", "nwell", "polyf", "rm1", "rm2", "rm3", "tm6k", "tm9k", "tm11k", "tm30k", "res"], "passives"),
    (["ind", "inductor"], "passives"),
    # Sources
    (["vsource", "isource", "vdc", "idc"], "sources"),
]


def get_symbol_type(name: str, num_ports: int = 0) -> str:
    """Determine which schematic symbol to use based on device name and port count"""
    name_lower = name.lower()
    for patterns, symbol in SYMBOL_PATTERNS:
        if any(p in name_lower for p in patterns):
            # Special handling for resistors - use port count to decide
            if symbol == "Res3":
                # 2-port resistors use "Res", 3+ port resistors use "Res3"
                if num_ports <= 2:
                    return "Res"
                return "Res3"
            return symbol
    return "Nmos"  # Default fallback


def get_category(name: str) -> str:
    """Determine device category for organization"""
    name_lower = name.lower()
    for patterns, category in CATEGORY_PATTERNS:
        if any(p in name_lower for p in patterns):
            return category
    return "other"


def extract_ports_from_device(obj) -> List[PortInfo]:
    """Extract port information from an HDL21 device (class or ExternalModule instance)"""
    ports = []

    # Check for ExternalModule instance with port_list
    if hasattr(obj, "port_list") and obj.port_list:
        for port in obj.port_list:
            port_name = getattr(port, "name", None)
            if port_name:
                ports.append(PortInfo(name=port_name, direction="inout"))
        return ports

    # Try to get ports from the Ports class attribute (for classes)
    if inspect.isclass(obj) and hasattr(obj, "Ports"):
        ports_cls = obj.Ports
        # Get annotations which define the port names
        annotations = getattr(ports_cls, "__annotations__", {})
        for port_name in annotations:
            ports.append(PortInfo(name=port_name, direction="inout"))

    # If no ports found, try common port patterns based on device name
    if not ports:
        # Get name from object
        if hasattr(obj, "name"):
            name_lower = obj.name.lower()
        elif hasattr(obj, "__name__"):
            name_lower = obj.__name__.lower()
        else:
            name_lower = ""

        if any(p in name_lower for p in ["nmos", "pmos", "nch", "pch", "nfet", "pfet", "fet"]):
            ports = [
                PortInfo(name="d", direction="inout"),
                PortInfo(name="g", direction="inout"),
                PortInfo(name="s", direction="inout"),
                PortInfo(name="b", direction="inout"),
            ]
        elif any(p in name_lower for p in ["res", "cap", "ind"]):
            ports = [
                PortInfo(name="p", direction="inout"),
                PortInfo(name="n", direction="inout"),
            ]
        elif "diode" in name_lower:
            ports = [
                PortInfo(name="p", direction="inout"),
                PortInfo(name="n", direction="inout"),
            ]
        elif any(p in name_lower for p in ["npn", "pnp", "bjt"]):
            ports = [
                PortInfo(name="c", direction="inout"),
                PortInfo(name="b", direction="inout"),
                PortInfo(name="e", direction="inout"),
            ]

    return ports


def extract_params_from_device(obj) -> List[ParamInfo]:
    """Extract parameter information from an HDL21 device (class or ExternalModule instance)"""
    params = []

    # Check for ExternalModule instance with paramtype
    if hasattr(obj, "paramtype") and obj.paramtype is not None:
        params_cls = obj.paramtype
        # HDL21 paramclass has __params__ attribute with param definitions
        if hasattr(params_cls, "__params__"):
            for param_name, param_def in params_cls.__params__.items():
                default_val = None
                dtype = "Any"
                desc = ""

                # Extract default value
                if hasattr(param_def, "default"):
                    default_val = param_def.default
                    # Don't serialize complex hdl21 types
                    if hasattr(default_val, "__class__") and default_val.__class__.__name__ in ["Literal", "Prefixed"]:
                        default_val = str(default_val)

                # Extract dtype
                if hasattr(param_def, "dtype"):
                    dtype = getattr(param_def.dtype, "__name__", str(param_def.dtype))

                # Extract description
                if hasattr(param_def, "desc"):
                    desc = param_def.desc or ""

                params.append(ParamInfo(
                    name=param_name,
                    dtype=dtype,
                    default=default_val if not callable(default_val) else None,
                    description=desc,
                ))
            return params

        # Fallback: try annotations
        annotations = getattr(params_cls, "__annotations__", {})
        for param_name, param_type in annotations.items():
            default_val = getattr(params_cls, param_name, None)

            if hasattr(default_val, "default"):
                default_val = default_val.default
            elif hasattr(default_val, "value"):
                default_val = default_val.value

            params.append(ParamInfo(
                name=param_name,
                dtype=str(param_type.__name__ if hasattr(param_type, "__name__") else param_type),
                default=default_val if not callable(default_val) else None,
                description="",
            ))
        return params

    # Try to get params from the Params class attribute (for classes)
    if inspect.isclass(obj) and hasattr(obj, "Params"):
        params_cls = obj.Params
        annotations = getattr(params_cls, "__annotations__", {})

        for param_name, param_type in annotations.items():
            default_val = getattr(params_cls, param_name, None)

            # Try to get the actual default value
            if hasattr(default_val, "default"):
                default_val = default_val.default
            elif hasattr(default_val, "value"):
                default_val = default_val.value

            params.append(ParamInfo(
                name=param_name,
                dtype=str(param_type.__name__ if hasattr(param_type, "__name__") else param_type),
                default=default_val if not callable(default_val) else None,
                description="",
            ))

    return params


def is_hdl21_device(obj) -> bool:
    """Check if object is an HDL21 device (ExternalModule instance)"""
    # Get the class name for filtering
    cls_name = type(obj).__name__

    # Check if it's an ExternalModule instance (the main target for PDK devices)
    # ExternalModule instances have port_list, paramtype, domain, and name attributes
    if cls_name == "ExternalModule" or (
        hasattr(obj, "port_list") and
        hasattr(obj, "paramtype") and
        hasattr(obj, "domain") and
        hasattr(obj, "name")
    ):
        # Make sure it has actual ports (not just an empty list or None)
        port_list = getattr(obj, "port_list", None)
        if port_list and len(port_list) > 0:
            return True

    # Skip classes - we're mainly interested in ExternalModule instances for PDKs
    # Classes like Mos, Diode, etc. are HDL21 primitives, not PDK devices
    if inspect.isclass(obj):
        return False

    return False


def introspect_module(module, module_name: str) -> List[DeviceInfo]:
    """Extract all devices from a module (classes or ExternalModule instances)"""
    devices = []

    for attr_name, obj in inspect.getmembers(module):
        # Skip private/internal items
        if attr_name.startswith("_"):
            continue

        if is_hdl21_device(obj):
            try:
                # For ExternalModule instances, use the PDK device name if available
                if hasattr(obj, "name"):
                    device_name = obj.name  # The actual PDK device name
                    display_name = attr_name  # The Python variable name for display
                else:
                    device_name = attr_name
                    display_name = attr_name

                ports = extract_ports_from_device(obj)
                device = DeviceInfo(
                    name=display_name,  # Use Python variable name for display
                    module_path=f"{module_name}.{attr_name}",
                    category=get_category(display_name),
                    ports=ports,
                    params=extract_params_from_device(obj),
                    symbol_type=get_symbol_type(display_name, len(ports)),
                )
                devices.append(device)
            except Exception as e:
                # Skip devices that fail introspection
                continue

    return devices


def discover_pdk(package_name: str, module_name: str) -> Optional[PdkInfo]:
    """Discover and introspect a single PDK package"""
    try:
        # Try to get package info
        try:
            import importlib.metadata as metadata
        except ImportError:
            import importlib_metadata as metadata

        try:
            dist = metadata.distribution(package_name)
            version = dist.version
        except metadata.PackageNotFoundError:
            return None

        # Try to import the module
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            return None

        # Introspect devices
        devices = introspect_module(module, module_name)

        # Also check submodules if they exist
        if hasattr(module, "__path__"):
            try:
                import pkgutil
                # Submodules to skip
                skip_submodules = {"test", "tests", "conftest"}
                for importer, submod_name, ispkg in pkgutil.iter_modules(module.__path__):
                    # Skip test and internal modules
                    if submod_name in skip_submodules or submod_name.startswith("test_"):
                        continue
                    try:
                        submodule = importlib.import_module(f"{module_name}.{submod_name}")
                        sub_devices = introspect_module(submodule, f"{module_name}.{submod_name}")
                        devices.extend(sub_devices)
                    except Exception:
                        # Skip modules that fail to import
                        continue
            except Exception:
                pass

        return PdkInfo(
            name=package_name,
            version=version,
            description=getattr(module, "__doc__", "") or f"HDL21 PDK: {package_name}",
            devices=devices,
        )
    except Exception as e:
        return None


def discover_local_pdk(pdk_path: str) -> Optional[PdkInfo]:
    """Discover a PDK from a local directory"""
    import os

    if not os.path.isdir(pdk_path):
        return None

    # Find the module directory (look for __init__.py)
    module_name = None
    module_dir = None

    for item in os.listdir(pdk_path):
        item_path = os.path.join(pdk_path, item)
        if os.path.isdir(item_path):
            init_file = os.path.join(item_path, "__init__.py")
            if os.path.exists(init_file):
                module_name = item
                module_dir = item_path
                break

    if not module_name:
        return None

    # Add parent directory to sys.path temporarily
    parent_dir = pdk_path
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    try:
        # Try to import the module
        module = importlib.import_module(module_name)

        # Get version from pyproject.toml if available
        version = "local"
        pyproject_path = os.path.join(pdk_path, "pyproject.toml")
        if os.path.exists(pyproject_path):
            try:
                with open(pyproject_path, "r") as f:
                    content = f.read()
                    for line in content.split("\n"):
                        if line.strip().startswith("version"):
                            version = line.split("=")[1].strip().strip('"\'')
                            break
            except:
                pass

        # Introspect devices from the main module
        devices = introspect_module(module, module_name)

        # Also check primitives submodule which is common in HDL21 PDKs
        try:
            primitives = importlib.import_module(f"{module_name}.primitives")
            prim_devices = introspect_module(primitives, f"{module_name}.primitives")
            devices.extend(prim_devices)
        except ImportError:
            pass

        # Check for submodules
        if hasattr(module, "__path__"):
            try:
                import pkgutil
                # Submodules to skip
                skip_submodules = {"primitives", "test", "tests", "conftest"}
                for importer, submod_name, ispkg in pkgutil.iter_modules(module.__path__):
                    # Skip already handled, test, and internal modules
                    if submod_name in skip_submodules or submod_name.startswith("test_"):
                        continue
                    try:
                        submodule = importlib.import_module(f"{module_name}.{submod_name}")
                        sub_devices = introspect_module(submodule, f"{module_name}.{submod_name}")
                        devices.extend(sub_devices)
                    except Exception:
                        # Skip modules that fail to import (e.g., missing deps)
                        continue
            except Exception:
                pass

        # Get PDK name from directory name
        pdk_name = os.path.basename(pdk_path)

        return PdkInfo(
            name=pdk_name,
            version=version,
            description=getattr(module, "__doc__", "") or f"Local HDL21 PDK: {pdk_name}",
            devices=devices,
        )
    except Exception as e:
        return None


def discover_all_pdks() -> List[PdkInfo]:
    """Discover all installed and local HDL21 PDKs"""
    pdks = []
    seen_names = set()
    seen_modules = set()

    # First, discover from local paths (these take priority)
    for local_path in LOCAL_PDK_PATHS:
        pdk = discover_local_pdk(local_path)
        if pdk and pdk.devices:
            pdks.append(pdk)
            # Track both the PDK name and likely package names
            pdk_lower = pdk.name.lower()
            seen_names.add(pdk_lower)
            seen_names.add(f"{pdk_lower}-hdl21")  # e.g., "gf180-hdl21"
            # Also track module names from device paths
            for dev in pdk.devices[:1]:  # Just check one device
                if dev.module_path:
                    mod_name = dev.module_path.split(".")[0]
                    seen_modules.add(mod_name.lower())

    # Then, discover installed packages (skip if local version exists)
    for package_name, module_name in KNOWN_PDKS.items():
        pkg_lower = package_name.lower()
        mod_lower = module_name.lower()
        # Skip if we already have this PDK from local path
        if pkg_lower in seen_names or mod_lower in seen_modules:
            continue
        pdk = discover_pdk(package_name, module_name)
        if pdk and pdk.devices:
            pdks.append(pdk)
            seen_names.add(pkg_lower)
            seen_modules.add(mod_lower)

    return pdks


def install_pdk(package_name: str) -> Dict[str, Any]:
    """Install a PDK package using pip"""
    import subprocess

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package_name],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        return {
            "status": "ok" if result.returncode == 0 else "error",
            "output": result.stdout + result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "output": "Installation timed out", "returncode": -1}
    except Exception as e:
        return {"status": "error", "output": str(e), "returncode": -1}


def handle_command(cmd: Dict[str, Any]) -> Dict[str, Any]:
    """Handle incoming commands from VSCode extension"""
    action = cmd.get("action")

    if action == "discover":
        pdks = discover_all_pdks()
        return {
            "status": "ok",
            "pdks": [asdict(p) for p in pdks],
        }

    elif action == "add_local_path":
        path = cmd.get("path")
        if not path:
            return {"status": "error", "message": "No path specified"}
        if path not in LOCAL_PDK_PATHS:
            LOCAL_PDK_PATHS.append(path)
        return {"status": "ok", "message": f"Added local PDK path: {path}"}

    elif action == "install":
        package = cmd.get("package")
        if not package:
            return {"status": "error", "message": "No package specified"}
        return install_pdk(package)

    elif action == "get_device_details":
        pdk_name = cmd.get("pdk")
        device_name = cmd.get("device")

        pdks = discover_all_pdks()
        for pdk in pdks:
            if pdk.name == pdk_name:
                for device in pdk.devices:
                    if device.name == device_name:
                        return {"status": "ok", "device": asdict(device)}

        return {"status": "error", "message": f"Device {device_name} not found in {pdk_name}"}

    elif action == "ping":
        return {"status": "ok", "message": "pong"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


def main():
    """Main entry point for stdin/stdout communication"""
    # Ensure stdout is line-buffered
    sys.stdout.reconfigure(line_buffering=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
            result = handle_command(cmd)
            print(json.dumps(result), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({
                "status": "error",
                "message": f"Invalid JSON: {e}",
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                "status": "error",
                "message": str(e),
            }), flush=True)


if __name__ == "__main__":
    main()
