import time
import logging
from typing import Dict, List, Optional, Any
from backend.storage.sqlite_store import sqlite_store, SqliteStore

logger = logging.getLogger("cup_work.memory")

class MemoryManager:
    """
    Manages multi-user & multi-device memory:
      1. Short-Term Memory: Active conversation turns with auto-summarization at 1,000 count/tokens threshold.
      2. Long-Term Memory: Permanent archive of all user/agent activities, timeline, and summaries across devices.
      3. User Preferences: Temporal preferences with 'present' vs 'expired' state (e.g. 'user like react - expired', 'user like nextjs - present').
      4. Todo-Tasks: Multi-device task management with status and priorities.
      5. Context Aggregator: Compiles preferences, todos, and short-term memory into structured prompt context for all agents.
    """

    def __init__(self, store: Optional[SqliteStore] = None, auto_summarize_threshold: int = 1000):
        self.store = store or sqlite_store
        self.auto_summarize_threshold = auto_summarize_threshold

    # ── Identity & Device Auto-Provisioning ───────────────────────────────────
    def is_device_registered(self, device_id: str) -> Optional[Dict[str, Any]]:
        return self.store.is_device_registered(device_id)

    def get_or_create_identity(
        self,
        device_id: Optional[str] = None,
        user_id: Optional[str] = None,
        device_name: Optional[str] = None,
        device_type: str = "desktop",
        os_info: Optional[str] = None
    ) -> Dict[str, Any]:
        """Ensures every request has a valid user_id and device_id, creating random friendly names if new."""
        return self.store.get_or_create_device_and_user(
            device_id=device_id,
            user_id=user_id,
            device_name=device_name,
            device_type=device_type,
            os_info=os_info
        )

    def update_user_name(self, user_id: str, new_name: str) -> bool:
        return self.store.update_user_name(user_id=user_id, new_name=new_name)

    def update_device_name(self, device_id: str, new_device_name: str) -> bool:
        return self.store.update_device_name(device_id=device_id, new_device_name=new_device_name)

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self.store.get_user_profile(user_id=user_id)

    # ── Short-Term Memory & Auto-Summarization ─────────────────────────────────
    def add_turn(
        self,
        user_id: str,
        role: str,
        content: str,
        device_id: str = "desktop-main",
        session_id: str = "default-session",
        token_count: Optional[int] = None
    ) -> int:
        now = int(time.time() * 1000)
        # Estimate token count if not supplied (~4 characters per token heuristic)
        tokens = token_count if token_count is not None else max(1, len(content) // 4)
        
        turn_id = self.store.add_short_term_turn(
            user_id=user_id,
            device_id=device_id,
            role=role.upper(),
            content=content,
            session_id=session_id,
            token_count=tokens,
            timestamp_ms=now
        )

        # Check if unsummarized turns have exceeded the threshold (1000 tokens or count)
        stats = self.store.count_unsummarized_short_term(user_id=user_id, device_id=device_id)
        if stats["count"] >= self.auto_summarize_threshold or stats["total_tokens"] >= self.auto_summarize_threshold:
            logger.info(f"Short-term memory threshold reached for user '{user_id}' on device '{device_id}' (count={stats['count']}, tokens={stats['total_tokens']}). Auto-summarizing...")
            self.auto_summarize(user_id=user_id, device_id=device_id)

        return turn_id

    def auto_summarize(self, user_id: str, device_id: str = "desktop-main") -> Optional[str]:
        """
        Condenses older unsummarized turns into a concise structured summary,
        archives the full details to Long-Term Memory, and leaves a rolled-up summary turn in Short-Term Memory.
        """
        unsummarized = self.store.get_unsummarized_short_term_turns(user_id=user_id, device_id=device_id, limit=300)
        if not unsummarized or len(unsummarized) < 2:
            return None

        # Keep the latest 6 turns unsummarized for immediate conversational continuity
        if len(unsummarized) > 6:
            to_summarize = unsummarized[:-6]
        else:
            to_summarize = unsummarized

        turn_ids = [t["id"] for t in to_summarize]
        
        # Build concise extraction summary
        dialogue_lines = []
        user_requests = []
        agent_actions = []
        
        for t in to_summarize:
            role = t["role"]
            content = t["content"].strip()
            if role == "USER":
                user_requests.append(content[:150])
                dialogue_lines.append(f"User: {content[:100]}")
            elif role == "AGENT":
                agent_actions.append(content[:150])
                dialogue_lines.append(f"Agent: {content[:100]}")
            else:
                dialogue_lines.append(f"{role}: {content[:100]}")

        summary_text = (
            f"Prior Activity Summary ({len(to_summarize)} turns):\n"
            f"- Key Requests: {'; '.join(user_requests[:5]) if user_requests else 'General conversation'}\n"
            f"- Outcomes: {'; '.join(agent_actions[:5]) if agent_actions else 'Executed desktop tasks and queries'}"
        )

        # 1. Archive to Long-Term Memory (Permanent Timeline)
        self.store.add_long_term_activity(
            user_id=user_id,
            device_id=device_id,
            activity_type="turn_summary",
            title=f"Conversation Rollup ({len(to_summarize)} interactions)",
            content=summary_text,
            details={"turn_count": len(to_summarize), "first_turn": to_summarize[0]["created_at"], "last_turn": to_summarize[-1]["created_at"]},
            importance=1.0
        )

        # 2. Mark old turns as summarized
        self.store.mark_short_term_turns_summarized(turn_ids)

        # 3. Add summary turn into short-term memory
        self.store.add_short_term_turn(
            user_id=user_id,
            device_id=device_id,
            role="SUMMARY",
            content=summary_text,
            token_count=len(summary_text) // 4
        )

        logger.info(f"Successfully auto-summarized {len(to_summarize)} turns for user '{user_id}'.")
        return summary_text

    def get_recent_history(self, user_id: str, device_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        return self.store.get_recent_short_term(user_id=user_id, device_id=device_id, limit=limit)

    def save_chat_message(
        self,
        msg_id: str,
        user_id: str,
        device_id: str,
        role: str,
        text: Optional[str] = None,
        is_voice: bool = False,
        status: str = "done",
        steps: Optional[List[Dict[str, Any]]] = None,
        duration_ms: int = 0,
        output_tokens: Optional[Dict[str, Any]] = None,
        hitl: Optional[Dict[str, Any]] = None,
        whiteboard_data: Optional[Dict[str, Any]] = None,
        spoke_voice: bool = False,
        had_whiteboard: bool = False,
        date_str: Optional[str] = None,
        created_at: Optional[int] = None,
    ) -> str:
        return self.store.save_chat_message(
            msg_id=msg_id,
            user_id=user_id,
            device_id=device_id,
            role=role,
            text=text,
            is_voice=is_voice,
            status=status,
            steps=steps,
            duration_ms=duration_ms,
            output_tokens=output_tokens,
            hitl=hitl,
            whiteboard_data=whiteboard_data,
            spoke_voice=spoke_voice,
            had_whiteboard=had_whiteboard,
            date_str=date_str,
            created_at=created_at,
        )


    def get_today_chat_messages(
        self,
        user_id: str,
        device_id: Optional[str] = None,
        date_str: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return self.store.get_today_chat_messages(user_id=user_id, device_id=device_id, date_str=date_str)

    def delete_chat_message(self, msg_id: str, user_id: Optional[str] = None) -> bool:
        return self.store.delete_chat_message(msg_id=msg_id, user_id=user_id)

    def clear_today_chat_messages(

        self,
        user_id: str,
        device_id: Optional[str] = None,
        date_str: Optional[str] = None,
    ) -> None:
        self.store.clear_today_chat_messages(user_id=user_id, device_id=device_id, date_str=date_str)

    def start_new_coffee_cup(
        self,
        user_id: str,
        device_id: Optional[str] = None,
        date_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.store.start_new_coffee_cup(user_id=user_id, device_id=device_id, date_str=date_str)



    # ── User Preferences & Likings (Temporal 'present' vs 'expired') ──────────
    def set_user_preference(
        self,
        user_id: str,
        key: str,
        value: str,
        status: str = "present",
        category: str = "general",
        device_id: str = "all",
        confidence: float = 1.0,
        source: str = "conversation"
    ) -> Dict[str, Any]:
        return self.store.set_user_preference(
            user_id=user_id,
            preference_key=key,
            preference_value=value,
            status=status,
            category=category,
            device_id=device_id,
            confidence=confidence,
            source=source
        )

    def expire_user_preference(self, user_id: str, key: str, category: Optional[str] = None) -> bool:
        return self.store.expire_user_preference(user_id=user_id, preference_key=key, category=category)

    def get_active_preferences(self, user_id: str, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.store.get_active_preferences(user_id=user_id, device_id=device_id)

    def get_all_preferences(self, user_id: str, status: Optional[str] = None, category: Optional[str] = None, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.store.get_user_preferences(user_id=user_id, status=status, category=category, device_id=device_id)

    # Legacy Fact helpers
    def set_user_fact(self, user_id: str, key: str, value: str):
        self.set_user_preference(user_id=user_id, key=key, value=value, status="present")

    def get_user_fact(self, user_id: str, key: str) -> Optional[str]:
        prefs = self.store.get_user_preferences(user_id=user_id, status="present")
        for p in prefs:
            if p["preference_key"] == key:
                return p["preference_value"]
        return None

    def get_all_facts(self, user_id: str) -> Dict[str, str]:
        prefs = self.store.get_active_preferences(user_id=user_id)
        return {p["preference_key"]: p["preference_value"] for p in prefs}

    # ── Todo-Tasks Management ─────────────────────────────────────────────────
    def create_todo(
        self,
        user_id: str,
        title: str,
        description: Optional[str] = None,
        priority: str = "medium",
        due_date: Optional[int] = None,
        tags: Optional[List[str]] = None,
        device_id: str = "desktop-main"
    ) -> Dict[str, Any]:
        return self.store.create_todo_task(
            user_id=user_id,
            device_id=device_id,
            title=title,
            description=description,
            priority=priority,
            due_date=due_date,
            tags=tags
        )

    def update_todo(
        self,
        task_id: str,
        user_id: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        due_date: Optional[int] = None,
        tags: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        return self.store.update_todo_task(
            task_id=task_id,
            user_id=user_id,
            status=status,
            priority=priority,
            title=title,
            description=description,
            due_date=due_date,
            tags=tags
        )

    def get_active_todos(self, user_id: str, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.store.get_active_todo_tasks(user_id=user_id, device_id=device_id)

    def get_all_todos(self, user_id: str, status: Optional[str] = None, priority: Optional[str] = None, device_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.store.get_todo_tasks(user_id=user_id, device_id=device_id, status=status, priority=priority)

    def delete_todo(self, task_id: str, user_id: str) -> bool:
        return self.store.delete_todo_task(task_id=task_id, user_id=user_id)

    def clear_all_todos(self, user_id: str) -> bool:
        return self.store.clear_all_todo_tasks(user_id=user_id)

    # ── Long-Term Memory (Activity Timeline) ──────────────────────────────────
    def log_activity(
        self,
        user_id: str,
        activity_type: str,
        title: str,
        content: str,
        details: Optional[Dict[str, Any]] = None,
        importance: float = 1.0,
        device_id: str = "desktop-main"
    ) -> str:
        return self.store.add_long_term_activity(
            user_id=user_id,
            device_id=device_id,
            activity_type=activity_type,
            title=title,
            content=content,
            details=details,
            importance=importance
        )

    def get_timeline(self, user_id: str, device_id: Optional[str] = None, date_str: Optional[str] = None, activity_type: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        return self.store.get_long_term_activities(
            user_id=user_id,
            device_id=device_id,
            date_str=date_str,
            activity_type=activity_type,
            limit=limit
        )

    # ── Context Aggregator for Agents ─────────────────────────────────────────
    def get_agent_context(self, user_id: str = "default", device_id: str = "desktop-main") -> str:
        """
        Primary context builder: Always gathers:
          1. Active User Preferences / Likings (status = 'present')
          2. Active Todo Tasks (status IN ('pending', 'in_progress'))
          3. Current Short-Term Memory (today's summary & recent turns)
        Formats a clean, token-efficient context prompt block for agents.
        """
        parts = []

        # 1. User Preferences
        active_prefs = self.get_active_preferences(user_id=user_id, device_id=device_id)
        if active_prefs:
            pref_lines = []
            for p in active_prefs:
                cat = p.get("category", "general")
                k = p["preference_key"]
                v = p["preference_value"]
                pref_lines.append(f"- [{cat.upper()}] {k}: {v}")
            parts.append("### Active User Preferences & Likings:\n" + "\n".join(pref_lines))

        # 2. Active Todo Tasks
        active_todos = self.get_active_todos(user_id=user_id, device_id=device_id)
        if active_todos:
            todo_lines = []
            for t in active_todos:
                prio = t.get("priority", "medium").upper()
                stat = t.get("status", "pending")
                title = t["title"]
                desc = f" ({t['description']})" if t.get("description") else ""
                todo_lines.append(f"- [{prio}] {title}{desc} [Status: {stat}]")
            parts.append("### Active Todo Tasks:\n" + "\n".join(todo_lines))

        # 3. Short-Term History & Today's Activity
        recent_turns = self.get_recent_history(user_id=user_id, device_id=device_id, limit=8)
        if recent_turns:
            history_lines = []
            for r in recent_turns:
                role = r["role"]
                content = r["content"]
                if role == "SUMMARY":
                    history_lines.append(f"--- {content} ---")
                else:
                    history_lines.append(f"{role}: {content}")
            parts.append("### Recent Conversation & Activity Context:\n" + "\n".join(history_lines))

        return "\n\n".join(parts)

    def format_context_prompt(self, user_id: str) -> str:
        return self.get_agent_context(user_id=user_id, device_id="desktop-main")

memory_manager = MemoryManager()
