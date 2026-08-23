# syntax=docker/dockerfile:1
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered standard I/O for Cloud Logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# Install basic runtime tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source code and static assets
COPY backend/ /app/backend/
COPY public/ /app/public/

# Create data directory with proper write permissions for SQLite
RUN mkdir -p /app/backend/data && chmod -R 777 /app/backend/data

# Default port exposed by Cloud Run
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Execute FastAPI backend server on Cloud Run dynamic PORT
CMD ["sh", "-c", "exec uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
