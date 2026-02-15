// Created at 2026-01-01 05:23:19
export function getNative() {
    return Object.values(VencordNative.pluginHelpers)
        .find(m => m.discordMCPUniqueIdThingyIdkMan) as any;
}
