import os
import shutil
from pathlib import Path


def resolve_ffmpeg_path() -> str:
    """
    Determine an ffmpeg executable path with the following priority:
    1) FFMPEG_PATH environment variable (if it exists and points to a file)
    2) system PATH lookup via shutil.which
    3) common fallback locations (Windows typical install)
    Raises RuntimeError with a clear message if not found.
    """
    env_path = os.getenv("FFMPEG_PATH")
    if env_path:
        candidate = Path(env_path)
        if candidate.exists():
            return str(candidate)

    which_path = shutil.which("ffmpeg")
    if which_path:
        return which_path

    fallback_candidates = [
        Path(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ]
    for candidate in fallback_candidates:
        if candidate.exists():
            return str(candidate)

    raise RuntimeError("FFmpeg not found. Set FFMPEG_PATH to a valid ffmpeg executable.")
