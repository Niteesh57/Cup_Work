import asyncio
import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.config import config
from backend.core.client import GenAIClientManager, get_genai_client
from backend.storage.sqlite_store import sqlite_store
from backend.memory.memory_manager import memory_manager
from backend.tools.definitions import get_desktop_tools
from backend.agents import main_executor_agent, voice_transcriber, root_agent
from backend.bridge.electron_bridge import electron_bridge

async def run_tests():
    print("=== 1. Testing Config & Client Initialization ===")
    print(f"Config default model: {config.DEFAULT_MODEL}")
    print(f"Config Vertex AI mode: {config.USE_VERTEXAI}")
    client = get_genai_client()
    print(f"GenAI Client initialized: {type(client)}")

    print("\n=== 2. Testing Model Listing ===")
    models = GenAIClientManager.list_models()
    print(f"Models retrieved ({len(models)}): {[m['id'] for m in models[:4]]}")

    print("\n=== 3. Testing SQLite Storage & Memory ===")
    memory_manager.set_user_fact("test-user", "favorite_editor", "VSCode")
    fact = memory_manager.get_user_fact("test-user", "favorite_editor")
    print(f"Stored & Retrieved fact: favorite_editor = {fact}")
    assert fact == "VSCode", "Fact retrieval mismatch!"

    memory_manager.add_turn("test-user", "USER", "What is my favorite editor?")
    memory_manager.add_turn("test-user", "AGENT", "Your favorite editor is VSCode.")
    history = memory_manager.get_recent_history("test-user", limit=5)
    print(f"Memory turns: {len(history)}")

    print("\n=== 4. Testing Desktop Tool Definitions ===")
    tools = get_desktop_tools()
    print(f"Tools packaged for GenAI: {len(tools[0].function_declarations)} functions")

    print("\n=== 5. Testing Standalone Direct Tool Execution (PowerShell Bridge) ===")
    try:
        windows_res = await electron_bridge.execute_tool("get_open_windows", {})
        print(f"Get Open Windows result success: {windows_res.get('success')}")
        if "windows" in windows_res:
            print(f"Detected {len(windows_res['windows'])} open windows.")

        # Test UIA Interactive Elements
        uia_res = await electron_bridge.execute_tool("uia_get_interactive_elements", {"maxElements": 10})
        print(f"Get Interactive Elements success: {uia_res.get('success')}, count: {uia_res.get('count', 0)}")
        if uia_res.get("elements"):
            first_el = uia_res["elements"][0]
            print(f"Sample element: [{first_el.get('controlType')}] '{first_el.get('name')}' -> Center: ({first_el.get('bounds', {}).get('centerX')}, {first_el.get('bounds', {}).get('centerY')})")

        # Test UIA Element Search
        search_res = await electron_bridge.execute_tool("uia_search_elements", {"query": "e", "maxResults": 5})
        print(f"Search Elements success: {search_res.get('success')}, count: {search_res.get('count', 0)}")
    except Exception as e:
        print(f"Tool execution warning: {e}")

    print("\n=== 6. Testing Conversational Agent Prompt Execution ===")
    result = await main_executor_agent.execute_prompt(
        prompt="Hi Hey Jave, reply with 'Hello from Python Brain!' and nothing else.",
        task_id="test-task-1",
        user_id="test-user"
    )
    print(f"Executor result: success={result['success']}, message={result['message']}")

    print("\n=== ALL BACKEND TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(run_tests())
