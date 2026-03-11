

const NekoBotProvider = require('./providers/nekobot');
const WaifuPicsProvider = require('./providers/waifupics');
const HanimeProvider = require('./providers/hanime');
const RedgifsProvider = require('./providers/redgifs');

class NSFWApiWrapper {
    constructor() {
        this.nekobot = new NekoBotProvider();
        this.waifupics = new WaifuPicsProvider();
        this.hanime = new HanimeProvider();
        this.redgifs = new RedgifsProvider();
    }

    

    
    async getHentaiImage(source = 'nekobot', category = 'hentai') {
        try {
            switch (source) {
                case 'waifupics':
                    return await this.waifupics.getRandomImage(category);
                case 'nekobot':
                default:
                    return await this.nekobot.getRandomImage(category);
            }
        } catch (err) {
            console.error('[NSFW-API] Hentai image error:', err.message);
            return null;
        }
    }

    

    
    async searchHentaiVideos(query = '') {
        try {
            return await this.hanime.search(query);
        } catch (err) {
            console.error('[NSFW-API] Hentai video error:', err.message);
            return { results: [] };
        }
    }

    

    
    async getPornImage(category = '4k') {
        try {
            return await this.nekobot.getRandomImage(category);
        } catch (err) {
            console.error('[NSFW-API] Porn image error:', err.message);
            return null;
        }
    }

    

    
    async searchPornVideos(query = '') {
        try {
            return await this.redgifs.search(query);
        } catch (err) {
            console.error('[NSFW-API] Porn video error:', err.message);
            return { videos: [] };
        }
    }
}

module.exports = new NSFWApiWrapper();
