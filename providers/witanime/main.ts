/// <reference path="./online-streaming-provider.d.ts" />

/**
 * WitAnime (witanime.site) onlinestream provider for Seanime.
 *
 * Ported from the Cloudstream (Kotlin) provider in
 * https://github.com/Abodabodd/re-3arabi (module: Witanime)
 *
 * Flow (verified against the live site):
 *   1. search      -> GET  /search?q=...            (server-rendered, Livewire/Laravel)
 *   2. episodes    -> GET  /anime/{slug}             (a[href*='/watch/'])
 *   3. sources     -> POST /watch/{slug}/{ep}/sources  -> { players: { quality: [{token,label}] } }
 *   4. resolve     -> POST /watch/stream-source/{token} (iframe sandbox attrs)
 *                   -> GET  /watch/stream-gate/{token}  (embed page) -> <iframe src>
 *   5. embed       -> resolve the embed host to a playable m3u8/mp4
 */

const BASE_URL = "https://witanime.site";

const MOBILE_UA =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36";

const VIDEA_STUPID_KEY =
    "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";

type WitaServer = {
    quality: string;
    label: string;
    token: string;
    version: string;
    lang: string;
    isStream: boolean;
};

class Provider {
    private cookies: Record<string, string> = {};

    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: false,
        };
    }

    // ---------------------------------------------------------------- helpers

    private cookieHeader(): string {
        return Object.keys(this.cookies)
            .map((k) => `${k}=${this.cookies[k]}`)
            .join("; ");
    }

    private saveCookies(res: any): void {
        const jar = res && res.cookies ? res.cookies : null;
        if (!jar) return;
        for (const key of Object.keys(jar)) {
            this.cookies[key] = jar[key];
        }
    }

    private async request(
        url: string,
        opts: {
            method?: string;
            headers?: Record<string, string>;
            body?: any;
            referer?: string;
        } = {},
    ): Promise<any> {
        const headers: Record<string, string> = {
            "User-Agent": MOBILE_UA,
            "Sec-Ch-Ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ar-IQ,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        };

        if (opts.headers) {
            for (const key of Object.keys(opts.headers)) {
                headers[key] = opts.headers[key];
            }
        }
        if (opts.referer) headers["Referer"] = opts.referer;

        const cookie = this.cookieHeader();
        if (cookie) headers["Cookie"] = cookie;

        const res = await fetch(url, {
            method: opts.method || "GET",
            headers,
            body: opts.body,
            timeout: 30,
        });

        this.saveCookies(res);
        return res;
    }

    private absolute(url: string): string {
        if (!url) return "";
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return BASE_URL + url;
        return BASE_URL + "/" + url;
    }

    private sleep(ms: number): void {
        // $sleep is a blocking sleep in the Seanime runtime
        $sleep(ms);
    }

    private stripTags(html: string): string {
        return (html || "")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim();
    }

    // ----------------------------------------------------------------- search

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = (opts && opts.query ? opts.query : "").trim();
        if (!query) return [];

        const res = await this.request(
            `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
        );
        if (!res.ok) return [];

        const html: string = res.text();
        const $ = LoadDoc(html);
        const results: SearchResult[] = [];
        const seen = new Set<string>();

        const format = opts.media && opts.media.format
            ? String(opts.media.format).toUpperCase()
            : "";

        $("a[href*='/anime/'], a[href*='/movie/']").each((_i: number, el: any) => {
            const href = el.attr("href");
            if (!href) return;

            const url = this.absolute(href);
            if (seen.has(url)) return;

            const isMovie = url.indexOf("/movie/") >= 0;
            if (format === "MOVIE" && !isMovie) return;
            if (!isMovie && (format === "TV" || format === "TV_SHORT")) {
                // tv entries only
            } else if (isMovie && format !== "MOVIE") {
                if (!opts.media || (opts.media.episodeCount || 0) > 1) return;
            }

            let title = "";
            const heading = el.find("h3").first();
            if (heading && heading.length) title = this.stripTags(heading.text());
            if (!title) {
                const img = el.find("img").first();
                const alt = img && img.length ? img.attr("alt") : undefined;
                title = alt ? this.stripTags(alt) : "";
            }
            if (!title) title = url;

            seen.add(url);
            results.push({
                id: url,
                title,
                url,
                subOrDub: "sub",
            });
        });

        return results.slice(0, 40);
    }

    // --------------------------------------------------------------- episodes

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const url = this.absolute(id);
        if (!url) return [];

        const res = await this.request(url);
        if (!res.ok) return [];

        const html: string = res.text();
        const $ = LoadDoc(html);
        const episodes: EpisodeDetails[] = [];
        const seen = new Set<string>();

        let links = $("div[data-episode-list] a[href*='/watch/']");
        if (!links || !links.length) {
            links = $("a[href*='/watch/']");
        }

        links.each((_i: number, el: any) => {
            const href = el.attr("href");
            if (!href) return;

            const watchUrl = this.absolute(href);
            if (seen.has(watchUrl)) return;

            const match = watchUrl.match(/\/watch\/(?:[^/]+\/)*(\d+)(?:\?.*)?$/);
            const number = match ? parseInt(match[1], 10) : episodes.length + 1;

            let title = "";
            const heading = el.find("h3, .title, span").first();
            if (heading && heading.length) title = this.stripTags(heading.text());
            if (!title) title = `Episode ${number}`;

            seen.add(watchUrl);
            episodes.push({
                id: watchUrl,
                number,
                url: watchUrl,
                title,
            });
        });

        episodes.sort((a, b) => a.number - b.number);
        return episodes;
    }

    // ---------------------------------------------------------------- resolve

    async findEpisodeServer(
        episode: EpisodeDetails,
        server: string,
    ): Promise<EpisodeServer> {
        const watchUrl = this.absolute(episode && episode.url ? episode.url : episode.id);
        if (!watchUrl) {
            return { server: server || "default", headers: {}, videoSources: [] };
        }

        // 1) watch page -> csrf token
        const pageRes = await this.request(`${watchUrl}?t=${Date.now()}`);
        if (!pageRes.ok) {
            return { server: server || "default", headers: {}, videoSources: [] };
        }
        const pageHtml: string = pageRes.text();
        const $page = LoadDoc(pageHtml);
        const csrfMeta = $page("meta[name='csrf-token']").first();
        const csrf = csrfMeta && csrfMeta.length ? csrfMeta.attr("content") : undefined;

        // 2) the site waits ~1.3s before asking for the source manifest
        this.sleep(1400);

        // 3) source manifest
        const manifestRes = await this.request(`${watchUrl}/sources`, {
            method: "POST",
            body: "",
            headers: {
                "X-Csrf-Token": csrf || "",
                Accept: "application/json",
                Origin: BASE_URL,
                Referer: watchUrl,
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            },
        });

        if (!manifestRes.ok) {
            return { server: server || "default", headers: {}, videoSources: [] };
        }

        let manifest: any;
        try {
            manifest = manifestRes.json();
        } catch (e) {
            return { server: server || "default", headers: {}, videoSources: [] };
        }

        const servers: WitaServer[] = [];
        const collect = (group: any, isStream: boolean) => {
            if (!group) return;
            for (const quality of Object.keys(group)) {
                const items = group[quality] || [];
                for (const item of items) {
                    if (!item || !item.token) continue;
                    servers.push({
                        quality,
                        label: item.label || "Server",
                        token: item.token,
                        version: item.version || "sub",
                        lang: item.lang || "jp",
                        isStream,
                    });
                }
            }
        };
        collect(manifest.players, true);
        collect(manifest.downloads, false);

        if (!servers.length) {
            return { server: server || "default", headers: {}, videoSources: [] };
        }

        // 4) resolve every server to a playable url
        const videoSources: VideoSource[] = [];
        const limit = Math.min(servers.length, 5);

        for (let i = 0; i < limit; i++) {
            const item = servers[i];
            try {
                const resolved = await this.resolveServer(item, watchUrl, csrf || "");
                for (const src of resolved) {
                    videoSources.push(src);
                }
            } catch (e) {
                // ignore a broken server, try the next one
            }

            if (i < limit - 1) this.sleep(1200);
        }

        return {
            server: server || "default",
            headers: {
                "User-Agent": MOBILE_UA,
                Referer: watchUrl,
            },
            videoSources,
        };
    }

    private async resolveServer(
        item: WitaServer,
        watchUrl: string,
        csrf: string,
    ): Promise<VideoSource[]> {
        const kind = item.isStream ? "stream" : "download";

        // the source call refreshes the session cookies and returns the iframe sandbox rules
        await this.request(`${BASE_URL}/watch/${kind}-source/${item.token}`, {
            method: "POST",
            body: "",
            headers: {
                "X-Csrf-Token": csrf,
                Accept: "application/json",
                Origin: BASE_URL,
                Referer: watchUrl,
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            },
        });

        // the gate page contains the actual embed
        const gateRes = await this.request(`${BASE_URL}/watch/${kind}-gate/${item.token}`, {
            headers: {
                Referer: watchUrl,
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-User": "?1",
                "Sec-Fetch-Dest": "iframe",
                "Upgrade-Insecure-Requests": "1",
            },
        });

        if (!gateRes.ok) return [];

        const gateHtml: string = gateRes.text();
        const embedUrl = this.extractEmbedUrl(gateHtml);
        if (!embedUrl) return [];

        const sources = await this.resolveEmbed(embedUrl, watchUrl);
        return sources.map((s) => ({
            url: s.url,
            type: s.type,
            quality: s.quality || item.quality,
            label: `${item.label} (${item.quality})${item.isStream ? "" : " [download]"}`,
            subtitles: s.subtitles || [],
        }));
    }

    private extractEmbedUrl(html: string): string {
        if (!html) return "";
        const $ = LoadDoc(html);

        const iframe = $("iframe").first();
        if (iframe && iframe.length) {
            const src = iframe.attr("src");
            if (src && src.indexOf("witanime.site") < 0) return this.absolute(src);
        }

        const scriptMatch = html.match(/url\s*=\s*['"]([^'"]+)['"]/);
        if (scriptMatch) return this.absolute(scriptMatch[1]);

        const hrefMatch = html.match(/href=['"](https?:\/\/[^'"]+)['"]/);
        if (hrefMatch) return hrefMatch[1];

        return "";
    }

    private async resolveEmbed(
        embedUrl: string,
        referer: string,
    ): Promise<Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }>> {
        const host = this.hostOf(embedUrl);

        if (host.indexOf("videa") >= 0) {
            return this.resolveVidea(embedUrl, referer);
        }
        if (host.indexOf("mail.ru") >= 0) {
            return this.resolveMailRu(embedUrl, referer);
        }

        return this.resolveGeneric(embedUrl, referer);
    }

    private hostOf(url: string): string {
        const match = (url || "").match(/^https?:\/\/([^/?#]+)/i);
        return match ? match[1].toLowerCase() : "";
    }

    /** direct media urls found inside an embed page */
    private async resolveGeneric(
        embedUrl: string,
        referer: string,
    ): Promise<Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }>> {
        const res = await this.request(embedUrl, { referer: referer });
        if (!res.ok) return [];

        const html: string = res.text();
        const out: Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }> = [];

        const push = (raw: string, quality: string) => {
            if (!raw) return;
            const url = raw.replace(/\\\//g, "/").replace(/^&amp;/, "&");
            if (!/^https?:\/\//i.test(url)) return;
            if (url.indexOf(".m3u8") >= 0) {
                out.push({ url, type: "m3u8", quality: quality || "HD", subtitles: [] });
            } else if (/\.(mp4|webm|mkv)(\?|$)/i.test(url)) {
                out.push({ url, type: "mp4", quality: quality || "HD", subtitles: [] });
            }
        };

        const m3u8 = html.match(/https?:[^"'\s\\]+?\.m3u8[^"'\s\\]*/gi);
        if (m3u8) for (const m of m3u8) push(m, "HD");

        const fileMatch = html.match(/file\s*:\s*['"]([^'"]+)['"]/i);
        if (fileMatch) push(fileMatch[1], "HD");

        const srcMatch = html.match(/<source[^>]+src=['"]([^'"]+)['"]/i);
        if (srcMatch) push(srcMatch[1], "HD");

        const mp4 = html.match(/https?:[^"'\s\\]+?\.(?:mp4|webm)[^"'\s\\]*/gi);
        if (mp4) for (const m of mp4) push(m, "HD");

        // subtitles (.vtt) shipped next to the player
        const subtitles: VideoSubtitle[] = [];
        const vtt = html.match(/https?:[^"'\s\\]+?\.vtt[^"'\s\\]*/gi);
        if (vtt) {
            vtt.slice(0, 5).forEach((url, index) => {
                subtitles.push({
                    id: `sub-${index}`,
                    url: url.replace(/\\\//g, "/"),
                    language: "ar",
                    isDefault: index === 0,
                });
            });
        }
        if (out.length) out[0].subtitles = subtitles;

        return out;
    }

    /** videa.hu embed: nonce + rc4 protected xml */
    private async resolveVidea(
        embedUrl: string,
        referer: string,
    ): Promise<Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }>> {
        const res = await this.request(embedUrl, { referer: referer });
        if (!res.ok) return [];

        const html: string = res.text();
        const nonceMatch = html.match(/_xt\s*=\s*"([^"]+)"/);
        if (!nonceMatch) return [];

        const nonce = nonceMatch[1];
        const paramL = nonce.length >= 32 ? nonce.substring(0, 32) : nonce.padEnd(32, "a");
        const paramSPart = nonce.length > 32 ? nonce.substring(32) : "";

        let result = "";
        for (let i = 0; i < 32; i++) {
            const ch = paramL.charAt(i) || "a";
            const idxInStupid = VIDEA_STUPID_KEY.indexOf(ch);
            const index = i - ((idxInStupid < 0 ? 0 : idxInStupid) - 31);
            let safeIndex = 0;
            if (paramSPart.length) {
                if (index < 0) safeIndex = 0;
                else if (index >= paramSPart.length) safeIndex = paramSPart.length - 1;
                else safeIndex = index;
            }
            result += paramSPart.charAt(safeIndex) || "a";
        }

        const seed = this.randomAlphaNumeric(8);
        const paramT = result.length >= 16 ? result.substring(0, 16) : result.padEnd(16, "0");
        const rc4KeyPart = result.length > 16 ? result.substring(16) : "";

        const videoId = this.queryParam(embedUrl, "v");
        if (!videoId) return [];

        const xmlRes = await this.request(
            `https://videa.hu/player/xml?platform=desktop&_s=${seed}&_t=${paramT}&v=${videoId}`,
            { headers: { Referer: embedUrl, Origin: "https://videa.hu" } },
        );
        if (!xmlRes.ok) return [];

        let body: string = xmlRes.text();
        const xsHeader = xmlRes.headers ? xmlRes.headers["x-videa-xs"] || "" : "";

        if (body.trim().indexOf("<?xml") !== 0) {
            try {
                const key = rc4KeyPart + seed + xsHeader;
                body = this.rc4(this.base64Decode(body.trim()), key);
            } catch (e) {
                return [];
            }
        }

        const $xml = LoadDoc(body);
        const out: Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }> = [];

        $xml("video_source").each((_i: number, el: any) => {
            const name = el.attr("name") || "";
            const exp = el.attr("exp") || "";
            const part = this.stripTags(el.text());
            const md5 = this.stripTags($xml(`hash_value_${name}`).first().text());

            let url = part;
            if (url.indexOf("http") !== 0) url = "https:" + url;
            if (md5) url = `${url}?md5=${md5}&expires=${exp}`;

            out.push({
                url,
                type: url.indexOf(".m3u8") >= 0 ? "m3u8" : "mp4",
                quality: name || "HD",
                subtitles: [],
            });
        });

        return out;
    }

    /** my.mail.ru embed */
    private async resolveMailRu(
        embedUrl: string,
        referer: string,
    ): Promise<Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }>> {
        const match = embedUrl.match(/video\/embed\/([^/?#]+)/);
        if (!match) return [];

        const res = await this.request(
            `https://my.mail.ru/+/video/meta/${match[1]}`,
            { referer: referer },
        );
        if (!res.ok) return [];

        let data: any;
        try {
            data = res.json();
        } catch (e) {
            return [];
        }

        const videoKey = res.cookies && res.cookies["video_key"] ? res.cookies["video_key"] : "";
        const out: Array<{ url: string; type: VideoSourceType; quality: string; subtitles: VideoSubtitle[] }> = [];

        const videos = (data && data.videos) || [];
        for (const video of videos) {
            if (!video || !video.url) continue;
            let url = video.url.indexOf("//") === 0 ? "https:" + video.url : video.url;
            if (videoKey) {
                url = url.indexOf("?") >= 0 ? `${url}&video_key=${videoKey}` : `${url}?video_key=${videoKey}`;
            }
            out.push({
                url,
                type: url.indexOf(".m3u8") >= 0 ? "m3u8" : "mp4",
                quality: video.key || "HD",
                subtitles: [],
            });
        }

        return out;
    }

    // -------------------------------------------------------------- utilities

    private queryParam(url: string, name: string): string {
        const match = (url || "").match(new RegExp("[?&]" + name + "=([^&]+)"));
        return match ? match[1] : "";
    }

    private randomAlphaNumeric(len: number): string {
        const allowed = "abcdefghijklmnopqrstuvwxyz0123456789";
        let out = "";
        for (let i = 0; i < len; i++) {
            out += allowed.charAt(Math.floor(Math.random() * allowed.length));
        }
        return out;
    }

    private base64Decode(input: string): number[] {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        const clean = (input || "").replace(/[^A-Za-z0-9+/=]/g, "");
        const bytes: number[] = [];

        for (let i = 0; i < clean.length; i += 4) {
            const e1 = chars.indexOf(clean.charAt(i));
            const e2 = chars.indexOf(clean.charAt(i + 1));
            const e3 = chars.indexOf(clean.charAt(i + 2));
            const e4 = chars.indexOf(clean.charAt(i + 3));

            bytes.push((e1 << 2) | (e2 >> 4));
            if (e3 >= 0) bytes.push(((e2 & 15) << 4) | (e3 >> 2));
            if (e4 >= 0) bytes.push(((e3 & 3) << 6) | e4);
        }

        return bytes;
    }

    private rc4(data: number[], key: string): string {
        const keyBytes: number[] = [];
        for (let i = 0; i < key.length; i++) {
            keyBytes.push(key.charCodeAt(i) & 0xff);
        }

        const s: number[] = [];
        for (let i = 0; i < 256; i++) s[i] = i;

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + (keyBytes[i % keyBytes.length] || 0)) % 256;
            const tmp = s[i];
            s[i] = s[j];
            s[j] = tmp;
        }

        let out = "";
        let i = 0;
        j = 0;
        for (let k = 0; k < data.length; k++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            const tmp = s[i];
            s[i] = s[j];
            s[j] = tmp;
            out += String.fromCharCode(data[k] ^ s[(s[i] + s[j]) % 256]);
        }

        return out;
    }
}
