import asyncio
import os
import sys
import tempfile
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.config import config
from backend.storage.sqlite_store import SqliteStore
from backend.memory.memory_manager import MemoryManager
from backend.tools.definitions import get_desktop_tools

async def run_tests():
    print("=================================================================")
    print("   HEY JAVE MULTI-USER DB & MEMORY SYSTEM VERIFICATION TESTS     ")
    print("=================================================================")

    # Use an isolated test database
    temp_db = Path(tempfile.gettempdir()) / "test_cup_work_multiuser.sqlite"
    if temp_db.exists():
        temp_db.unlink()

    store = SqliteStore(db_path=temp_db)
    mem_mgr = MemoryManager(store=store, auto_summarize_threshold=5)

    print("\n--- 1. Auto-Provisioning Random User & Device on First Sighting ---")
    # Case A: Brand new unknown device connects
    identity1 = mem_mgr.get_or_create_identity(device_id="dev_surface_pro_9", device_name="Surface Pro 9")
    print(f"Auto-provisioned brand new device: {identity1}")
    assert identity1["isNewUser"] is True
    assert identity1["isNewDevice"] is True
    assert len(identity1["userName"]) > 4
    assert "_" in identity1["userName"]  # e.g. CosmicCoder_42

    # Case B: Same device connects again -> Recognizes user
    identity1_again = mem_mgr.get_or_create_identity(device_id="dev_surface_pro_9")
    print(f"Same device connects again: {identity1_again}")
    assert identity1_again["isNewUser"] is False
    assert identity1_again["isNewDevice"] is False
    assert identity1_again["userId"] == identity1["userId"]
    assert identity1_again["userName"] == identity1["userName"]

    # Case C: User updates their auto-assigned username in settings
    mem_mgr.update_user_name(identity1["userId"], "Alex_TheDev")
    profile1 = mem_mgr.get_user_profile(identity1["userId"])
    print(f"Updated profile: Name={profile1['name']}, Devices={len(profile1['devices'])}")
    assert profile1["name"] == "Alex_TheDev"
    print("[PASS] Identity auto-provisioning and username customization verified.")

    print("\n--- 2. Multi-User & Multi-Device Segregation ---")
    user_a = "user_alice"
    user_b = "user_bob"
    dev_a1 = "laptop-thinkpad"
    dev_a2 = "desktop-workstation"
    dev_b1 = "macbook-air"

    store.ensure_device(dev_a1, user_a, device_name="Alice Laptop")
    store.ensure_device(dev_a2, user_a, device_name="Alice Desktop")
    store.ensure_device(dev_b1, user_b, device_name="Bob MacBook")

    # Add preferences for Alice and Bob
    mem_mgr.set_user_preference(user_a, "favorite_ide", "VS Code", status="present", category="tools", device_id=dev_a1)
    mem_mgr.set_user_preference(user_b, "favorite_ide", "PyCharm", status="present", category="tools", device_id=dev_b1)

    alice_prefs = mem_mgr.get_active_preferences(user_a)
    bob_prefs = mem_mgr.get_active_preferences(user_b)
    print(f"Alice preferences count: {len(alice_prefs)} -> {alice_prefs[0]['preference_key']}: {alice_prefs[0]['preference_value']}")
    print(f"Bob preferences count: {len(bob_prefs)} -> {bob_prefs[0]['preference_key']}: {bob_prefs[0]['preference_value']}")
    assert alice_prefs[0]["preference_value"] == "VS Code"
    assert bob_prefs[0]["preference_value"] == "PyCharm"
    print("[PASS] Multi-User isolation verified.")

    print("\n--- 2. User Preferences: 'present' vs 'expired' State Transitions ---")
    # Diagram test cases:
    # 1. user like react - expired
    # 2. user work in google - present
    # 3. user like nextjs - present
    mem_mgr.set_user_preference(user_a, "framework", "React", status="expired", category="coding")
    mem_mgr.set_user_preference(user_a, "framework", "Next.js", status="present", category="coding")
    mem_mgr.set_user_preference(user_a, "employer", "Google", status="present", category="career")

    all_alice_prefs = mem_mgr.get_all_preferences(user_a)
    active_alice_prefs = mem_mgr.get_active_preferences(user_a)
    print(f"Total Alice preferences: {len(all_alice_prefs)}")
    print(f"Active (present) Alice preferences ({len(active_alice_prefs)}):")
    for p in active_alice_prefs:
        print(f"  - [{p['category']}] {p['preference_key']} = {p['preference_value']} (Status: {p['status']})")

    assert len(active_alice_prefs) == 3  # favorite_ide, framework (Next.js), employer (Google)
    assert any(p["preference_value"] == "Next.js" for p in active_alice_prefs)
    assert any(p["preference_value"] == "Google" for p in active_alice_prefs)

    # Test expiring employer preference
    mem_mgr.expire_user_preference(user_a, "employer")
    active_after_expire = mem_mgr.get_active_preferences(user_a)
    assert not any(p["preference_key"] == "employer" for p in active_after_expire)
    print("[PASS] User preferences 'present' and 'expired' states verified.")

    print("\n--- 3. Todo-Tasks Multi-Device Management ---")
    task1 = mem_mgr.create_todo(user_a, "Design system architecture diagram", priority="high", tags=["arch", "design"], device_id=dev_a1)
    task2 = mem_mgr.create_todo(user_a, "Refactor database migrations", priority="urgent", tags=["db"], device_id=dev_a2)
    task3 = mem_mgr.create_todo(user_b, "Review PR #42", priority="medium", device_id=dev_b1)

    alice_active_todos = mem_mgr.get_active_todos(user_a)
    print(f"Alice active todos ({len(alice_active_todos)}):")
    for t in alice_active_todos:
        print(f"  - [{t['priority'].upper()}] {t['title']} [Device: {t['device_id']}]")

    assert len(alice_active_todos) == 2
    assert alice_active_todos[0]["priority"] == "urgent"  # Urgent sorted first

    # Update task status to completed
    mem_mgr.update_todo(task2["id"], user_a, status="completed")
    alice_active_todos_after = mem_mgr.get_active_todos(user_a)
    assert len(alice_active_todos_after) == 1
    assert alice_active_todos_after[0]["id"] == task1["id"]
    print("[PASS] Todo-Tasks creation, priority sorting, and status transitions verified.")

    print("\n--- 4. Short-Term Memory & Auto-Summarization (>Threshold) ---")
    # Add turns until threshold (5) is triggered
    for i in range(1, 7):
        mem_mgr.add_turn(user_a, "USER", f"Query {i}: How do I optimize database performance in SQLite?", device_id=dev_a1)
        mem_mgr.add_turn(user_a, "AGENT", f"Answer {i}: Use proper indexing, WAL mode, and batch transactions.", device_id=dev_a1)

    short_history = mem_mgr.get_recent_history(user_a, device_id=dev_a1, limit=10)
    print(f"Short-Term turns for Alice on {dev_a1}: {len(short_history)}")
    has_summary_turn = any(t["role"] == "SUMMARY" for t in short_history)
    print(f"Contains auto-generated SUMMARY turn: {has_summary_turn}")
    assert has_summary_turn, "Auto-summarization should have generated a summary turn!"
    print("[PASS] Short-term memory auto-summarization verified.")

    print("\n--- 5. Long-Term Memory (Permanent Activity Timeline) ---")
    mem_mgr.log_activity(user_a, "milestone", "Completed Phase 1 Release", "Successfully launched Hey Jave backend with multi-user DB.", device_id=dev_a1)
    timeline = mem_mgr.get_timeline(user_a)
    print(f"Alice Long-Term Timeline records: {len(timeline)}")
    for item in timeline:
        print(f"  - [{item['activity_type'].upper()}] {item['title']} (Device: {item['device_id']}, Date: {item['date_str']})")

    assert len(timeline) >= 2  # Turn summary + milestone
    assert any(t["activity_type"] == "milestone" for t in timeline)
    assert any(t["activity_type"] == "turn_summary" for t in timeline)
    print("[PASS] Long-Term Activity Timeline verified.")

    print("\n--- 6. Agent Context Aggregator (Preferences + Todos + Short-Term) ---")
    agent_context = mem_mgr.get_agent_context(user_id=user_a, device_id=dev_a1)
    print("Compiled Agent Context Prompt Block:\n-----------------------------------------")
    print(agent_context)
    print("-----------------------------------------")
    assert "Active User Preferences & Likings" in agent_context
    assert "Active Todo Tasks" in agent_context
    assert "Recent Conversation & Activity Context" in agent_context
    print("[PASS] Agent context aggregation verified.")

    print("\n--- 7. GenAI Tool Declarations ---")
    tools = get_desktop_tools()
    tool_names = [f.name for f in tools[0].function_declarations]
    print(f"Total tools declared: {len(tool_names)}")
    for expected in ["set_user_preference", "expire_user_preference", "get_user_preferences", "create_todo_task", "update_todo_task", "list_todo_tasks", "log_activity_event"]:
        assert expected in tool_names, f"Tool {expected} missing from declarations!"
    print(f"[PASS] All memory and task tool declarations registered.")

    # Cleanup temp test db
    try:
        if temp_db.exists():
            temp_db.unlink()
    except Exception:
        pass

    print("\n=================================================================")
    print("        ALL MULTI-USER DB & MEMORY TESTS PASSED!                 ")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
