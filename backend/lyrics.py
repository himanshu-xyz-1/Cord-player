import urllib.parse
import aiohttp
from typing import Dict, Any, List

class LyricsService:
    async def get_lyrics(self, title: str, artist: str, duration: int = 0) -> Dict[str, Any]:
        """Fetch synchronized and plain lyrics from LRCLIB with fallback."""
        clean_title = self._clean_name(title)
        clean_artist = self._clean_name(artist)

        params = {
            'track_name': clean_title,
            'artist_name': clean_artist
        }
        if duration > 0:
            params['duration'] = str(int(duration))

        url = f"https://lrclib.net/api/get?{urllib.parse.urlencode(params)}"
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get(url, headers={'User-Agent': 'CordPlayer/2.5.0'}) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        synced = data.get('syncedLyrics', '')
                        plain = data.get('plainLyrics', '')
                        
                        if synced:
                            return {
                                'synced': True,
                                'lines': self._parse_lrc(synced),
                                'plain': plain
                            }
                        elif plain:
                            return {
                                'synced': False,
                                'lines': [],
                                'plain': plain
                            }
        except Exception as e:
            print(f"[Lyrics] Error fetching from LRCLIB: {e}")

        # Fallback search query
        try:
            search_url = f"https://lrclib.net/api/search?q={urllib.parse.quote(clean_title + ' ' + clean_artist)}"
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get(search_url, headers={'User-Agent': 'CordPlayer/2.5.0'}) as resp:
                    if resp.status == 200:
                        items = await resp.json()
                        if items and isinstance(items, list):
                            best = items[0]
                            synced = best.get('syncedLyrics', '')
                            plain = best.get('plainLyrics', '')
                            if synced:
                                return {'synced': True, 'lines': self._parse_lrc(synced), 'plain': plain}
                            if plain:
                                return {'synced': False, 'lines': [], 'plain': plain}
        except Exception as e:
            print(f"[Lyrics] Fallback search error: {e}")

        return {
            'synced': False,
            'lines': [],
            'plain': 'No lyrics available for this track.'
        }

    def _clean_name(self, text: str) -> str:
        # Strip featured artists, parenthetical suffixes like (Official Video), (feat. X), etc.
        import re
        text = re.sub(r'\(.*?(official|video|audio|feat|ft|lyrics|hd|4k).*?\)', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\[.*?\]', '', text)
        return text.strip()

    def _parse_lrc(self, lrc_text: str) -> List[Dict[str, Any]]:
        import re
        lines = []
        pattern = re.compile(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)')
        for line in lrc_text.splitlines():
            match = pattern.match(line.strip())
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                total_seconds = minutes * 60 + seconds
                text = match.group(3).strip()
                lines.append({
                    'time': total_seconds,
                    'text': text
                })
        return lines

lyrics_service = LyricsService()
