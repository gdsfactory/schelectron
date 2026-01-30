//
// # Panels
//
// Essentially everything in the schematic UI that is not the central schematic canvas.
//

import * as React from "react";
import { createTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import SvgIcon from "@mui/material/SvgIcon";
import useMediaQuery from "@mui/material/useMediaQuery";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import NearMeIcon from "@mui/icons-material/NearMe";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import TimelineIcon from "@mui/icons-material/Timeline";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import MemoryIcon from "@mui/icons-material/Memory";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import FlipIcon from "@mui/icons-material/Flip";
import DeleteIcon from "@mui/icons-material/Delete";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import TextFieldsIcon from "@mui/icons-material/TextFields";

// Local Imports
import { theEditor } from "./editor";
import { ThemeProvider } from "@emotion/react";
import { SymbolPortStatus } from "PlatformInterface";

// # Panels
//
// The top-level "everything else" component, including all but the central schematic canvas.
//
// This is re-rendered on most editor UI-state changes, e.g. those from "add instance" to "idle",
// so should be relatively light weight.
//
export function Panels() {
  // Track the system-level color-theme preference via `useMediaQuery`.
  // Note the SchEditor has its own tracking of this.
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? "dark" : "light",
        },
      }),
    [prefersDarkMode]
  );

  // Create the `Panels` react state, and give the parent `SchEditor` a way to update it.
  //
  // This is another bit of startup dancing.
  // The way the `SchEditor` gets changes into `Panels` is via its state-updater function,
  // which is embedded as a closure in the `updatePanels` function after the first render.
  //
  // This also generally requires that the `SchEditor` have its own copy of the panels state,
  // which, eh, we guess is alright. But requires that essentially *any* update goes through
  // `theEditor.updatePanels`, *not* directly updating the copy here,
  // lest the two get out of sync.
  //
  const [state, updater] = React.useState(panelProps.default);
  theEditor.panelUpdater = updater;

  // The Panels component now renders a top toolbar instead of a right-side panel.
  return (
    <ThemeProvider theme={theme}>
      <React.Fragment>
        <TopToolbar {...state} />
        <PortStatusPanel portSyncStatus={state.portSyncStatus} />
      </React.Fragment>
    </ThemeProvider>
  );
}

// Property types for the react-based `Panels`
// Port sync status for displaying in the status panel
export interface PortSyncStatus {
  enabled: boolean; // Whether to show the panel
  symbolPorts: SymbolPortStatus[]; // Ports from the symbol with their status
  unconnectedPorts: string[]; // Ports in schematic but not in symbol
}

export interface PanelProps {
  panelOpen: boolean;
  controlPanel: ControlPanelProps;
  codePrelude: CodePreludeProps;
  isSymbolFile?: boolean; // Whether editing a .sym.svg (true) or .sch.svg (false)
  canvasTools?: ToolbarItem[]; // Canvas manipulation tools (select, pan, zoom)
  toolbarItems?: ToolbarItem[]; // Primary toolbar items (wire, draw, insert)
  contextTools?: ToolbarItem[]; // Context-sensitive tools (rotate, flip, delete)
  portSyncStatus?: PortSyncStatus; // Port sync status for symbol files
}
// Associated "impl" functions
export const panelProps = {
  // Create the default-value `PanelProps`.
  // Note it's important that we keep `PanelProps` default-constructible,
  // so that it can be used as a react state, i.e. passed as an initial value to `useState`.
  default: (): PanelProps => {
    return {
      panelOpen: true, // Always show the tools panel
      controlPanel: { items: [] },
      codePrelude: { codePrelude: "" },
      isSymbolFile: false,
      canvasTools: [],
      toolbarItems: [],
      contextTools: [],
    };
  },
};
// Type alias for functions which take a `PanelProps` and return nothing.
// Commonly used for updating `Panels`.
export type PanelUpdater = (props: PanelProps) => void;

// # ToolbarButton
//
// A simple toolbar button with icon and tooltip showing name + shortcut.
//
function ToolbarButton({ item }: { item: ToolbarItem }) {
  const tooltipTitle = (
    <span>
      {item.text}
      <span style={{ marginLeft: 8, opacity: 0.7, fontFamily: "monospace" }}>
        [{item.shortcutKey}]
      </span>
    </span>
  );

  return (
    <Tooltip title={tooltipTitle} arrow placement="bottom">
      <IconButton
        onClick={item.onClick}
        size="small"
        sx={{
          color: "var(--vscode-foreground, inherit)",
          "&:hover": {
            backgroundColor: "var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31))",
          },
        }}
      >
        {item.icon}
      </IconButton>
    </Tooltip>
  );
}

// # SplitToolbarButton
//
// A toolbar button with a dropdown chevron for accessing sub-options.
// Click main icon = primary action, click chevron = open dropdown menu.
//
function SplitToolbarButton({ item }: { item: ToolbarItem }) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const tooltipTitle = (
    <span>
      {item.text}
      <span style={{ marginLeft: 8, opacity: 0.7, fontFamily: "monospace" }}>
        [{item.shortcutKey}]
      </span>
    </span>
  );

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Tooltip title={tooltipTitle} arrow placement="bottom">
        <IconButton
          onClick={item.onClick}
          size="small"
          sx={{
            color: "var(--vscode-foreground, inherit)",
            borderRadius: "4px 0 0 4px",
            "&:hover": {
              backgroundColor: "var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31))",
            },
          }}
        >
          {item.icon}
        </IconButton>
      </Tooltip>
      <Tooltip title="More options" arrow placement="bottom">
        <IconButton
          onClick={handleMenuOpen}
          size="small"
          sx={{
            color: "var(--vscode-foreground, inherit)",
            borderRadius: "0 4px 4px 0",
            padding: "4px 2px",
            minWidth: "20px",
            "&:hover": {
              backgroundColor: "var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31))",
            },
          }}
        >
          <ArrowDropDownIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        sx={{
          "& .MuiPaper-root": {
            backgroundColor: "var(--vscode-menu-background, #252526)",
            color: "var(--vscode-menu-foreground, #cccccc)",
            border: "1px solid var(--vscode-menu-border, #454545)",
            minWidth: 150,
          },
        }}
      >
        {item.dropdownItems?.map((dropItem, idx) => (
          <MenuItem
            key={idx}
            onClick={() => {
              dropItem.onClick();
              handleMenuClose();
            }}
            sx={{
              fontSize: "13px",
              padding: "6px 12px",
              "&:hover": {
                backgroundColor: "var(--vscode-menu-selectionBackground, #094771)",
              },
            }}
          >
            {dropItem.icon && (
              <Box sx={{ mr: 1, display: "flex", alignItems: "center" }}>
                {dropItem.icon}
              </Box>
            )}
            <span style={{ flex: 1 }}>{dropItem.text}</span>
            {dropItem.shortcutKey && (
              <span
                style={{
                  marginLeft: 16,
                  opacity: 0.6,
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              >
                [{dropItem.shortcutKey}]
              </span>
            )}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

// # PortStatusPanel
//
// Shows the sync status between symbol ports and schematic ports.
// Appears in the bottom-right corner when editing symbol files.
//
function PortStatusPanel({ portSyncStatus }: { portSyncStatus?: PortSyncStatus }) {
  if (!portSyncStatus?.enabled) return null;

  const { symbolPorts, unconnectedPorts } = portSyncStatus;

  // Check if there are any issues
  const hasIssues = symbolPorts.some(p => p.status !== "matched") || unconnectedPorts.length > 0;

  // Status indicator styles
  const getStatusColor = (status: string) => {
    switch (status) {
      case "matched": return "#4ec9b0"; // Green
      case "unimplemented": return "#f14c4c"; // Red
      case "unconnected": return "#dcdcaa"; // Yellow
      default: return "#888";
    }
  };

  const getStatusSymbol = (status: string) => {
    switch (status) {
      case "matched": return "●"; // Filled circle
      case "unimplemented": return "○"; // Empty circle
      case "unconnected": return "◐"; // Half circle
      default: return "?";
    }
  };

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        backgroundColor: "var(--vscode-editor-background, #1e1e1e)",
        border: "1px solid var(--vscode-panel-border, #454545)",
        borderRadius: "4px",
        padding: "8px 12px",
        minWidth: "180px",
        maxHeight: "200px",
        overflowY: "auto",
        zIndex: 1000,
        fontSize: "12px",
        fontFamily: "var(--vscode-font-family, 'Segoe UI', sans-serif)",
        color: "var(--vscode-foreground, #cccccc)",
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 1, fontWeight: "bold" }}>
        <span style={{ marginRight: "8px", color: hasIssues ? "#f14c4c" : "#4ec9b0" }}>
          {hasIssues ? "⚠" : "✓"}
        </span>
        <span>Port Status</span>
      </Box>

      {/* Symbol ports */}
      {symbolPorts.map((port, idx) => (
        <Box key={`sym-${idx}`} sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <span style={{ color: getStatusColor(port.status), marginRight: "8px", width: "12px" }}>
            {getStatusSymbol(port.status)}
          </span>
          <span style={{ flex: 1 }}>{port.name}</span>
          {port.status === "unimplemented" && (
            <span style={{ color: "#888", fontSize: "10px" }}>(no impl)</span>
          )}
        </Box>
      ))}

      {/* Unconnected ports (in schematic but not symbol) */}
      {unconnectedPorts.map((name, idx) => (
        <Box key={`unc-${idx}`} sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
          <span style={{ color: getStatusColor("unconnected"), marginRight: "8px", width: "12px" }}>
            {getStatusSymbol("unconnected")}
          </span>
          <span style={{ flex: 1 }}>{name}</span>
          <span style={{ color: "#888", fontSize: "10px" }}>(orphan)</span>
        </Box>
      ))}

      {/* All good message */}
      {!hasIssues && symbolPorts.length > 0 && (
        <Box sx={{ color: "#4ec9b0", mt: 0.5 }}>All ports matched</Box>
      )}
    </Box>
  );
}

// # TopToolbar
//
// The main toolbar component that replaces the right-side panel.
// Shows primary tools and context-sensitive tools in a horizontal bar.
//
function TopToolbar(props: PanelProps) {
  const canvasTools = props.canvasTools || [];
  const toolbarItems = props.toolbarItems || [];
  const contextTools = props.contextTools || [];

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "var(--vscode-editor-background, #1e1e1e)",
        borderBottom: "1px solid var(--vscode-panel-border, #454545)",
        minHeight: "40px !important",
        zIndex: 1000,
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          minHeight: "40px !important",
          padding: "0 8px !important",
          gap: 0.5,
        }}
      >
        {/* Canvas Manipulation Tools (Select, Pan, Zoom) */}
        {canvasTools.map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}

        {/* Divider between canvas tools and primary tools */}
        {canvasTools.length > 0 && toolbarItems.length > 0 && (
          <Divider
            orientation="vertical"
            flexItem
            sx={{
              mx: 1,
              borderColor: "var(--vscode-panel-border, #454545)",
            }}
          />
        )}

        {/* Primary Tools (Wire, Draw, Insert) */}
        {toolbarItems.map((item) =>
          item.dropdownItems && item.dropdownItems.length > 0 ? (
            <SplitToolbarButton key={item.id} item={item} />
          ) : (
            <ToolbarButton key={item.id} item={item} />
          )
        )}

        {/* Divider between primary and context tools */}
        {contextTools.length > 0 && toolbarItems.length > 0 && (
          <Divider
            orientation="vertical"
            flexItem
            sx={{
              mx: 1,
              borderColor: "var(--vscode-panel-border, #454545)",
            }}
          />
        )}

        {/* Context-sensitive Tools (Rotate, Flip, Delete) */}
        {contextTools.map((item) => (
          <ToolbarButton key={item.id} item={item} />
        ))}
      </Toolbar>
    </AppBar>
  );
}

interface CodePreludeProps {
  codePrelude: string;
}
function CodePreludeEditor(props: CodePreludeProps) {
  // const ref = React.useRef<HTMLInputElement>();
  return (
    <TextField
      id="outlined-multiline-static"
      label="Code Prelude"
      multiline
      rows={8}
      value={props.codePrelude}
      onChange={(e) => theEditor.updateCodePrelude(e.target.value)}
      onFocus={(_) => theEditor.startEditPrelude()}
      onBlur={(_) => theEditor.goUiIdle()}
      // FIXME: add the "exit this mode on escape" functionality.
      // This doesn't quite do it.
      // onKeyDown={(e) => {
      //   if (e.key === Keys.Escape && ref.current) {
      //     ref.current.blur();
      //     return theEditor.goUiIdle();
      //   }
      // }}
    />
  );
}

// # Control Panel Item (legacy, kept for backwards compatibility)
//
// An entry in the control panel list,
// including its text, logos, and click handler.
//
export interface ControlPanelItem {
  text: string; // Text displayed in the control panel
  icon: any; // FIXME: whatever this gonna be
  shortcutKey: any; // FIXME: that too
  onClick: () => void; // Callback when clicked
}

interface ControlPanelProps {
  items: Array<ControlPanelItem>;
}

// # Toolbar Item
//
// An entry in the top toolbar with icon, tooltip, and optional dropdown.
//
export interface ToolbarItem {
  id: string; // Unique identifier
  text: string; // Display name for tooltip
  icon: React.ReactNode; // MUI Icon component or custom SVG
  shortcutKey: string; // Keyboard shortcut for tooltip
  onClick: () => void; // Primary action when clicked
  dropdownItems?: ToolbarDropdownItem[]; // Optional submenu items
}

export interface ToolbarDropdownItem {
  text: string; // Display name
  shortcutKey?: string; // Optional keyboard shortcut
  icon?: React.ReactNode; // Optional icon
  onClick: () => void; // Action when clicked
}

// Custom icon for port: arrow with empty circle head
const PortIcon = () => (
  <SvgIcon viewBox="0 0 24 24">
    {/* Arrow line from bottom-left to upper-right */}
    <line x1="5" y1="19" x2="14" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {/* Empty circle at the arrowhead */}
    <circle cx="17" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
  </SvgIcon>
);

// Map of tool IDs to their icons
export const ToolIcons: Record<string, React.ReactNode> = {
  // Canvas manipulation tools
  "select": <NearMeIcon />,
  "rect-select": <HighlightAltIcon />,
  "fit-view": <FitScreenIcon />,
  // Wire tool
  "add-wire": <TimelineIcon />,
  // Draw tools (for symbols)
  "draw-line": <ShowChartIcon />,
  "draw-rect": <CropSquareIcon />,
  "draw-circle": <RadioButtonUncheckedIcon />,
  "draw-text": <TextFieldsIcon />,
  // Device/port insertion
  "add-instance": <MemoryIcon />,
  "add-port": <PortIcon />,
  // Transform tools
  "rotate": <RotateRightIcon />,
  "flip-h": <FlipIcon />,
  "flip-v": <FlipIcon sx={{ transform: "rotate(90deg)" }} />,
  "delete": <DeleteIcon />,
};
