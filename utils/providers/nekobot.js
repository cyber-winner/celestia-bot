const axios = require('axios');


class NekoBotProvider {
    constructor() {
        this.API_URL = 'https://nekobot.xyz/api/image';
    }

    async getRandomImage(category) {
        try {
            const response = await axios.get(this.API_URL, {
                params: { type: category },
                timeout: 10000
            });

            if (response.data && response.data.success) {
                return response.data.message;
            }
            console.warn(`[NekoBot] API returned non-success for "${category}":`, response.data);
            return null;
        } catch (error) {
            console.error('[NekoBot] Error:', error.response?.data || error.message);
            return null;
        }
    }
}

module.exports = NekoBotProvider;
