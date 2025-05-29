/**
 * Example: User Settings Storage
 *
 * This demonstrates type-safe storage for user preferences and settings.
 * Shows how generic types provide compile-time validation and IntelliSense.
 */

import type { StorageManager } from '../factory.js';
import type { StorageProvider } from '../types.js';

// Define the user settings data structure
export interface UserSettings {
    theme: {
        mode: 'light' | 'dark';
        accent: string;
    };
    notifications: {
        enabled: boolean;
        email: boolean;
        desktop: boolean;
    };
    preferences: {
        language: string;
        timezone: string;
        autoSave: boolean;
    };
}

export class UserSettingsService {
    private settings!: StorageProvider<UserSettings>;

    constructor(private storageManager: StorageManager) {}

    async initialize(): Promise<void> {
        // Get type-safe storage provider for UserSettings
        this.settings = await this.storageManager.getProvider<UserSettings>('userInfo');
    }

    async getSettings(): Promise<UserSettings> {
        return (await this.settings.get('settings')) ?? this.getDefaultSettings();
    }

    async updateTheme(theme: UserSettings['theme']): Promise<void> {
        const settings = await this.getSettings();
        settings.theme = theme;
        await this.settings.set('settings', settings);
    }

    async updateNotifications(notifications: UserSettings['notifications']): Promise<void> {
        const settings = await this.getSettings();
        settings.notifications = notifications;
        await this.settings.set('settings', settings);
    }

    async updatePreferences(preferences: UserSettings['preferences']): Promise<void> {
        const settings = await this.getSettings();
        settings.preferences = preferences;
        await this.settings.set('settings', settings);
    }

    private getDefaultSettings(): UserSettings {
        return {
            theme: {
                mode: 'light',
                accent: '#007acc',
            },
            notifications: {
                enabled: true,
                email: true,
                desktop: false,
            },
            preferences: {
                language: 'en',
                timezone: 'UTC',
                autoSave: true,
            },
        };
    }

    async resetToDefaults(): Promise<void> {
        await this.settings.set('settings', this.getDefaultSettings());
    }
}
