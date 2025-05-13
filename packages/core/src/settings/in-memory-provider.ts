import { SettingsProvider, UserSettings } from './types.js'; // Path will be correct within core/src/settings
import { getDefaultUserSettings } from './utils.js'; // Path will be correct within core/src/settings

export class InMemorySettingsProvider implements SettingsProvider {
    private userSettings: UserSettings = getDefaultUserSettings();

    async getUserSettings(userId?: string): Promise<UserSettings> {
        return this.userSettings;
    }

    async updateUserSettings(userId: string, settings: UserSettings): Promise<void> {
        this.userSettings = settings;
    }
}
