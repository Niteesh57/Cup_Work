import sqlite3
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.config import config

logger = logging.getLogger("hey_jave.storage")

class SqliteStore:
    """
    Persistent SQLite storage for Hey Jave Python Backend.
    Handles sessions, task checkpoints, short/long term memory, and logs.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (config.DATA_DIR / "memory.sqlite")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS checkpoints (
                    task_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS short_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS long_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(user_id, key)
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    app_name TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS execution_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    details TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_short_memory_user ON short_memory(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_long_memory_user ON long_memory(user_id);
                CREATE INDEX IF NOT EXISTS idx_logs_task ON execution_logs(task_id);
            """)
            conn.commit()

    # Checkpoints
    def save_checkpoint(self, task_id: str, payload: Dict[str, Any], timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO checkpoints (task_id, payload, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(task_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                (task_id, json.dumps(payload), timestamp_ms)
            )
            conn.commit()

    def get_checkpoint(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT payload FROM checkpoints WHERE task_id = ?", (task_id,))
            row = cur.fetchone()
            if row:
                return json.loads(row["payload"])
            return None

    def delete_checkpoint(self, task_id: str):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM checkpoints WHERE task_id = ?", (task_id,))
            conn.commit()

    # Short Memory
    def add_short_memory(self, user_id: str, content: str, timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO short_memory (user_id, content, created_at) VALUES (?, ?, ?)",
                (user_id, content, timestamp_ms)
            )
            conn.commit()

    def get_short_memory(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT content, created_at FROM short_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
            rows = cur.fetchall()
            return [{"content": r["content"], "createdAt": r["created_at"]} for r in rows]

    def trim_short_memory(self, user_id: str, keep_count: int = 20):
        with self._get_connection() as conn:
            conn.execute(
                "DELETE FROM short_memory WHERE id IN ("
                "  SELECT id FROM short_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?"
                ")",
                (user_id, keep_count)
            )
            conn.commit()

    # Long Memory
    def set_long_memory(self, user_id: str, key: str, value: str, timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO long_memory (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (user_id, key, value, timestamp_ms)
            )
            conn.commit()

    def get_long_memory(self, user_id: str, key: str) -> Optional[str]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT value FROM long_memory WHERE user_id = ? AND key = ?", (user_id, key))
            row = cur.fetchone()
            return row["value"] if row else None

    def get_all_long_memory(self, user_id: str) -> Dict[str, str]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT key, value FROM long_memory WHERE user_id = ?", (user_id,))
            rows = cur.fetchall()
            return {r["key"]: r["value"] for r in rows}

    # Execution Logs
    def log_step(self, task_id: str, level: str, message: str, details: Optional[Dict[str, Any]] = None, timestamp_ms: int = 0):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO execution_logs (task_id, timestamp, level, message, details) VALUES (?, ?, ?, ?, ?)",
                (task_id, timestamp_ms, level, message, json.dumps(details) if details else None)
            )
            conn.commit()

sqlite_store = SqliteStore()
