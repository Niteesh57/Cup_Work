import os
from google import genai
from backend.config import config

client = genai.Client()

tools = [
    {
        'type': 'google_search',
    },
]

generation_config = {
    'max_output_tokens': 2048,
    'top_p': 0.95,
}

response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='Explain how autonomous multi-agent systems handle task decomposition in short 1 line.',
)

print('Agent Response:', response.text)
