//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import { Logger } from "@utils/Logger";
import { findStoreLazy } from "@webpack";

import { settings } from "./settings";
import { getNative } from "./nativeUtils";
// endregion Imports

import { pluginInfo } from "./info";
export { pluginInfo };

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
// endregion Variables

// region Utils
function getXPath(element: Element): string {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return "";
    }

    if (element.id) {
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

function inspectElement(element: Element | null): any {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const attributes: Record<string, string> = {};

    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
    }

    const parent = element.parentElement;
    const parentInfo = parent ? {
        tagName: parent.tagName.toLowerCase(),
        id: parent.id || null,
        className: parent.className || null,
        hasParent: true
    } : { hasParent: false };

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
        textContent: element.textContent?.substring(0, 200) || null,
        innerHTML: element.innerHTML.substring(0, 500) || null,
        attributes,
        boundingRect: {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right
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

async function handleToolCall(toolName: string, args: any): Promise<any> {
    try {
        switch (toolName) {
            case "evaluate_javascript": {
                const { code } = args;
                if (!code || typeof code !== "string") {
                    throw new Error("code parameter is required and must be a string");
                }
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
                    findStoreLazy(storeName);
                    return {
                        name: storeName,
                        available: true,
                        note: "Use get_store_method to call specific methods on the store"
                    };
                } catch (error) {
                    throw new Error(`Store '${storeName}' not found: ${error}`);
                }
            }

            case "get_store_method": {
                const { storeName, methodName, args: methodArgs = [] } = args;
                if (!storeName || typeof storeName !== "string" || !methodName || typeof methodName !== "string") {
                    throw new Error("storeName and methodName parameters are required");
                }
                try {
                    const store = findStoreLazy(storeName);
                    if (typeof store[methodName] !== "function") {
                        throw new Error(`Method '${methodName}' not found on store '${storeName}'`);
                    }
                    const result = store[methodName](...methodArgs);
                    return result instanceof Promise ? await result : result;
                } catch (error: any) {
                    throw new Error(`Error calling ${storeName}.${methodName}: ${error.message}`);
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
                        return { found: false, selector, error: `No element found matching selector: ${selector}` };
                    }
                    return { found: true, selector, element: inspectElement(element) };
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
// endregion Utils

// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,

    async start() {
        if (!settings.store.enabled) {
            logger.info("MCP server is disabled");
            return;
        }

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
        }
    },

    async stop() {
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
// endregion Definition
