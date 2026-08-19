from google.genai import types
from backend.core.client import get_genai_client
from backend.config import config


def generate():
    client = get_genai_client()
    model = config.DEFAULT_MODEL

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text="Hello Gemini! Introduce yourself in one sentence."
                )
            ],
        )
    ]

    tools = [
        types.Tool(google_search=types.GoogleSearch()),
        types.Tool(google_maps=types.GoogleMaps()),
    ]

    generate_content_config = types.GenerateContentConfig(
        max_output_tokens=2048,
        tools=tools,
        thinking_config=types.ThinkingConfig(
            thinking_level="MEDIUM",
        ),
    )

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if (
            not chunk.candidates
            or not chunk.candidates[0].content
            or not chunk.candidates[0].content.parts
        ):
            continue

        print(chunk.text, end="")
    print()


if __name__ == "__main__":
    generate()