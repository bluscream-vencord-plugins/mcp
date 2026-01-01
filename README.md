# DiscordMCP

A Vencord plugin that provides an MCP (Model Context Protocol) server for inspecting Discord and running JavaScript code.

## Features

-   **MCP Server**: Provides an HTTP-based MCP server that can be connected to by MCP clients
-   **JavaScript Execution**: Execute JavaScript code in Discord's context
-   **Store Inspection**: Access and inspect Discord's Flux stores
-   **Webpack Module Discovery**: Find webpack modules by properties
-   **Variable Discovery**: Recursively search for variables in document.* by name (case-insensitive)
-   **Element Inspection**: Inspect DOM elements with detailed metadata including XPath, attributes, computed styles, children/parent info, and position data

## Installation

1. Enable the plugin in Vencord's settings
2. Configure the port (default: 8787)
3. The MCP server will start automatically when the plugin is enabled

## Configuration

-   **Port**: The port the MCP server listens on (default: 8787)
-   **Enabled**: Toggle to enable/disable the MCP server

## MCP Tools

### `evaluate_javascript`

Execute JavaScript code in Discord's context.

**Parameters:**

-   `code` (string, required): JavaScript code to execute

**Example:**

```json
{
    "code": "UserStore.getCurrentUser()"
}
```

### `get_store`

Get information about a Discord Flux store.

**Parameters:**

-   `storeName` (string, required): Name of the store (e.g., "UserStore", "GuildStore")

### `get_store_method`

Call a method on a Discord store.

**Parameters:**

-   `storeName` (string, required): Name of the store
-   `methodName` (string, required): Name of the method to call
-   `args` (array, optional): Arguments to pass to the method

**Example:**

```json
{
    "storeName": "UserStore",
    "methodName": "getCurrentUser",
    "args": []
}
```

### `find_webpack_module`

Find a webpack module by properties.

**Parameters:**

-   `props` (array, optional): Property names to search for
-   `code` (string, optional): Code string to search for (not fully implemented)

### `find_variable`

Recursively search for a variable name (case-insensitive partial match) in `document.*`.

**Parameters:**

-   `name` (string, required): Part of variable name to search for (case-insensitive)
-   `maxDepth` (number, optional): Maximum recursion depth (default: 5)

**Example:**

```json
{
    "name": "query",
    "maxDepth": 3
}
```

This will find all properties in `document.*` whose names contain "query" (case-insensitive), such as `document.querySelector`, `document.querySelectorAll`, etc.

### `inspect_element`

Inspect a DOM element using a CSS selector (like `querySelector`) and return detailed metadata about the element.

**Parameters:**

-   `selector` (string, required): CSS selector string to find the element (e.g., `"#myId"`, `".myClass"`, `"div > button"`, etc.)

**Returns:**

The tool returns comprehensive metadata about the element including:

-   **Basic Info**: Tag name, ID, class name, text content, innerHTML
-   **XPath**: Full XPath expression to locate the element
-   **Attributes**: All HTML attributes as key-value pairs
-   **Bounding Rectangle**: Position and size information (x, y, width, height, top, left, bottom, right)
-   **Computed Styles**: Important CSS properties (display, visibility, position, colors, fonts, spacing, etc.)
-   **Parent Info**: Tag name, ID, and class of the parent element
-   **Children Info**: Count of children, first 50 child elements with their tag names, IDs, and classes
-   **Visibility**: Whether the element is visible and if it's in the viewport
-   **Scroll Info**: Scroll position and scroll dimensions
-   **Dimensions**: Offset width and height

**Example:**

```json
{
    "selector": "#app-mount"
}
```

This will return detailed information about the element with ID `app-mount`, including its XPath, all attributes, computed styles, children, parent information, and more.

## Usage with MCP Clients

The server implements the MCP protocol over HTTP. Connect to it using an MCP client configured to use HTTP transport.

**Server URL:** `http://127.0.0.1:8787` (or your configured port)

## Security Warning

⚠️ **WARNING**: This plugin allows arbitrary JavaScript execution in Discord's context. Only use this plugin if you trust the MCP clients connecting to it. Do not expose the server to untrusted networks.

## License

GPL-3.0-or-later
