import { UserSettings } from './types.js'; // Path will be correct within core/src/settings

const defaultSettings: UserSettings = {
    toolApprovalRequired: false,
};

export function getDefaultUserSettings(): UserSettings {
    return defaultSettings;
}
