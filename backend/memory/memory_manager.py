import time
from typing import Dict, List, Optional, Any
from backend.storage.sqlite_store import sqlite_store, SqliteStore

class MemoryManager:
    """
    Manages short-term conversation history and long-term user preferences/facts.
    """

    def __init__(self, store: Optional[SqliteStore] = None, short_memory_limit: int = 20):
        self.store = store or sqlite_store
        self.short_memory_limit = short_memory_limit

    def add_turn(self, user_id: str, role: str, content: str):
        now = int(time.time() * 1000)
        formatted = f"{role.upper()}: {content}"
        self.store.add_short_memory(user_id, formatted, now)
        self.store.trim_short_memory(user_id, self.short_memory_limit)

    def get_recent_history(self, user_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        k = limit or self.short_memory_limit
        memories = self.store.get_short_memory(user_id, limit=k)
        # Reverse to get chronological order
        return list(reversed(memories))

    def set_user_fact(self, user_id: str, key: str, value: str):
        now = int(time.time() * 1000)
        self.store.set_long_memory(user_id, key, value, now)

    def get_user_fact(self, user_id: str, key: str) -> Optional[str]:
        return self.store.get_long_memory(user_id, key)

    def get_all_facts(self, user_id: str) -> Dict[str, str]:
        return self.store.get_all_long_memory(user_id)

    def format_context_prompt(self, user_id: str) -> str:
        """Formats long-term facts and recent memory into a prompt context segment."""
        facts = self.get_all_facts(user_id)
        recent = self.get_recent_history(user_id, limit=6)

        parts = []
        if facts:
            facts_str = "\n".join([f"- {k}: {v}" for k, v in facts.items()])
            parts.append(f"User Knowledge & Preferences:\n{facts_str}")

        if recent:
            history_str = "\n".join([r["content"] for r in recent])
            parts.append(f"Recent Conversation:\n{history_str}")

        return "\n\n".join(parts)

memory_manager = MemoryManager()
