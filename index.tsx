/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";

import { getNative } from "./nativeUtils";

const logger = new Logger("DiscordMCP", "#5865F2");

// Helper function to generate XPath for an element
function getXPath(element: Element): string {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return "";
    }

    if (element.id) {
        // If element has an ID, use it for XPath (much faster)
        return `//*[@id="${element.id}"]`;
    }

    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
            if (sibling.nodeName === current.nodeName) {
                index++;
            }
            sibling = sibling.previousElementSibling;
        }

        const tagName = current.nodeName.toLowerCase();
        const indexStr = index > 1 ? `[${index}]` : "";
        parts.unshift(`${tagName}${indexStr}`);
        current = current.parentElement;
    }

    return parts.length ? `/${parts.join("/")}` : "";
}

// Helper function to get element metadata
function inspectElement(element: Element | null): any {
    if (!element) {
        return null;
    }

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const attributes: Record<string, string> = {};

    // Get all attributes
    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
    }

    // Get parent info
    const parent = element.parentElement;
    const parentInfo = parent ? {
        tagName: parent.tagName.toLowerCase(),
        id: parent.id || null,
        className: parent.className || null,
        hasParent: true
    } : { hasParent: false };

    // Get children info
    const children = element.children;
    const childElements: Array<{ tagName: string; id: string | null; className: string | null; }> = [];
    for (let i = 0; i < Math.min(children.length, 50); i++) {
        const child = children[i] as Element;
        childElements.push({
            tagName: child.tagName.toLowerCase(),
            id: child.id || null,
            className: child.className || null
        });
    }

    return {
        tagName: element.tagName.toLowerCase(),
        xpath: getXPath(element),
        id: element.id || null,
        className: element.className || null,
        textContent: element.textContent?.substring(0, 200) || null, // Limit text content
        innerHTML: element.innerHTML.substring(0, 500) || null, // Limit HTML content
        attributes,
        boundingRect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right
        },
        computedStyles: {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            backgroundColor: computedStyle.backgroundColor,
            color: computedStyle.color,
            fontSize: computedStyle.fontSize,
            fontWeight: computedStyle.fontWeight,
            fontFamily: computedStyle.fontFamily,
            margin: computedStyle.margin,
            padding: computedStyle.padding,
            border: computedStyle.border,
            borderRadius: computedStyle.borderRadius,
            cursor: computedStyle.cursor
        },
        parent: parentInfo,
        children: {
            count: children.length,
            childElementCount: element.childElementCount,
            firstFew: childElements,
            hasMore: children.length > 50
        },
        isVisible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== "hidden" && computedStyle.display !== "none",
        isInViewport: rect.top >= 0 && rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth),
        nodeName: element.nodeName,
        namespaceURI: element.namespaceURI || null,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        offsetWidth: element.clientWidth,
        offsetHeight: element.clientHeight
    };
}

const settings = definePluginSettings({
    port: {
        type: OptionType.NUMBER,
        description: "MCP server port",
        default: 8787
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable MCP server",
        default: true
    }
});

async function handleToolCall(toolName: string, args: any): Promise<any> {
    try {
        switch (toolName) {
            case "evaluate_javascript": {
                const { code } = args;
                if (!code || typeof code !== "string") {
                    throw new Error("code parameter is required and must be a string");
                }

                // Execute code in the Discord context
                // Using Function constructor to avoid eslint issues
                const AsyncFunction = (async function () { }).constructor as typeof Function;
                const func = new AsyncFunction(code);
                const result = await func();
                return result === undefined ? null : result;
            }

            case "get_store": {
                const { storeName } = args;
                if (!storeName || typeof storeName !== "string") {
                    throw new Error("storeName parameter is required and must be a string");
                }

                try {
                    const store = findStoreLazy(storeName);
                    // Return store state in a serializable format
                    // Note: We can't serialize the entire store object, so we return a summary
                    return {
                        name: storeName,
                        available: true,
                        // Return store's public properties if possible
                        // Most stores don't expose a clean way to get all state
                        note: "Use get_store_method to call specific methods on the store"
                    };
                } catch (error) {
                    throw new Error(`Store '${storeName}' not found: ${error}`);
                }
            }

            case "get_store_method": {
                const { storeName, methodName, args: methodArgs = [] } = args;
                if (!storeName || typeof storeName !== "string") {
                    throw new Error("storeName parameter is required");
                }
                if (!methodName || typeof methodName !== "string") {
                    throw new Error("methodName parameter is required");
                }

                try {
                    const store = findStoreLazy(storeName);
                    if (typeof store[methodName] !== "function") {
                        throw new Error(`Method '${methodName}' not found on store '${storeName}'`);
                    }

                    const result = store[methodName](...methodArgs);
                    // If it's a promise, await it
                    return result instanceof Promise ? await result : result;
                } catch (error: any) {
                    throw new Error(`Error calling ${storeName}.${methodName}: ${error.message}`);
                }
            }

            case "find_webpack_module": {
                const { props, code } = args;
                if (!props && !code) {
                    throw new Error("Either props or code parameter is required");
                }

                try {
                    if (props && Array.isArray(props)) {
                        const module = findByPropsLazy(...props);
                        return {
                            found: true,
                            type: "props",
                            props,
                            note: "Module found. Use evaluate_javascript to access it."
                        };
                    } else if (code && typeof code === "string") {
                        // For code search, we'd need findByCodeLazy, but that's more complex
                        // For now, return a note
                        return {
                            found: false,
                            type: "code",
                            note: "Code-based search requires more complex implementation. Use props search instead."
                        };
                    }
                } catch (error) {
                    return {
                        found: false,
                        error: String(error)
                    };
                }
                break;
            }

            case "find_variable": {
                const { name, maxDepth = 5 } = args;
                if (!name || typeof name !== "string") {
                    throw new Error("name parameter is required and must be a string");
                }

                const searchTerm = name.toLowerCase();
                const matches: Array<{ path: string; value: any; }> = [];
                const visited = new WeakSet();
                const maxDepthNum = typeof maxDepth === "number" ? maxDepth : 5;

                function searchRecursive(obj: any, path: string, depth: number) {
                    if (depth > maxDepthNum) return;
                    if (obj === null || obj === undefined) return;
                    if (typeof obj === "function") return;

                    // Avoid circular references
                    if (typeof obj === "object") {
                        if (visited.has(obj)) return;
                        visited.add(obj);
                    }

                    try {
                        // Search in object properties
                        if (typeof obj === "object") {
                            for (const key in obj) {
                                try {
                                    // Check if property name matches (case-insensitive)
                                    if (key.toLowerCase().includes(searchTerm)) {
                                        matches.push({
                                            path: path ? `${path}.${key}` : key,
                                            value: obj[key]
                                        });
                                    }

                                    // Recursively search nested properties
                                    if (depth < maxDepthNum) {
                                        const value = obj[key];
                                        if (value !== null && value !== undefined && typeof value === "object") {
                                            searchRecursive(value, path ? `${path}.${key}` : key, depth + 1);
                                        }
                                    }
                                } catch (e) {
                                    // Skip properties that can't be accessed
                                }
                            }
                        }
                    } catch (e) {
                        // Skip if object can't be iterated
                    }
                }

                try {
                    searchRecursive(document, "document", 0);
                    return {
                        searchTerm: name,
                        matches: matches.slice(0, 100), // Limit to first 100 matches
                        totalMatches: matches.length,
                        note: matches.length > 100 ? "Showing first 100 matches" : undefined
                    };
                } catch (error: any) {
                    throw new Error(`Error searching document: ${error.message}`);
                }
            }

            case "inspect_element": {
                const { selector } = args;
                if (!selector || typeof selector !== "string") {
                    throw new Error("selector parameter is required and must be a string");
                }

                try {
                    const element = document.querySelector(selector);
                    if (!element) {
                        return {
                            found: false,
                            selector,
                            error: `No element found matching selector: ${selector}`
                        };
                    }

                    return {
                        found: true,
                        selector,
                        element: inspectElement(element)
                    };
                } catch (error: any) {
                    throw new Error(`Error inspecting element with selector '${selector}': ${error.message}`);
                }
            }

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    } catch (error: any) {
        logger.error(`Tool execution error for ${toolName}:`, error);
        throw error;
    }
}

export default definePlugin({
    name: "MCP Server",
    description: "MCP server for inspecting Discord and running JavaScript",
    authors: [{ name: "Bluscream", id: 467777925790564352n }, { name: "Cursor.AI", id: 0n }],
    settings,

    async start() {
        if (!settings.store.enabled) {
            logger.info("MCP server is disabled");
            return;
        }

        // Expose tool handler on window for native module to call
        (window as any).__discordMCPHandleTool = async (toolName: string, args: any) => {
            try {
                return { result: await handleToolCall(toolName, args), error: null };
            } catch (error: any) {
                return { result: null, error: error.message || String(error) };
            }
        };

        try {
            const native = getNative();
            if (!native) {
                logger.error("Native module not available. This plugin requires Discord Desktop.");
                return;
            }
            await native.startServer(settings.store.port);
            logger.info(`MCP server started on http://127.0.0.1:${settings.store.port}`);
        } catch (error: any) {
            logger.error("Failed to start MCP server:", error);
            logger.error("Error details:", error.message || error);
        }
    },

    async stop() {
        // Clean up window function
        delete (window as any).__discordMCPHandleTool;

        try {
            const native = getNative();
            await native.stopServer();
            logger.info("MCP server stopped");
        } catch (error) {
            logger.error("Failed to stop MCP server:", error);
        }
    }
});
