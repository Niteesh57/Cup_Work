import os
import hashlib
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["Download"])

# Resolve release directory relative to root
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
RELEASE_DIR = ROOT_DIR / "release"

def _find_installer() -> Optional[Path]:
    if not RELEASE_DIR.exists():
        return None
    # Look for .exe installers in release/
    for f in RELEASE_DIR.glob("*.exe"):
        return f
    return None

@router.get("/api/download/info")
@router.get("/download/info")
async def get_download_info():
    installer = _find_installer()
    if not installer or not installer.exists():
        return {
            "available": False,
            "version": "1.0.0",
            "filename": "Cup-Work-Setup-1.0.0.exe",
            "size_bytes": 0,
            "size_formatted": "Not built yet",
            "os": "Windows 10/11 64-bit",
        }
    
    size_bytes = installer.stat().st_size
    size_mb = round(size_bytes / (1024 * 1024), 1)
    
    return {
        "available": True,
        "version": "1.0.0",
        "filename": "Cup-Work-Setup-1.0.0.exe",
        "actual_file": installer.name,
        "size_bytes": size_bytes,
        "size_formatted": f"{size_mb} MB",
        "os": "Windows 10 / 11 (64-bit)",
        "published_at": "2026-08-22",
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
    
    return FileResponse(
        path=str(installer),
        filename="Cup-Work-Setup-1.0.0.exe",
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="Cup-Work-Setup-1.0.0.exe"'
        }
    )
