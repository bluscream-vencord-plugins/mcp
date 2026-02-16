import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    port: {
        type: OptionType.NUMBER,
        description: "MCP server port",
        default: 8787,
        restartNeeded: true,
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable MCP server",
        default: true,
        restartNeeded: true,
    }
});
