"""
Shared Claude API client — used by Replicated, ZeroPath, Medbridge, CompanyCam, FSP, Upstream.
Copy this file into each Python project's src/ directory.
"""
import anthropic
import json
import base64
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

client = anthropic.Anthropic()
MODEL = "claude-sonnet-4-5"

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((anthropic.RateLimitError, anthropic.APIConnectionError)),
)
def complete(
    prompt: str,
    system: str = "",
    model: str = MODEL,
    max_tokens: int = 4096,
    as_json: bool = False,
) -> str | dict:
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text
    if as_json:
        clean = text.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
            if clean.endswith("```"):
                clean = clean[:-3]
        return json.loads(clean.strip())
    return text

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((anthropic.RateLimitError, anthropic.APIConnectionError)),
)
def analyze_image(
    image_path: str | None = None,
    image_b64: str | None = None,
    media_type: str = "image/jpeg",
    prompt: str = "",
    system: str = "",
    model: str = MODEL,
    as_json: bool = False,
) -> str | dict:
    if image_path and not image_b64:
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode()
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    text = message.content[0].text
    if as_json:
        clean = text.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:]).rstrip("```").strip()
        return json.loads(clean)
    return text

def stream_complete(prompt: str, system: str = "", model: str = MODEL):
    """Generator that yields text chunks for SSE streaming."""
    with client.messages.stream(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            yield text
