const axios = require('axios');


class RedgifsProvider {
    constructor() {
        this.API_URL = 'https://api.redgifs.com/v2';
        this.token = null;
        this.tokenExpiry = null;
    }

    async getAuthToken() {
        
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        try {
            const response = await axios.get(`${this.API_URL}/auth/temporary`, { timeout: 10000 });
            if (response.data && response.data.token) {
                this.token = response.data.token;
                
                this.tokenExpiry = Date.now() + (60 * 60 * 1000);
                return this.token;
            }
        } catch (error) {
            console.error('[Redgifs] Auth error:', error.message);
        }
        return null;
    }

    
    async search(query = '') {
        try {
            const token = await this.getAuthToken();
            if (!token) return { videos: [] };

            const response = await axios.get(`${this.API_URL}/gifs/search`, {
                params: {
                    search_text: query || 'popular',
                    count: 20,
                    order: 'trending'
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 10000
            });

            const rawGifs = response.data?.gifs || [];

            
            const videos = rawGifs
                .filter(g => g.urls && (g.urls.hd || g.urls.sd))
                .map(v => ({
                    title: v.tags ? v.tags.slice(0, 3).join(', ') : 'Untitled GIF',
                    url: v.urls.hd || v.urls.sd,
                    duration: Math.floor(v.duration || 0) + 's',
                    thumb: v.urls.thumbnail || ''
                }));

            return { videos, count: videos.length };
        } catch (error) {
            console.error('[Redgifs] Search error:', error.message);
            return { videos: [], count: 0 };
        }
    }
}

module.exports = RedgifsProvider;
