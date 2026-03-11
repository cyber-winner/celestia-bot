const axios = require('axios');


class WaifuPicsProvider {
    constructor() {
        this.API_URL = 'https://api.waifu.pics/nsfw';
    }

    async getRandomImage(category = 'waifu') {
        try {
            const response = await axios.get(`${this.API_URL}/${category}`, {
                timeout: 10000
            });
            if (response.data && response.data.url) {
                return response.data.url;
            }
            console.warn(`[WaifuPics] No URL for category: ${category}`);
            return null;
        } catch (error) {
            console.error('[WaifuPics] Error:', error.response?.data || error.message);
            return null;
        }
    }

    
    async getManyImages(category = 'waifu') {
        try {
            const response = await axios.post(`${this.API_URL}/${category}`, {}, {
                timeout: 10000
            });
            if (response.data && response.data.files) {
                return response.data.files;
            }
            return [];
        } catch (error) {
            console.error('[WaifuPics] Bulk error:', error.message);
            return [];
        }
    }
}

module.exports = WaifuPicsProvider;
