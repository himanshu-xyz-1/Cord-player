import os
import time
from typing import Dict, Any, List, Optional
from ytmusicapi import YTMusic
import yt_dlp

def extract_thumbnail_url(item: Dict[str, Any], default_vid: str = '') -> str:
    """Extract highest quality thumbnail URL from any ytmusic item."""
    thumbs = item.get('thumbnails') or item.get('thumbnail') or []
    if isinstance(thumbs, list) and len(thumbs) > 0:
        url = thumbs[-1].get('url', '')
        if url:
            # Upgrade thumbnail to high resolution if it has size params
            if '=w' in url and '-h' in url:
                url = url.split('=w')[0] + '=w544-h544-l90-rj'
            return url
    elif isinstance(thumbs, str) and thumbs:
        return thumbs
    
    vid = item.get('videoId') or default_vid
    if vid and not vid.startswith('MP') and not vid.startswith('UC') and not vid.startswith('OLA') and not vid.startswith('FE'):
        return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
    return ''

class YTMusicService:
    def __init__(self):
        self.ytm = YTMusic()
        self._stream_cache: Dict[str, Dict[str, Any]] = {}
        self.ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'quiet': True,
            'skip_download': True,
            'extract_flat': False,
            'nocheckcertificate': True,
            'ignoreerrors': False,
            'logtostderr': False,
            'no_warnings': True,
            'source_address': '0.0.0.0',
            'extractor_args': {'youtube': {'player_client': ['android', 'ios', 'web']}},
            'socket_timeout': 10,
        }

    def search(self, query: str, filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search YouTube Music for songs, albums, artists, or playlists."""
        valid_filters = ['songs', 'videos', 'albums', 'artists', 'playlists']
        f = filter_type if filter_type in valid_filters else 'songs'
        try:
            results = self.ytm.search(query, filter=f)
            parsed = []
            for item in results:
                result_type = item.get('resultType', f.rstrip('s'))
                artists = [a.get('name') for a in item.get('artists', []) if isinstance(a, dict) and a.get('name')]
                first_art_id = item.get('artists', [{}])[0].get('id') if (item.get('artists') and isinstance(item.get('artists')[0], dict)) else ''
                vid = item.get('videoId') or item.get('browseId') or item.get('playlistId') or first_art_id or ''
                thumb = extract_thumbnail_url(item, vid)

                artist_name = item.get('artist') or (', '.join(artists) if artists else '') or item.get('title') or 'Unknown Artist'
                title = item.get('title') or artist_name
                
                parsed.append({
                    'id': vid,
                    'title': title,
                    'name': title,
                    'artist': artist_name,
                    'album': item.get('album', {}).get('name', '') if isinstance(item.get('album'), dict) else '',
                    'duration': item.get('duration', '0:00'),
                    'duration_seconds': item.get('duration_seconds', 0),
                    'thumbnail': thumb,
                    'type': result_type
                })
            return parsed
        except Exception as e:
            print(f"[YTMusic] Search error: {e}")
            return []

    def get_suggestions(self, query: str) -> Dict[str, Any]:
        """Fetch fast live search suggestions with categorized breakdown."""
        try:
            raw_sugs = self.ytm.get_search_suggestions(query)
            top_artists = []
            top_songs = []
            if len(query) >= 2:
                try:
                    q_artists = self.ytm.search(query, filter='artists')[:2]
                    for a in q_artists:
                        a_artists = [art.get('name') for art in a.get('artists', []) if isinstance(art, dict) and art.get('name')]
                        a_name = a.get('artist') or (a_artists[0] if a_artists else '') or a.get('title') or ''
                        a_id = a.get('browseId') or (a.get('artists', [{}])[0].get('id') if (a.get('artists') and isinstance(a.get('artists')[0], dict)) else '') or ''
                        if a_name:
                            top_artists.append({
                                'id': a_id,
                                'name': a_name,
                                'thumbnail': extract_thumbnail_url(a, a_id)
                            })
                except Exception:
                    pass

                try:
                    q_songs = self.ytm.search(query, filter='songs')[:3]
                    for s in q_songs:
                        s_vid = s.get('videoId') or ''
                        s_title = s.get('title') or ''
                        s_artists = [art.get('name') for art in s.get('artists', []) if isinstance(art, dict) and art.get('name')]
                        if s_title and s_vid:
                            top_songs.append({
                                'id': s_vid,
                                'title': s_title,
                                'artist': ', '.join(s_artists) if s_artists else 'Unknown Artist',
                                'thumbnail': extract_thumbnail_url(s, s_vid)
                            })
                except Exception:
                    pass

            return {
                'queries': raw_sugs[:6] if raw_sugs else [],
                'artists': top_artists,
                'songs': top_songs
            }
        except Exception as e:
            print(f"[YTMusic] Suggestion error: {e}")
            return {'queries': [], 'artists': [], 'songs': []}

    def search_all(self, query: str) -> Dict[str, Any]:
        """Search all categories and group into top_result, songs, artists, albums, playlists."""
        try:
            results = self.ytm.search(query)
            songs = []
            artists = []
            albums = []
            playlists = []
            top_result = None

            for item in results:
                t = item.get('resultType', 'song')
                artists_list = [a.get('name') for a in item.get('artists', []) if isinstance(a, dict) and a.get('name')]
                first_art_id = item.get('artists', [{}])[0].get('id') if (item.get('artists') and isinstance(item.get('artists')[0], dict)) else ''
                vid = item.get('videoId') or item.get('browseId') or item.get('playlistId') or first_art_id or ''
                
                artist_name = item.get('artist') or (', '.join(artists_list) if artists_list else '') or item.get('title') or 'Unknown Artist'
                title = item.get('title') or artist_name
                thumb = extract_thumbnail_url(item, vid)

                entry = {
                    'id': vid,
                    'title': title,
                    'name': title,
                    'artist': artist_name,
                    'album': item.get('album', {}).get('name', '') if isinstance(item.get('album'), dict) else '',
                    'duration': item.get('duration', '0:00'),
                    'thumbnail': thumb,
                    'type': t,
                    'year': item.get('year', '')
                }

                if top_result is None and title and title != 'Unknown Artist':
                    top_result = entry

                if t in ['song', 'video'] and len(songs) < 8:
                    songs.append(entry)
                elif t == 'artist' and len(artists) < 6:
                    entry['name'] = title
                    artists.append(entry)
                elif t == 'album' and len(albums) < 6:
                    albums.append(entry)
                elif t == 'playlist' and len(playlists) < 6:
                    playlists.append(entry)

            if not songs:
                songs = self.search(query, filter_type='songs')[:8]
            if not artists:
                artists = self.search(query, filter_type='artists')[:6]

            return {
                'top_result': top_result or (songs[0] if songs else None),
                'songs': songs,
                'artists': artists,
                'albums': albums,
                'playlists': playlists
            }
        except Exception as e:
            print(f"[YTMusic] search_all error: {e}")
            fallback_songs = self.search(query, filter_type='songs')
            return {
                'top_result': fallback_songs[0] if fallback_songs else None,
                'songs': fallback_songs[:8],
                'artists': [],
                'albums': [],
                'playlists': []
            }

    def get_artist(self, artist_id_or_name: str) -> Dict[str, Any]:
        """Fetch full artist profile with top songs, latest releases, albums, singles, and related artists."""
        try:
            browse_id = artist_id_or_name
            if not (artist_id_or_name.startswith('UC') or artist_id_or_name.startswith('MP') or artist_id_or_name.startswith('FEmusic')):
                search_res = self.ytm.search(artist_id_or_name, filter='artists')
                if search_res and len(search_res) > 0:
                    browse_id = search_res[0].get('browseId', '')
            
            data = {}
            if browse_id and (browse_id.startswith('UC') or browse_id.startswith('MP') or browse_id.startswith('FEmusic')):
                try:
                    data = self.ytm.get_artist(browse_id)
                except Exception as ex:
                    print(f"[YTMusic] get_artist error for {browse_id}: {ex}")
                    data = {}

            artist_name = data.get('name') or artist_id_or_name
            description = data.get('description', '')
            avatar = extract_thumbnail_url(data)
            
            # 1. Top Songs
            top_songs = []
            songs_data = data.get('songs', {})
            if isinstance(songs_data, dict):
                for s in songs_data.get('results', [])[:15]:
                    s_artists = [a.get('name') for a in s.get('artists', []) if a.get('name')]
                    s_vid = s.get('videoId', '')
                    s_thumb = extract_thumbnail_url(s, s_vid) or avatar
                    top_songs.append({
                        'id': s_vid,
                        'title': s.get('title', 'Unknown Title'),
                        'artist': ', '.join(s_artists) if s_artists else artist_name,
                        'album': s.get('album', {}).get('name', '') if isinstance(s.get('album'), dict) else '',
                        'duration': s.get('duration', '0:00'),
                        'thumbnail': s_thumb
                    })

            if not top_songs:
                search_songs = self.search(f"{artist_name} top songs", filter_type='songs')[:15]
                top_songs = search_songs

            # 2. Albums
            albums = []
            albums_data = data.get('albums', {})
            if isinstance(albums_data, dict):
                for a in albums_data.get('results', []):
                    albums.append({
                        'id': a.get('browseId', ''),
                        'title': a.get('title', 'Unknown Album'),
                        'year': a.get('year', ''),
                        'type': 'Album',
                        'thumbnail': extract_thumbnail_url(a)
                    })

            # 3. Singles & EPs
            singles = []
            singles_data = data.get('singles', {})
            if isinstance(singles_data, dict):
                for sg in singles_data.get('results', []):
                    singles.append({
                        'id': sg.get('browseId', ''),
                        'title': sg.get('title', 'Unknown Single'),
                        'year': sg.get('year', ''),
                        'type': 'Single/EP',
                        'thumbnail': extract_thumbnail_url(sg)
                    })

            # 4. Latest Releases
            all_releases = albums + singles
            if all_releases:
                try:
                    all_releases.sort(key=lambda r: str(r.get('year', '')), reverse=True)
                except Exception:
                    pass
            latest_releases = all_releases[:6]

            # 5. Related Artists
            related_artists = []
            rel_data = data.get('related', {})
            if isinstance(rel_data, dict):
                for r in rel_data.get('results', []):
                    related_artists.append({
                        'id': r.get('browseId', ''),
                        'name': r.get('title', 'Artist'),
                        'subscribers': r.get('subscribers', ''),
                        'thumbnail': extract_thumbnail_url(r)
                    })

            return {
                'id': browse_id or artist_id_or_name,
                'name': artist_name,
                'description': description,
                'avatar': avatar,
                'top_songs': top_songs,
                'latest_releases': latest_releases,
                'albums': albums,
                'singles': singles,
                'related_artists': related_artists
            }
        except Exception as e:
            print(f"[YTMusic] Error in get_artist for {artist_id_or_name}: {e}")
            fallback_songs = self.search(f"{artist_id_or_name} songs", filter_type='songs')[:12]
            return {
                'id': artist_id_or_name,
                'name': artist_id_or_name,
                'description': '',
                'avatar': fallback_songs[0].get('thumbnail', '') if fallback_songs else '',
                'top_songs': fallback_songs,
                'latest_releases': [],
                'albums': [],
                'singles': [],
                'related_artists': []
            }

    def get_album(self, album_browse_id: str) -> Dict[str, Any]:
        """Fetch album details and tracks list."""
        try:
            album = self.ytm.get_album(album_browse_id)
            title = album.get('title', 'Unknown Album')
            artist = ', '.join([a.get('name') for a in album.get('artists', []) if a.get('name')])
            year = album.get('year', '')
            thumb = extract_thumbnail_url(album)
            
            tracks = []
            for t in album.get('tracks', []):
                t_artists = [a.get('name') for a in t.get('artists', []) if a.get('name')]
                t_vid = t.get('videoId', '')
                tracks.append({
                    'id': t_vid,
                    'title': t.get('title', 'Unknown Track'),
                    'artist': ', '.join(t_artists) if t_artists else artist,
                    'duration': t.get('duration', '0:00'),
                    'thumbnail': extract_thumbnail_url(t, t_vid) or thumb,
                    'album': title
                })
            return {
                'id': album_browse_id,
                'title': title,
                'artist': artist,
                'year': year,
                'thumbnail': thumb,
                'tracks': tracks
            }
        except Exception as e:
            print(f"[YTMusic] Album fetch error: {e}")
            return {'tracks': []}

    def get_stream_url(self, video_id: str) -> Dict[str, Any]:
        """Extract direct audio stream URL with caching."""
        now = time.time()
        if video_id in self._stream_cache:
            entry = self._stream_cache[video_id]
            if now < entry.get('expires_at', 0):
                return entry

        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                stream_url = info.get('url')
                ext = info.get('ext', 'm4a')
                bitrate = info.get('abr') or info.get('tbr') or 128
                title = info.get('title', '')
                uploader = info.get('uploader', '')
                thumbnail = info.get('thumbnail') or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
                duration = info.get('duration', 0)

                result = {
                    'stream_url': stream_url,
                    'format': ext,
                    'bitrate': bitrate,
                    'title': title,
                    'artist': uploader,
                    'thumbnail': thumbnail,
                    'duration': duration,
                    'expires_at': now + 14400
                }
                self._stream_cache[video_id] = result
                return result
        except Exception as e:
            print(f"[YTMusic] Stream extraction error for {video_id}: {e}")
            return {'error': str(e)}

    def get_explore(self) -> Dict[str, Any]:
        """Fetch trending tracks, top music charts, and new releases."""
        try:
            charts = self.ytm.get_charts(country='GLOBAL')
            trending_songs = []
            if isinstance(charts, dict):
                items = charts.get('videos', {}).get('items', []) or charts.get('tracks', {}).get('items', [])
                for item in items[:25]:
                    artists = [a.get('name') for a in item.get('artists', []) if a.get('name')]
                    vid = item.get('videoId', '')
                    thumb = extract_thumbnail_url(item, vid)
                    trending_songs.append({
                        'id': vid,
                        'title': item.get('title', ''),
                        'artist': ', '.join(artists) if artists else 'Unknown Artist',
                        'thumbnail': thumb,
                        'duration': item.get('duration', '0:00')
                    })
            if not trending_songs:
                trending_songs = self.search("Global Top Hits", filter_type='songs')[:25]
            return {'trending': trending_songs}
        except Exception as e:
            print(f"[YTMusic] Explore error: {e}")
            fallback = self.search("Global Top Hits", filter_type='songs')
            return {'trending': fallback[:25]}

    def get_up_next(self, video_id: str) -> List[Dict[str, Any]]:
        """Get related / radio queue recommendations."""
        try:
            watch = self.ytm.get_watch_playlist(videoId=video_id, limit=20)
            tracks = []
            for item in watch.get('tracks', []):
                vid = item.get('videoId', '')
                if vid == video_id:
                    continue
                artists = [a.get('name') for a in item.get('artists', []) if a.get('name')]
                thumb = extract_thumbnail_url(item, vid)
                tracks.append({
                    'id': vid,
                    'title': item.get('title', ''),
                    'artist': ', '.join(artists) if artists else 'Unknown Artist',
                    'album': item.get('album', {}).get('name', '') if isinstance(item.get('album'), dict) else '',
                    'duration': item.get('length', '0:00'),
                    'thumbnail': thumb
                })
            return tracks
        except Exception as e:
            print(f"[YTMusic] UpNext error: {e}")
            return []

    def get_recommendations(self, seed_ids: List[str], seed_artists: List[str] = None) -> List[Dict[str, Any]]:
        """Smart Recommendation Engine based on user history and listening habits."""
        collected = []
        seen = set(seed_ids or [])
        
        for vid in (seed_ids or [])[:4]:
            if not vid:
                continue
            related = self.get_up_next(vid)
            for track in related:
                tid = track.get('id')
                if tid and tid not in seen:
                    seen.add(tid)
                    collected.append(track)
                    if len(collected) >= 20:
                        break

        if len(collected) < 15 and seed_artists:
            for artist in seed_artists[:2]:
                if not artist or artist == 'Unknown Artist':
                    continue
                results = self.search(f"{artist} songs", filter_type='songs')
                for track in results:
                    tid = track.get('id')
                    if tid and tid not in seen:
                        seen.add(tid)
                        collected.append(track)

        if not collected:
            collected = self.get_explore().get('trending', [])

        return collected[:25]

    def get_podcasts(self) -> Dict[str, Any]:
        """Fetch top podcast episodes and shows."""
        try:
            episodes_raw = self.ytm.search("popular podcasts", filter="episodes")[:18]
            shows_raw = self.ytm.search("top podcasts", filter="podcasts")[:12]

            episodes = []
            for ep in episodes_raw:
                vid = ep.get("videoId", "")
                author_list = [a.get("name") for a in ep.get("artists", []) if isinstance(a, dict) and a.get("name")]
                author = ep.get("author") or ep.get("artist") or (", ".join(author_list) if author_list else "Podcast Host")
                episodes.append({
                    "id": vid,
                    "title": ep.get("title", "Podcast Episode"),
                    "artist": author,
                    "duration": ep.get("duration", "45:00"),
                    "thumbnail": extract_thumbnail_url(ep, vid),
                    "type": "episode"
                })

            shows = []
            for sh in shows_raw:
                bid = sh.get("browseId") or sh.get("playlistId", "")
                author_list = [a.get("name") for a in sh.get("artists", []) if isinstance(a, dict) and a.get("name")]
                author = sh.get("author") or sh.get("artist") or (", ".join(author_list) if author_list else "Show Creator")
                shows.append({
                    "id": bid,
                    "title": sh.get("title", "Podcast Show"),
                    "artist": author,
                    "thumbnail": extract_thumbnail_url(sh, bid),
                    "type": "podcast"
                })

            return {
                "episodes": episodes,
                "shows": shows
            }
        except Exception as e:
            print(f"[YTMusic] Podcasts fetch error: {e}")
            return {"episodes": [], "shows": []}

yt_service = YTMusicService()
