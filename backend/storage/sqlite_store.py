import sqlite3
import json
import logging
import uuid
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.config import config

logger = logging.getLogger("hey_jave.storage")

class SqliteStore:
    """
    Persistent SQLite storage for Hey Jave Python Backend.
    Handles multi-user & multi-device isolation for:
      - Users & Devices
      - Short-Term Memory (<1000 items/tokens auto-summarization)
      - Long-Term Memory (All Activity Timeline across devices/dates)
      - User Preferences & Likings (Temporal 'present' vs 'expired' state)
      - Todo-Tasks (Multi-device task tracking)
      - Checkpoints, Sessions, Logs, Clarifications & HITL
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
                -- Users
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    metadata TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- Devices
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    device_name TEXT NOT NULL,
                    device_type TEXT DEFAULT 'desktop',
                    os_info TEXT,
                    last_active_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );

                -- Short-Term Memory (Conversations & Today's turns per user/device)
                CREATE TABLE IF NOT EXISTS short_term_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    token_count INTEGER DEFAULT 0,
                    date_str TEXT NOT NULL,
                    is_summarized INTEGER DEFAULT 0,
                    created_at INTEGER NOT NULL
                );

                -- Long-Term Memory (All Activity Archive across devices/dates)
                CREATE TABLE IF NOT EXISTS long_term_memory (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    date_str TEXT NOT NULL,
                    activity_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    details TEXT,
                    importance REAL DEFAULT 1.0,
                    created_at INTEGER NOT NULL
                );

                -- User Preferences / Likings (Temporal 'present' vs 'expired')
                CREATE TABLE IF NOT EXISTS user_preferences (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    device_id TEXT DEFAULT 'all',
                    category TEXT DEFAULT 'general',
                    preference_key TEXT NOT NULL,
                    preference_value TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'present',
                    confidence REAL DEFAULT 1.0,
                    valid_from INTEGER NOT NULL,
                    valid_to INTEGER,
                    source TEXT DEFAULT 'conversation',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- Todo-Tasks
                CREATE TABLE IF NOT EXISTS todo_tasks (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    due_date INTEGER,
                    completed_at INTEGER,
                    tags TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- Legacy Compatibility Tables
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

                -- Indexes for fast retrieval
                CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
                CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
                CREATE INDEX IF NOT EXISTS idx_stm_user_device ON short_term_memory(user_id, device_id, date_str, is_summarized, created_at);
                CREATE INDEX IF NOT EXISTS idx_ltm_user_device_date ON long_term_memory(user_id, device_id, date_str, created_at);
                CREATE INDEX IF NOT EXISTS idx_ltm_activity ON long_term_memory(user_id, activity_type);
                CREATE INDEX IF NOT EXISTS idx_user_pref_lookup ON user_preferences(user_id, status, preference_key);
                CREATE INDEX IF NOT EXISTS idx_todo_user_status ON todo_tasks(user_id, status, priority);
                CREATE INDEX IF NOT EXISTS idx_short_memory_user ON short_memory(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_long_memory_user ON long_memory(user_id);
                CREATE INDEX IF NOT EXISTS idx_logs_task ON execution_logs(task_id);
                CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_queue(status);
            """)
            conn.commit()

    # ── User & Device Management & Auto-Provisioning ──────────────────────────
    RANDOM_ADJECTIVES = [
        "Cosmic", "Astral", "Quantum", "Cyber", "Swift", "Nova", "Stellar", "Pixel",
        "Aero", "Hyper", "Vibrant", "Shadow", "Neon", "Echo", "Atlas", "Zenith",
        "Apex", "Orbit", "Luminous", "Turbo", "Solar", "Prism", "Vector", "Pulse"
    ]
    RANDOM_NOUNS = [
        "Pilot", "Coder", "Voyager", "Crafter", "Explorer", "Pioneer", "Hacker",
        "Architect", "Maker", "Scholar", "Wizard", "Guardian", "Specter", "Falcon",
        "Nomad", "Cipher", "Spark", "Navigator", "Artisan", "Builder", "Sage", "Runner"
    ]

    @classmethod
    def generate_random_username(cls) -> str:
        import random
        adj = random.choice(cls.RANDOM_ADJECTIVES)
        noun = random.choice(cls.RANDOM_NOUNS)
        num = random.randint(10, 99)
        return f"{adj}{noun}_{num}"

    def get_or_create_device_and_user(
        self,
        device_id: Optional[str] = None,
        user_id: Optional[str] = None,
        device_name: Optional[str] = None,
        device_type: str = "desktop",
        os_info: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Auto-provisions a new User and Device if either is first encountered.
        Generates a friendly random username that the user can later customize in frontend settings.
        Guarantees every conversation is anchored to a valid user_id and device_id.
        """
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            # 1. If device_id provided, check if already registered
            if device_id and device_id.strip():
                cur = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id.strip(),))
                dev_row = cur.fetchone()
                if dev_row:
                    target_user_id = dev_row["user_id"]
                    # Fetch user
                    user_cur = conn.execute("SELECT * FROM users WHERE id = ?", (target_user_id,))
                    user_row = user_cur.fetchone()
                    user_name = user_row["name"] if user_row else target_user_id
                    # Update device heartbeat and name if provided
                    if device_name and device_name.strip() and device_name.strip() != dev_row["device_name"]:
                        conn.execute("UPDATE devices SET last_active_at = ?, device_name = ? WHERE id = ?", (now, device_name.strip(), dev_row["id"]))
                    else:
                        conn.execute("UPDATE devices SET last_active_at = ? WHERE id = ?", (now, dev_row["id"]))
                    conn.commit()
                    return {
                        "userId": target_user_id,
                        "userName": user_name,
                        "deviceId": dev_row["id"],
                        "deviceName": device_name.strip() if (device_name and device_name.strip()) else dev_row["device_name"],
                        "isNewUser": False,
                        "isNewDevice": False
                    }

            # 2. Device is new. Resolve or create user
            final_user_id = user_id.strip() if (user_id and user_id.strip()) else None
            is_new_user = False
            user_name = None

            if final_user_id:
                user_cur = conn.execute("SELECT * FROM users WHERE id = ?", (final_user_id,))
                user_row = user_cur.fetchone()
                if user_row:
                    user_name = user_row["name"]
                else:
                    user_name = self.generate_random_username()
                    conn.execute(
                        "INSERT INTO users (id, name, email, metadata, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)",
                        (final_user_id, user_name, now, now)
                    )
                    is_new_user = True
            else:
                final_user_id = f"usr_{uuid.uuid4().hex[:8]}"
                user_name = self.generate_random_username()
                conn.execute(
                    "INSERT INTO users (id, name, email, metadata, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)",
                    (final_user_id, user_name, now, now)
                )
                is_new_user = True

            # 3. Create the new device
            final_device_id = device_id.strip() if (device_id and device_id.strip()) else f"dev_{uuid.uuid4().hex[:8]}"
            final_device_name = device_name.strip() if (device_name and device_name.strip()) else f"Device-{final_device_id[-6:]}"

            conn.execute(
                "INSERT INTO devices (id, user_id, device_name, device_type, os_info, last_active_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (final_device_id, final_user_id, final_device_name, device_type, os_info, now, now)
            )
            conn.commit()

            logger.info(f"Auto-provisioned device '{final_device_id}' ({final_device_name}) for user '{final_user_id}' ({user_name}) [NewUser={is_new_user}]")
            return {
                "userId": final_user_id,
                "userName": user_name,
                "deviceId": final_device_id,
                "deviceName": final_device_name,
                "isNewUser": is_new_user,
                "isNewDevice": True
            }

    def ensure_user(self, user_id: str, name: Optional[str] = None, email: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        now = int(time.time() * 1000)
        display_name = name or (self.generate_random_username() if user_id != "default" else "Default User")
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            if row:
                return dict(row)
            conn.execute(
                "INSERT INTO users (id, name, email, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, display_name, email, json.dumps(metadata) if metadata else None, now, now)
            )
            conn.commit()
            return {"id": user_id, "name": display_name, "email": email, "metadata": metadata, "created_at": now, "updated_at": now}

    def ensure_device(self, device_id: str, user_id: str, device_name: Optional[str] = None, device_type: str = "desktop", os_info: Optional[str] = None) -> Dict[str, Any]:
        self.ensure_user(user_id)
        now = int(time.time() * 1000)
        dev_name = device_name or f"Device-{device_id}"
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,))
            row = cur.fetchone()
            if row:
                conn.execute("UPDATE devices SET last_active_at = ? WHERE id = ?", (now, device_id))
                conn.commit()
                return dict(row)
            conn.execute(
                "INSERT INTO devices (id, user_id, device_name, device_type, os_info, last_active_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (device_id, user_id, dev_name, device_type, os_info, now, now)
            )
            conn.commit()
            return {"id": device_id, "user_id": user_id, "device_name": dev_name, "device_type": device_type, "os_info": os_info, "last_active_at": now, "created_at": now}

    def update_user_name(self, user_id: str, new_name: str) -> bool:
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            cur = conn.execute("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", (new_name.strip(), now, user_id))
            conn.commit()
            return cur.rowcount > 0

    def update_device_name(self, device_id: str, new_device_name: str) -> bool:
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            cur = conn.execute("UPDATE devices SET device_name = ?, last_active_at = ? WHERE id = ?", (new_device_name.strip(), now, device_id))
            conn.commit()
            return cur.rowcount > 0

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            user_cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user_row = user_cur.fetchone()
            if not user_row:
                return None

            dev_cur = conn.execute("SELECT * FROM devices WHERE user_id = ? ORDER BY last_active_at DESC", (user_id,))
            devices = [dict(d) for d in dev_cur.fetchall()]

            pref_cur = conn.execute("SELECT COUNT(*) as count FROM user_preferences WHERE user_id = ? AND status = 'present'", (user_id,))
            pref_count = pref_cur.fetchone()["count"]

            todo_cur = conn.execute("SELECT COUNT(*) as count FROM todo_tasks WHERE user_id = ? AND status IN ('pending', 'in_progress')", (user_id,))
            todo_count = todo_cur.fetchone()["count"]

            return {
                "userId": user_row["id"],
                "name": user_row["name"],
                "email": user_row["email"],
                "metadata": json.loads(user_row["metadata"]) if user_row["metadata"] else None,
                "devices": devices,
                "activePreferencesCount": pref_count,
                "activeTodosCount": todo_count,
                "createdAt": user_row["created_at"],
                "updatedAt": user_row["updated_at"]
            }

    # ── Short-Term Memory (Turns & Summarization per User & Device) ────────────
    def add_short_term_turn(self, user_id: str, device_id: str, role: str, content: str, session_id: str = "default-session", token_count: int = 0, date_str: Optional[str] = None, timestamp_ms: Optional[int] = None) -> int:
        now = timestamp_ms or int(time.time() * 1000)
        dt_str = date_str or time.strftime("%Y-%m-%d")
        self.ensure_device(device_id, user_id)
        with self._get_connection() as conn:
            cur = conn.execute(
                "INSERT INTO short_term_memory (user_id, device_id, session_id, role, content, token_count, date_str, is_summarized, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
                (user_id, device_id, session_id, role, content, token_count, dt_str, now)
            )
            conn.commit()
            return cur.lastrowid

    def get_unsummarized_short_term_turns(self, user_id: str, device_id: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            if device_id and device_id != "all":
                cur = conn.execute(
                    "SELECT * FROM short_term_memory WHERE user_id = ? AND device_id = ? AND is_summarized = 0 ORDER BY created_at ASC LIMIT ?",
                    (user_id, device_id, limit)
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM short_term_memory WHERE user_id = ? AND is_summarized = 0 ORDER BY created_at ASC LIMIT ?",
                    (user_id, limit)
                )
            return [dict(r) for r in cur.fetchall()]

    def count_unsummarized_short_term(self, user_id: str, device_id: Optional[str] = None) -> Dict[str, int]:
        with self._get_connection() as conn:
            if device_id and device_id != "all":
                cur = conn.execute(
                    "SELECT COUNT(*) as count, COALESCE(SUM(token_count), 0) as total_tokens FROM short_term_memory WHERE user_id = ? AND device_id = ? AND is_summarized = 0",
                    (user_id, device_id)
                )
            else:
                cur = conn.execute(
                    "SELECT COUNT(*) as count, COALESCE(SUM(token_count), 0) as total_tokens FROM short_term_memory WHERE user_id = ? AND is_summarized = 0",
                    (user_id,)
                )
            row = cur.fetchone()
            return {"count": row["count"] if row else 0, "total_tokens": row["total_tokens"] if row else 0}

    def mark_short_term_turns_summarized(self, turn_ids: List[int]):
        if not turn_ids:
            return
        with self._get_connection() as conn:
            placeholders = ",".join("?" for _ in turn_ids)
            conn.execute(f"UPDATE short_term_memory SET is_summarized = 1 WHERE id IN ({placeholders})", turn_ids)
            conn.commit()

    def get_recent_short_term(self, user_id: str, device_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            if device_id and device_id != "all":
                cur = conn.execute(
                    "SELECT * FROM short_term_memory WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC LIMIT ?",
                    (user_id, device_id, limit)
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM short_term_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                    (user_id, limit)
                )
            rows = cur.fetchall()
            return list(reversed([dict(r) for r in rows]))

    # ── Long-Term Memory (All Activity Archive across Devices/Dates) ───────────
    def add_long_term_activity(self, user_id: str, device_id: str, activity_type: str, title: str, content: str, details: Optional[Dict[str, Any]] = None, importance: float = 1.0, date_str: Optional[str] = None, timestamp_ms: Optional[int] = None) -> str:
        activity_id = f"ltm-{uuid.uuid4().hex[:12]}"
        now = timestamp_ms or int(time.time() * 1000)
        dt_str = date_str or time.strftime("%Y-%m-%d")
        self.ensure_device(device_id, user_id)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO long_term_memory (id, user_id, device_id, date_str, activity_type, title, content, details, importance, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (activity_id, user_id, device_id, dt_str, activity_type, title, content, json.dumps(details) if details else None, importance, now)
            )
            conn.commit()
            return activity_id

    def get_long_term_activities(self, user_id: str, device_id: Optional[str] = None, date_str: Optional[str] = None, activity_type: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            query = "SELECT * FROM long_term_memory WHERE user_id = ?"
            params: List[Any] = [user_id]
            if device_id and device_id != "all":
                query += " AND device_id = ?"
                params.append(device_id)
            if date_str:
                query += " AND date_str = ?"
                params.append(date_str)
            if activity_type:
                query += " AND activity_type = ?"
                params.append(activity_type)
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)

            cur = conn.execute(query, params)
            results = []
            for r in cur.fetchall():
                item = dict(r)
                if item.get("details"):
                    try:
                        item["details"] = json.loads(item["details"])
                    except Exception:
                        pass
                results.append(item)
            return results

    # ── User Preferences & Likings (Temporal 'present' vs 'expired') ──────────
    def set_user_preference(self, user_id: str, preference_key: str, preference_value: str, status: str = "present", category: str = "general", device_id: str = "all", confidence: float = 1.0, source: str = "conversation") -> Dict[str, Any]:
        """
        Creates or updates a user preference.
        If a new active preference is set, existing conflicting active preferences for the same key
        can be updated or marked expired.
        """
        now = int(time.time() * 1000)
        self.ensure_user(user_id)
        if device_id != "all":
            self.ensure_device(device_id, user_id)

        clean_status = status.lower().strip()
        if clean_status not in ("present", "expired"):
            clean_status = "present"

        with self._get_connection() as conn:
            # Check if matching preference already exists
            cur = conn.execute(
                "SELECT * FROM user_preferences WHERE user_id = ? AND preference_key = ? AND category = ?",
                (user_id, preference_key, category)
            )
            existing = cur.fetchone()
            if existing:
                pref_id = existing["id"]
                valid_to = now if clean_status == "expired" else None
                conn.execute(
                    "UPDATE user_preferences SET preference_value = ?, status = ?, device_id = ?, confidence = ?, "
                    "valid_to = ?, updated_at = ?, source = ? WHERE id = ?",
                    (preference_value, clean_status, device_id, confidence, valid_to, now, source, pref_id)
                )
            else:
                pref_id = f"pref-{uuid.uuid4().hex[:10]}"
                valid_to = now if clean_status == "expired" else None
                conn.execute(
                    "INSERT INTO user_preferences (id, user_id, device_id, category, preference_key, preference_value, status, confidence, valid_from, valid_to, source, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (pref_id, user_id, device_id, category, preference_key, preference_value, clean_status, confidence, now, valid_to, source, now, now)
                )
            conn.commit()

            # Keep legacy preferences table in sync for backward compatibility
            if clean_status == "present":
                conn.execute(
                    "INSERT INTO preferences (user_id, key, value, confidence, updated_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, confidence = excluded.confidence, updated_at = excluded.updated_at",
                    (user_id, preference_key, preference_value, confidence, now)
                )
                conn.commit()

            return {
                "id": pref_id,
                "userId": user_id,
                "deviceId": device_id,
                "category": category,
                "key": preference_key,
                "value": preference_value,
                "status": clean_status,
                "confidence": confidence,
                "validFrom": now,
                "validTo": valid_to,
                "updatedAt": now
            }

    def expire_user_preference(self, user_id: str, preference_key: str, category: Optional[str] = None) -> bool:
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            if category:
                cur = conn.execute(
                    "UPDATE user_preferences SET status = 'expired', valid_to = ?, updated_at = ? "
                    "WHERE user_id = ? AND preference_key = ? AND category = ? AND status = 'present'",
                    (now, now, user_id, preference_key, category)
                )
            else:
                cur = conn.execute(
                    "UPDATE user_preferences SET status = 'expired', valid_to = ?, updated_at = ? "
                    "WHERE user_id = ? AND preference_key = ? AND status = 'present'",
                    (now, now, user_id, preference_key)
                )
            # Remove from legacy active preferences
            conn.execute("DELETE FROM preferences WHERE user_id = ? AND key = ?", (user_id, preference_key))
            conn.commit()
            return cur.rowcount > 0

    def get_user_preferences(self, user_id: str, status: Optional[str] = None, category: Optional[str] = None, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            query = "SELECT * FROM user_preferences WHERE user_id = ?"
            params: List[Any] = [user_id]
            if status:
                query += " AND status = ?"
                params.append(status)
            if category:
                query += " AND category = ?"
                params.append(category)
            if device_id and device_id != "all":
                query += " AND (device_id = ? OR device_id = 'all')"
                params.append(device_id)
            query += " ORDER BY updated_at DESC"

            cur = conn.execute(query, params)
            return [dict(r) for r in cur.fetchall()]

    def get_active_preferences(self, user_id: str, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.get_user_preferences(user_id, status="present", device_id=device_id)

    # ── Todo-Tasks Management ─────────────────────────────────────────────────
    def create_todo_task(self, user_id: str, device_id: str, title: str, description: Optional[str] = None, priority: str = "medium", due_date: Optional[int] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        task_id = f"todo-{uuid.uuid4().hex[:10]}"
        now = int(time.time() * 1000)
        self.ensure_device(device_id, user_id)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO todo_tasks (id, user_id, device_id, title, description, status, priority, due_date, completed_at, tags, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?, ?)",
                (task_id, user_id, device_id, title, description, priority.lower(), due_date, json.dumps(tags) if tags else None, now, now)
            )
            conn.commit()
            return {
                "id": task_id,
                "userId": user_id,
                "deviceId": device_id,
                "title": title,
                "description": description,
                "status": "pending",
                "priority": priority.lower(),
                "dueDate": due_date,
                "completedAt": None,
                "tags": tags or [],
                "createdAt": now,
                "updatedAt": now
            }

    def update_todo_task(self, task_id: str, user_id: str, status: Optional[str] = None, priority: Optional[str] = None, title: Optional[str] = None, description: Optional[str] = None, due_date: Optional[int] = None, tags: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        now = int(time.time() * 1000)
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM todo_tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
            existing = cur.fetchone()
            if not existing:
                return None

            updates = []
            params = []
            if status is not None:
                updates.append("status = ?")
                params.append(status.lower())
                if status.lower() == "completed":
                    updates.append("completed_at = ?")
                    params.append(now)
                else:
                    updates.append("completed_at = NULL")
            if priority is not None:
                updates.append("priority = ?")
                params.append(priority.lower())
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if due_date is not None:
                updates.append("due_date = ?")
                params.append(due_date)
            if tags is not None:
                updates.append("tags = ?")
                params.append(json.dumps(tags))

            if not updates:
                return dict(existing)

            updates.append("updated_at = ?")
            params.append(now)
            params.extend([task_id, user_id])

            query = f"UPDATE todo_tasks SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
            conn.execute(query, params)
            conn.commit()

            cur = conn.execute("SELECT * FROM todo_tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
            updated_row = cur.fetchone()
            if updated_row:
                item = dict(updated_row)
                if item.get("tags"):
                    try:
                        item["tags"] = json.loads(item["tags"])
                    except Exception:
                        pass
                return item
            return None

    def get_todo_tasks(self, user_id: str, device_id: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            query = "SELECT * FROM todo_tasks WHERE user_id = ?"
            params: List[Any] = [user_id]
            if device_id and device_id != "all":
                query += " AND device_id = ?"
                params.append(device_id)
            if status:
                query += " AND status = ?"
                params.append(status.lower())
            if priority:
                query += " AND priority = ?"
                params.append(priority.lower())
            query += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC"

            cur = conn.execute(query, params)
            results = []
            for r in cur.fetchall():
                item = dict(r)
                if item.get("tags"):
                    try:
                        item["tags"] = json.loads(item["tags"])
                    except Exception:
                        item["tags"] = []
                results.append(item)
            return results

    def get_active_todo_tasks(self, user_id: str, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            query = "SELECT * FROM todo_tasks WHERE user_id = ? AND status IN ('pending', 'in_progress')"
            params: List[Any] = [user_id]
            if device_id and device_id != "all":
                query += " AND device_id = ?"
                params.append(device_id)
            query += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at DESC"

            cur = conn.execute(query, params)
            results = []
            for r in cur.fetchall():
                item = dict(r)
                if item.get("tags"):
                    try:
                        item["tags"] = json.loads(item["tags"])
                    except Exception:
                        item["tags"] = []
                results.append(item)
            return results

    def delete_todo_task(self, task_id: str, user_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM todo_tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
            conn.commit()
            return cur.rowcount > 0

    # ── Legacy Checkpoints & Logs Support ─────────────────────────────────────
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

    # Legacy Short Memory
    def add_short_memory(self, user_id: str, content: str, timestamp_ms: int):
        self.add_short_term_turn(user_id=user_id, device_id="desktop-main", role="SYSTEM", content=content, timestamp_ms=timestamp_ms)
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

    # Legacy Long Memory
    def set_long_memory(self, user_id: str, key: str, value: str, timestamp_ms: int):
        self.set_user_preference(user_id=user_id, preference_key=key, preference_value=value, status="present")
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
            return {r["key"]: r["value"] for r in cur.fetchall()}

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

    # Legacy Preferences
    def set_preference(self, user_id: str, key: str, value: str, confidence: float = 1.0, timestamp_ms: int = 0):
        self.set_user_preference(user_id=user_id, preference_key=key, preference_value=value, status="present", confidence=confidence)

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
        active_prefs = self.get_active_preferences(user_id)
        if active_prefs:
            return {p["preference_key"]: p["preference_value"] for p in active_prefs}
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
