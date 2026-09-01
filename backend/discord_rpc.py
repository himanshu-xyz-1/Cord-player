import time
import asyncio
from typing import Optional

DISCORD_CLIENT_ID = "1186714088923058226" # Cord Music Player Client ID

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
            print("[Discord RPC] Connected successfully!")
        except Exception as e:
            self.connected = False
            self.rpc = None
            # Discord not running or pipe not ready, will retry on updates

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
                "large_image": thumbnail if thumbnail.startswith("http") else "cord_logo",
                "large_text": "Cord Player",
                "small_image": "play" if is_playing else "pause",
                "small_text": "Playing" if is_playing else "Paused"
            }

            if is_playing and start_time:
                activity["start"] = start_time
                if end_time and end_time > start_time:
                    activity["end"] = end_time

            self.rpc.update(**activity)
        except Exception as e:
            # Reconnect next time if pipe was broken
            self.connected = False
            self.rpc = None

    def clear(self):
        if self.connected and self.rpc:
            try:
                self.rpc.clear()
            except Exception:
                pass

discord_rpc = DiscordRPC()
