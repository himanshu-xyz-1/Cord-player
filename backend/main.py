import os
import json
import shutil
import asyncio
import aiohttp
from pathlib import Path
from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from backend.ytmusic import yt_service
from backend.lyrics import lyrics_service
from backend.discord_rpc import discord_rpc

app = FastAPI(title="Cord Player API", version="2.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
ASSETS_DIR = Path(__file__).parent.parent / "assets"
MUSIC_DIR = Path.home() / "Music" / "Cord"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)
INDEX_FILE = MUSIC_DIR / "library.json"

def get_local_library():
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text())
        except Exception:
            return []
    return []

def save_local_library(lib):
    INDEX_FILE.write_text(json.dumps(lib, indent=2))

@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), filter: str = "all"):
    loop = asyncio.get_event_loop()
    if filter == "all":
        data = await loop.run_in_executor(None, yt_service.search_all, q)
        return data
    results = await loop.run_in_executor(None, yt_service.search, q, filter)
    return {"results": results}

@app.get("/api/search/suggestions")
async def search_suggestions(q: str = Query(..., min_length=1)):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, yt_service.get_suggestions, q)
    return data

@app.get("/api/artist/{artist_id}")
async def get_artist_profile(artist_id: str):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, yt_service.get_artist, artist_id)
    return data

@app.get("/api/album/{album_id}")
async def get_album_details(album_id: str):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, yt_service.get_album, album_id)
    return data

@app.get("/api/stream/{video_id}")
async def get_stream(video_id: str):
    loop = asyncio.get_event_loop()
    stream_info = await loop.run_in_executor(None, yt_service.get_stream_url, video_id)
    if 'error' in stream_info:
        raise HTTPException(status_code=500, detail=stream_info['error'])
    return stream_info

@app.get("/api/audio/{video_id}")
@app.head("/api/audio/{video_id}")
async def stream_audio_proxy(video_id: str, request: Request):
    lib = get_local_library()
    local_entry = next((item for item in lib if item.get('id') == video_id), None)
    if local_entry and (MUSIC_DIR / local_entry.get('filename', '')).exists():
        local_file = MUSIC_DIR / local_entry['filename']
        return FileResponse(path=str(local_file), media_type="audio/mpeg", filename=local_entry['filename'])

    loop = asyncio.get_event_loop()
    stream_info = await loop.run_in_executor(None, yt_service.get_stream_url, video_id)
    if 'error' in stream_info or not stream_info.get('stream_url'):
        raise HTTPException(status_code=500, detail="Could not get stream URL")
    
    target_url = stream_info['stream_url']
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/'
    }
    range_header = request.headers.get('Range')
    if range_header:
        headers['Range'] = range_header

    if request.method == "HEAD":
        return JSONResponse(status_code=200, content={"status": "ok"}, headers={
            'Content-Type': 'audio/mp4',
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
        })

    client = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None))
    try:
        resp = await client.get(target_url, headers=headers)
        raw_ctype = resp.headers.get('Content-Type', 'audio/mp4')
        if 'video/' in raw_ctype:
            ctype = raw_ctype.replace('video/', 'audio/')
        else:
            ctype = raw_ctype if 'audio/' in raw_ctype else 'audio/mp4'

        response_headers = {
            'Content-Type': ctype,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        }
        if 'Content-Range' in resp.headers:
            response_headers['Content-Range'] = resp.headers['Content-Range']
        if 'Content-Length' in resp.headers:
            response_headers['Content-Length'] = resp.headers['Content-Length']

        async def _stream():
            try:
                async for chunk in resp.content.iter_chunked(64 * 1024):
                    yield chunk
            finally:
                await client.close()

        return StreamingResponse(
            _stream(),
            status_code=resp.status,
            headers=response_headers
        )
    except Exception as e:
        await client.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/explore")
async def explore():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, yt_service.get_explore)
    return data

@app.get("/api/podcasts")
async def podcasts_endpoint():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, yt_service.get_podcasts)
    return data

@app.get("/api/up_next/{video_id}")
async def up_next(video_id: str):
    loop = asyncio.get_event_loop()
    tracks = await loop.run_in_executor(None, yt_service.get_up_next, video_id)
    return {"tracks": tracks}

@app.get("/api/lyrics")
async def get_lyrics(title: str, artist: str, duration: int = 0):
    return await lyrics_service.get_lyrics(title, artist, duration)

class RecommendationRequest(BaseModel):
    seed_ids: list[str] = []
    seed_artists: list[str] = []

class DiscordRPCRequest(BaseModel):
    title: str
    artist: str = ""
    duration: int = 0
    position: int = 0
    is_playing: bool = True
    thumbnail: str = ""
    show_artist: bool = True
    show_time: bool = True

@app.post("/api/recommendations")
async def get_recommendations_endpoint(req: RecommendationRequest):
    loop = asyncio.get_event_loop()
    results = await loop.run_in_executor(None, yt_service.get_recommendations, req.seed_ids, req.seed_artists)
    return {"recommendations": results}

@app.post("/api/discord_rpc")
async def update_discord_rpc(req: DiscordRPCRequest):
    discord_rpc.update(
        title=req.title,
        artist=req.artist if req.show_artist else "",
        duration=req.duration if req.show_time else 0,
        position=req.position if req.show_time else 0,
        is_playing=req.is_playing,
        thumbnail=req.thumbnail
    )
    return {"status": "ok"}

@app.post("/api/discord_rpc/clear")
async def clear_discord_rpc():
    discord_rpc.clear()
    return {"status": "cleared"}

@app.get("/api/downloads")
async def list_downloads():
    lib = get_local_library()
    valid = [item for item in lib if (MUSIC_DIR / item.get('filename', '')).exists()]
    if len(valid) != len(lib):
        save_local_library(valid)
    return {"downloads": valid}

@app.post("/api/download/{video_id}")
async def download_track(video_id: str, title: str = "", artist: str = "", thumbnail: str = "", quality: str = "320", format: str = "mp3"):
    def _download():
        import yt_dlp
        ext = "mp3" if format in ["mp3", "m4a", "flac"] else "mp3"
        filename = f"{video_id}.{ext}"
        out_path = str(MUSIC_DIR / f"{video_id}.%(ext)s")
        
        postprocessors = []
        if ext == "mp3":
            postprocessors.append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': quality,
            })

        opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_path,
            'postprocessors': postprocessors,
            'quiet': True,
            'nocheckcertificate': True
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
            track_title = title or info.get('title', 'Unknown Title')
            track_artist = artist or info.get('uploader', 'Unknown Artist')
            track_thumb = thumbnail or info.get('thumbnail', '')
            duration = info.get('duration', 0)

            lib = get_local_library()
            lib = [item for item in lib if item.get('id') != video_id]
            lib.append({
                'id': video_id,
                'title': track_title,
                'artist': track_artist,
                'thumbnail': track_thumb,
                'filename': filename,
                'duration_seconds': duration,
                'is_local': True
            })
            save_local_library(lib)
            return True

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _download)
        return {"status": "success", "id": video_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/download/{video_id}")
async def delete_download(video_id: str):
    lib = get_local_library()
    entry = next((item for item in lib if item.get('id') == video_id), None)
    if entry:
        f = MUSIC_DIR / entry.get('filename', '')
        if f.exists():
            try: f.unlink()
            except Exception: pass
    for p in MUSIC_DIR.glob(f"{video_id}.*"):
        try: p.unlink()
        except Exception: pass
    lib = [item for item in lib if item.get('id') != video_id]
    save_local_library(lib)
    return {"status": "deleted"}

@app.post("/api/storage/clear_downloads")
async def clear_all_downloads():
    lib = get_local_library()
    for item in lib:
        f = MUSIC_DIR / item.get('filename', '')
        if f.exists():
            try: f.unlink()
            except Exception: pass
    save_local_library([])
    return {"status": "cleared"}

@app.get("/api/system/storage_info")
async def get_storage_info():
    total_bytes = 0
    file_count = 0
    if MUSIC_DIR.exists():
        for p in MUSIC_DIR.glob('*'):
            if p.is_file():
                total_bytes += p.stat().st_size
                file_count += 1
    
    mb = round(total_bytes / (1024 * 1024), 2)
    return {
        "download_size_mb": mb,
        "download_count": file_count,
        "app_version": "2.5.0",
        "backend": "FastAPI + yt-dlp + ytmusicapi + pypresence"
    }

# Mount static frontend and assets
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_root():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
