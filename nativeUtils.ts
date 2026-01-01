/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function getNative() {
    return Object.values(VencordNative.pluginHelpers)
        .find(m => m.discordMCPUniqueIdThingyIdkMan) as any;
}
