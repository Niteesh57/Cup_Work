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

                CREATE TABLE IF NOT EXISTS preferences (
                    user_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    confidence REAL DEFAULT 1.0,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, key)
                );

                CREATE TABLE IF NOT EXISTS agent_sessions (
                    session_id TEXT PRIMARY KEY,
                    goal TEXT,
                    status TEXT,
                    current_state TEXT,
                    context_snapshot TEXT,
                    started_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS clarifications (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    question TEXT,
                    answer TEXT,
                    saved_as_preference INTEGER DEFAULT 0,
                    asked_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hitl_queue (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    question TEXT,
                    options TEXT,
                    status TEXT NOT NULL,
                    answer TEXT,
                    created_at INTEGER NOT NULL,
                    answered_at INTEGER
                );

                CREATE INDEX IF NOT EXISTS idx_short_memory_user ON short_memory(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_long_memory_user ON long_memory(user_id);
                CREATE INDEX IF NOT EXISTS idx_logs_task ON execution_logs(task_id);
                CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_queue(status);
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

    def save_action(self, task_id: str, action_name: str, args: Dict[str, Any], result: Any, success: bool, duration_ms: int = 0, timestamp_ms: int = 0):
        level = "INFO" if success else "ERROR"
        message = f"Action '{action_name}' ({duration_ms}ms)"
        details = {"action": action_name, "args": args, "result": result, "success": success, "durationMs": duration_ms}
        self.log_step(task_id, level, message, details, timestamp_ms=timestamp_ms)

    # Preferences
    def set_preference(self, user_id: str, key: str, value: str, confidence: float = 1.0, timestamp_ms: int = 0):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO preferences (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, "
                "confidence = excluded.confidence, updated_at = excluded.updated_at",
                (user_id, key, value, confidence, timestamp_ms)
            )
            conn.commit()

    def get_preference(self, user_id: str, key: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT value, confidence, updated_at FROM preferences WHERE user_id = ? AND key = ?",
                (user_id, key)
            )
            row = cur.fetchone()
            if row:
                return {"value": row["value"], "confidence": row["confidence"], "updatedAt": row["updated_at"]}
            return None

    def get_all_preferences(self, user_id: str) -> Dict[str, str]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT key, value FROM preferences WHERE user_id = ?", (user_id,))
            return {r["key"]: r["value"] for r in cur.fetchall()}

    # Agent Sessions
    def save_agent_session(self, session_id: str, goal: str, status: str, current_state: str, context_snapshot: Optional[Dict[str, Any]] = None, timestamp_ms: int = 0):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO agent_sessions (session_id, goal, status, current_state, context_snapshot, started_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(session_id) DO UPDATE SET goal = excluded.goal, status = excluded.status, "
                "current_state = excluded.current_state, context_snapshot = excluded.context_snapshot, "
                "updated_at = excluded.updated_at",
                (session_id, goal, status, current_state, json.dumps(context_snapshot) if context_snapshot else None, timestamp_ms, timestamp_ms)
            )
            conn.commit()

    def get_agent_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM agent_sessions WHERE session_id = ?", (session_id,))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "sessionId": row["session_id"],
                "goal": row["goal"],
                "status": row["status"],
                "currentState": row["current_state"],
                "contextSnapshot": json.loads(row["context_snapshot"]) if row["context_snapshot"] else None,
                "startedAt": row["started_at"],
                "updatedAt": row["updated_at"],
            }

    def update_agent_session_status(self, session_id: str, status: str, current_state: Optional[str] = None, timestamp_ms: int = 0):
        with self._get_connection() as conn:
            if current_state is None:
                conn.execute(
                    "UPDATE agent_sessions SET status = ?, updated_at = ? WHERE session_id = ?",
                    (status, timestamp_ms, session_id)
                )
            else:
                conn.execute(
                    "UPDATE agent_sessions SET status = ?, current_state = ?, updated_at = ? WHERE session_id = ?",
                    (status, current_state, timestamp_ms, session_id)
                )
            conn.commit()

    # Clarifications
    def add_clarification(self, clarification_id: str, task_id: str, question: str, answer: str, saved_as_preference: int, timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO clarifications (id, task_id, question, answer, saved_as_preference, asked_at) VALUES (?, ?, ?, ?, ?, ?)",
                (clarification_id, task_id, question, answer, saved_as_preference, timestamp_ms)
            )
            conn.commit()

    def get_clarifications(self, task_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM clarifications WHERE task_id = ? ORDER BY asked_at ASC", (task_id,))
            return [
                {
                    "id": r["id"],
                    "taskId": r["task_id"],
                    "question": r["question"],
                    "answer": r["answer"],
                    "savedAsPreference": r["saved_as_preference"],
                    "askedAt": r["asked_at"],
                }
                for r in cur.fetchall()
            ]

    # HITL Queue
    def enqueue_hitl(self, hitl_id: str, task_id: str, question: str, options: Optional[List[str]], status: str, timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO hitl_queue (id, task_id, question, options, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (hitl_id, task_id, question, json.dumps(options) if options else None, status, timestamp_ms)
            )
            conn.commit()

    def resolve_hitl(self, hitl_id: str, answer: str, timestamp_ms: int):
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE hitl_queue SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?",
                (answer, timestamp_ms, hitl_id)
            )
            conn.commit()

    def get_pending_hitl(self, task_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM hitl_queue WHERE task_id = ? AND status = 'pending' ORDER BY created_at ASC",
                (task_id,)
            )
            return [
                {
                    "id": r["id"],
                    "taskId": r["task_id"],
                    "question": r["question"],
                    "options": json.loads(r["options"]) if r["options"] else [],
                    "status": r["status"],
                    "createdAt": r["created_at"],
                }
                for r in cur.fetchall()
            ]

sqlite_store = SqliteStore()
