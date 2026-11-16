import time
import queue
import asyncio
import threading
from typing import Optional

DISCORD_CLIENT_ID = "1571886255099220048"  # Cord Music Player Client ID

class DiscordRPC:
    def __init__(self):
        self.queue = queue.Queue()
        self.rpc = None
        self.connected = False
        self._loop = None
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()

    def _connect(self):
        if self.connected and self.rpc:
            return True
        try:
            from pypresence import Presence
            self.rpc = Presence(DISCORD_CLIENT_ID, loop=self._loop)
            self.rpc.connect()
            self.connected = True
            print(f"[Discord RPC] Connected successfully to Cord Player ({DISCORD_CLIENT_ID})!")
            return True
        except Exception as e:
            self.connected = False
            self.rpc = None
            return False

    def _worker_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        
        while True:
            try:
                item = self.queue.get()
                if item is None:
                    break
                action, data = item
                if action == "update":
                    if not self._connect():
                        continue
                    try:
                        self.rpc.update(**data)
                    except Exception as e:
                        print(f"[Discord RPC Update Error] {e}")
                        self.connected = False
                        self.rpc = None
                elif action == "clear":
                    if self.connected and self.rpc:
                        try:
                            self.rpc.clear()
                        except Exception as e:
                            print(f"[Discord RPC Clear Error] {e}")
                        try:
                            self.rpc.close()
                        except Exception:
                            pass
                        self.connected = False
                        self.rpc = None
            except Exception as e:
                print(f"[Discord RPC Worker Exception] {e}")

    def update(self, title: str, artist: str, duration: int = 0, position: int = 0, is_playing: bool = True, thumbnail: str = ""):
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

        self.queue.put(("update", activity))

    def clear(self):
        self.queue.put(("clear", {}))

discord_rpc = DiscordRPC()
