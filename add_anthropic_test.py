import json

# Build a compact Anthropic fixture for MiniMax-M2.7 with thinking -> content transition
# This mimics the stream structure with content_block_stop ending thinking

thinking_parts = [
    "User wants a joke in Chinese, about 50 characters. Let me think of a short Chinese joke...",
    " One classic: 老师问学生: 1+1等于几? 学生说: 不知道. 老师说: 笨蛋!",
    " 学生说: 你也笨蛋! 老师无语. 这个差不多50字了吧?",
]

text_parts = [
    "# 笑话\n\n老师问学生：1+1等于几？学生说：不知道。老师说：笨蛋！学生说：老师也笨蛋！",
]

lines = []

# message_start
lines.append("event: message_start")
lines.append(json.dumps({
    "type": "message_start",
    "message": {
        "id": "test-id",
        "type": "message",
        "role": "assistant",
        "usage": {"input_tokens": 10, "output_tokens": 0}
    }
}))

# content_block_start (thinking)
lines.append("event: content_block_start")
lines.append(json.dumps({
    "type": "content_block_start",
    "index": 0,
    "content_block": {"type": "thinking", "thinking": ""}
}))

# thinking_delta chunks
for part in thinking_parts:
    lines.append("event: content_block_delta")
    lines.append(json.dumps({
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "thinking_delta", "thinking": part}
    }))

# content_block_stop - ends thinking state
lines.append("event: content_block_stop")
lines.append(json.dumps({"type": "content_block_stop", "index": 0}))

# text_delta chunks
for text in text_parts:
    lines.append("event: content_block_delta")
    lines.append(json.dumps({
        "type": "content_block_delta",
        "index": 0,
        "delta": {"type": "text_delta", "text": text}
    }))

# message_delta with stop_reason
lines.append("event: message_delta")
lines.append(json.dumps({
    "type": "message_delta",
    "delta": {"stop_reason": "end_turn"},
    "usage": {"output_tokens": 50}
}))

# message_stop
lines.append("event: message_stop")
lines.append(json.dumps({"type": "message_stop"}))

with open("backend/tests/fixtures/minimax_m25_anthropic.json", "w") as f:
    json.dump(lines, f, ensure_ascii=False)

print(f"Wrote {len(lines)} lines")

# Verify
with open("backend/tests/fixtures/minimax_m25_anthropic.json") as f:
    loaded = json.load(f)
print(f"Verified: {len(loaded)} lines")
