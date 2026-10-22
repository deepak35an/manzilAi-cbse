#!/bin/sh
set -e

echo "Waiting for PostgreSQL database connection..."
until python -c "
import socket, os, urllib.parse
db_url = os.getenv('DATABASE_URL', '')
if db_url:
    url = db_url.replace('postgresql+asyncpg://', 'postgresql://')
    parsed = urllib.parse.urlparse(url)
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((parsed.hostname or 'postgres', parsed.port or 5432))
        s.close()
        exit(0)
    except Exception:
        exit(1)
"; do
  echo "Database not ready yet, retrying in 2 seconds..."
  sleep 2
done

echo "PostgreSQL is connected and ready!"

echo "Running Alembic database migrations..."
alembic upgrade head

echo "Starting FastAPI server with Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
