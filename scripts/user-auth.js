/**
 * User Authentication Module - Phase 1
 *
 * Handles anonymous user token generation and storage for cross-session memory.
 * Each user gets a persistent token stored in localStorage for profile continuity.
 */

class UserAuth {
    constructor() {
        this.USER_TOKEN_KEY = 'quran_user_token';
        this.USER_INFO_KEY = 'quran_user_info';

        // Initialize or retrieve user token
        this.userToken = this.initializeUserToken();
        this.userInfo = this.loadUserInfo();

        console.log('[UserAuth] Initialized with token:', this.userToken);
    }

    /**
     * Initialize user token (create new or load existing)
     * @returns {string} User token
     */
    initializeUserToken() {
        let token = localStorage.getItem(this.USER_TOKEN_KEY);

        if (!token) {
            // Generate new anonymous token
            token = this.generateToken();
            localStorage.setItem(this.USER_TOKEN_KEY, token);
            console.log('[UserAuth] Generated new user token:', token);

            // Initialize default user info
            this.saveUserInfo({
                preferred_name: 'Student',
                created_at: new Date().toISOString(),
                islamic_background: 'beginner',
                arabic_proficiency: 'none'
            });
        } else {
            console.log('[UserAuth] Loaded existing user token:', token);
        }

        return token;
    }

    /**
     * Generate a random anonymous user token
     * @returns {string} Token in format: anon_XXXXXXXXXXXXXXXX
     */
    generateToken() {
        const randomPart = this.generateRandomString(24);
        return `anon_${randomPart}`;
    }

    /**
     * Generate random alphanumeric string
     * @param {number} length - Length of string
     * @returns {string} Random string
     */
    generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let result = '';
        const randomValues = new Uint8Array(length);
        crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            result += chars[randomValues[i] % chars.length];
        }

        return result;
    }

    /**
     * Get current user token
     * @returns {string} User token
     */
    getUserToken() {
        return this.userToken;
    }

    /**
     * Load user info from localStorage
     * @returns {Object|null} User info object
     */
    loadUserInfo() {
        const infoStr = localStorage.getItem(this.USER_INFO_KEY);
        if (infoStr) {
            try {
                return JSON.parse(infoStr);
            } catch (e) {
                console.error('[UserAuth] Failed to parse user info:', e);
                return null;
            }
        }
        return null;
    }

    /**
     * Save user info to localStorage
     * @param {Object} info - User info object
     */
    saveUserInfo(info) {
        this.userInfo = { ...this.userInfo, ...info };
        localStorage.setItem(this.USER_INFO_KEY, JSON.stringify(this.userInfo));
        console.log('[UserAuth] Saved user info:', this.userInfo);
    }

    /**
     * Get user info
     * @returns {Object|null} User info object
     */
    getUserInfo() {
        return this.userInfo;
    }

    /**
     * Update user preference
     * @param {string} key - Preference key
     * @param {string} value - Preference value
     */
    setPreference(key, value) {
        if (!this.userInfo) {
            this.userInfo = {};
        }

        if (!this.userInfo.preferences) {
            this.userInfo.preferences = {};
        }

        this.userInfo.preferences[key] = value;
        this.saveUserInfo(this.userInfo);
    }

    /**
     * Get user preference
     * @param {string} key - Preference key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Preference value
     */
    getPreference(key, defaultValue = null) {
        if (!this.userInfo || !this.userInfo.preferences) {
            return defaultValue;
        }
        return this.userInfo.preferences[key] || defaultValue;
    }

    /**
     * Reset user (for testing or user request)
     * WARNING: This deletes all user data!
     */
    resetUser() {
        if (confirm('This will delete all your user data and preferences. Are you sure?')) {
            localStorage.removeItem(this.USER_TOKEN_KEY);
            localStorage.removeItem(this.USER_INFO_KEY);

            // Reinitialize
            this.userToken = this.initializeUserToken();
            this.userInfo = this.loadUserInfo();

            console.log('[UserAuth] User reset complete. New token:', this.userToken);

            // Reload page to apply changes
            window.location.reload();
        }
    }

    /**
     * Update user profile information
     * @param {Object} profileData - Profile data (name, age, background, etc.)
     */
    updateProfile(profileData) {
        const allowedFields = [
            'preferred_name',
            'full_name',
            'age',
            'occupation',
            'education_level',
            'islamic_background',
            'native_language',
            'arabic_proficiency',
            'learning_goals'
        ];

        const filtered = {};
        for (const key of allowedFields) {
            if (profileData.hasOwnProperty(key)) {
                filtered[key] = profileData[key];
            }
        }

        this.saveUserInfo(filtered);
        console.log('[UserAuth] Profile updated:', filtered);
    }

    /**
     * Get statistics about user's usage (from backend)
     * This would normally call an API endpoint
     * @returns {Promise<Object>} User statistics
     */
    async getUserStats() {
        // TODO: Implement API call to fetch user analytics
        // For now, return basic local info
        return {
            token: this.userToken,
            created_at: this.userInfo?.created_at,
            preferences: this.userInfo?.preferences || {}
        };
    }
}

// Create global instance
window.userAuth = new UserAuth();

console.log('[Phase 1] User Authentication System loaded');
