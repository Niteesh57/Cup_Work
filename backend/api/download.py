import os
import hashlib
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter(tags=["Download"])

# Resolve directories
BACKEND_DIR = Path(__file__).resolve().parent.parent
BACKEND_PUBLIC_DIR = BACKEND_DIR / "public"
ROOT_DIR = BACKEND_DIR.parent
DIST_RELEASE_DIR = ROOT_DIR / "dist-release"
RELEASE_DIR = ROOT_DIR / "release"

# Cloud fallback URL (Hugging Face direct CDN download link)
DEFAULT_CLOUD_DOWNLOAD_URL = os.getenv(
    "WINDOWS_INSTALLER_URL", 
    "https://huggingface.co/nagireddy5/APP/resolve/main/Cup-Work-Setup-2.0.0.exe?download=true"
)




def _find_installer() -> Optional[Path]:
    search_dirs = [BACKEND_PUBLIC_DIR, DIST_RELEASE_DIR, RELEASE_DIR]
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
        # Cloud environment fallback info
        return {
            "available": True,
            "version": "2.0.0",
            "filename": "Cup-Work-Setup-2.0.0.exe",
            "actual_file": "Cup-Work-Setup-2.0.0.exe",
            "download_url": DEFAULT_CLOUD_DOWNLOAD_URL,
            "size_bytes": 251690502,
            "size_formatted": "240.0 MB",
            "os": "Windows 10 / 11 (64-bit)",
            "published_at": "2026-08-25",
            "requirements": {
                "os": "Windows 10/11 64-bit",
                "python": "Python 3.10+",
                "ram": "4 GB RAM minimum (8 GB recommended)",
                "api_key": "Google Gemini API Key"
            }
        }
    
    size_bytes = installer.stat().st_size
    size_mb = round(size_bytes / (1024 * 1024), 1)
    
    return {
        "available": True,
        "version": "2.0.0",
        "filename": installer.name,
        "actual_file": installer.name,
        "download_url": "/api/download/windows",
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
        # In cloud environments where .exe is not tracked in git, redirect to GitHub release asset
        if DEFAULT_CLOUD_DOWNLOAD_URL:
            return RedirectResponse(url=DEFAULT_CLOUD_DOWNLOAD_URL, status_code=307)
        raise HTTPException(
            status_code=404, 
            detail="Windows installer package not found. Please set WINDOWS_INSTALLER_URL or download from GitHub Releases."
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


