import os
import hashlib
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["Download"])

# Resolve release directory relative to root
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
PUBLIC_DIR = ROOT_DIR / "public"
PUBLIC_DOWNLOADS_DIR = PUBLIC_DIR / "downloads"
DIST_RELEASE_DIR = ROOT_DIR / "dist-release"
RELEASE_DIR = ROOT_DIR / "release"

def _find_installer() -> Optional[Path]:
    search_dirs = [PUBLIC_DOWNLOADS_DIR, PUBLIC_DIR, DIST_RELEASE_DIR, RELEASE_DIR]
    candidates = []
    for d in search_dirs:
        if d.exists():
            for f in d.glob("*.exe"):
                if not f.name.startswith("."):
                    candidates.append(f)
    if not candidates:
        return None
    # Sort by newest modification time
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


@router.get("/api/download/info")
@router.get("/download/info")
async def get_download_info():
    installer = _find_installer()
    if not installer or not installer.exists():
        return {
            "available": False,
            "version": "2.0.0",
            "filename": "Cup-Work-Setup-2.0.0.exe",
            "size_bytes": 0,
            "size_formatted": "Ready to build",
            "os": "Windows 10/11 64-bit",
        }
    
    size_bytes = installer.stat().st_size
    size_mb = round(size_bytes / (1024 * 1024), 1)
    
    return {
        "available": True,
        "version": "2.0.0",
        "filename": installer.name,
        "actual_file": installer.name,
        "download_url": f"/public/downloads/{installer.name}" if (PUBLIC_DOWNLOADS_DIR / installer.name).exists() else "/api/download/windows",
        "size_bytes": size_bytes,
        "size_formatted": f"{size_mb} MB",
        "os": "Windows 10 / 11 (64-bit)",
        "published_at": "2026-08-25",
        "requirements": {
            "os": "Windows 10/11 64-bit",
            "python": "Python 3.10+",
            "ram": "4 GB RAM minimum (8 GB recommended)",
            "api_key": "Google Gemini API Key"
        }
    }


@router.get("/api/download/windows")
@router.get("/download/windows")
async def download_windows_installer():
    installer = _find_installer()
    if not installer or not installer.exists():
        raise HTTPException(
            status_code=404, 
            detail="Windows installer package not found in release directory. Please run 'npm run dist' to build."
        )
    
    filename = installer.name
    return FileResponse(
        path=str(installer),
        filename=filename,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

