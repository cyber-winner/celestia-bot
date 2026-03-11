
class HanimeProvider {
    constructor() {
        this.API_URL = 'https://danbooru.donmai.us/posts.json';
    }

    async search(query = '', page = 1) {
        try {
            
            let tags = 'video rating:explicit';
            if (query) {
                
                tags += ' ' + query.split(' ').join('_');
            }
            const response = await fetch(`${this.API_URL}?tags=${encodeURIComponent(tags)}&limit=20&page=${page}`);
            const data = await response.json();

            
            const videos = Array.isArray(data)
                ? data.filter(post => post.file_url && (post.file_url.endsWith('.mp4') || post.file_url.endsWith('.webm')))
                : [];

            return {
                results: videos.map(v => ({
                    name: `Danbooru ID: ${v.id}`,
                    poster_url: v.preview_file_url || '',
                    video_url: v.file_url
                })),
                page: page,
                total_pages: 1 
            };
        } catch (error) {
            console.error('[Danbooru Video] Search error:', error.message);
            return { results: [], page: 0, total_pages: 0 };
        }
    }
}

module.exports = HanimeProvider;
