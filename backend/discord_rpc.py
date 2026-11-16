import time
import asyncio
from typing import Optional

DISCORD_CLIENT_ID = "1571886255099220048" # Cord Music Player Client ID

class DiscordRPC:
    def __init__(self):
        self.rpc = None
        self.connected = False
        self.last_update = 0
        self.current_state = {}

    def connect(self):
        if self.connected:
            return
        try:
            from pypresence import Presence
            self.rpc = Presence(DISCORD_CLIENT_ID)
            self.rpc.connect()
            self.connected = True
            print(f"[Discord RPC] Connected successfully to Cord Player ({DISCORD_CLIENT_ID})!")
        except Exception as e:
            self.connected = False
            self.rpc = None
            print(f"[Discord RPC] Connection failed or Discord not open: {e}")

    def update(self, title: str, artist: str, duration: int = 0, position: int = 0, is_playing: bool = True, thumbnail: str = ""):
        if not self.connected:
            self.connect()
        if not self.connected or not self.rpc:
            return

        try:
            now = int(time.time())
            start_time = now - int(position) if is_playing else None
            end_time = (start_time + int(duration)) if (is_playing and duration > 0) else None

            activity = {
                "details": f"{title[:128]}",
                "state": f"by {artist[:128]}" if artist else "Cord Player",
                "large_text": "Cord Player"
            }

            if thumbnail and thumbnail.startswith("http"):
                activity["large_image"] = thumbnail

            if is_playing:
                activity["small_image"] = "play"
                activity["small_text"] = "Playing"
                if start_time:
                    activity["start"] = start_time
                    if end_time and end_time > start_time:
                        activity["end"] = end_time
            else:
                activity["small_image"] = "pause"
                activity["small_text"] = "Paused"

            self.rpc.update(**activity)
        except Exception as e:
            print(f"[Discord RPC Update Error] {e}")
            self.connected = False
            self.rpc = None

    def clear(self):
        if self.connected and self.rpc:
            try:
                self.rpc.clear()
            except Exception:
                pass

discord_rpc = DiscordRPC()
