import json

# MiniMax-M2.7 Anthropic format stream:
# 1. message_start with usage
# 2. ping event
# 3. content_block_start (thinking)
# 4. ~35 thinking_delta chunks (English reasoning, ~1716 chars total)
# 5. content_block_stop
# 6. message_delta with stop_reason
# 7. message_stop

# Thinking content extracted from user's stream
thinking_parts = [
    "The user",
    " asks: \"写一个 50 字的笑话\" which translates to \"Write a 50-character joke\" (or \"Write a 50-word",
    " joke\"). The Chinese request is ambiguous: \"50 字\" could mean \"50 characters\" or \"50 words\". Usually in Chinese,",
    " \"字\" means characters, not words. So likely they want a joke in Chinese with exactly 50 characters (including punctuation).",
    " Or maybe they want a joke with about 50 Chinese characters (including punctuation). Let's produce a Chinese joke of exactly 50 characters.",
    " We need to produce a joke of exactly 50 Chinese characters. That is fairly straightforward. The challenge: we must count each Chinese character",
    " to be precise.\nWe need to produce a joke of exactly 50 Chinese characters. Let's try a short Chinese joke.",
    " The user asks for a joke. I need to count the characters carefully. Each Chinese character counts as one.",
    " For example: \"我今天去图书馆借书，结果管理员说：'对不起，已经没有'书'",
    " The user asks: \"写一个 50 字的笑话\" which translates to \"Write a 50-character joke\" (or \"Write a 50-word",
    " We need to produce a joke of exactly 50 Chinese characters. Let's write a simple joke.",
    " I need to produce a joke in Chinese with about 50 characters. Let's make it short.",
    " I need to produce a joke in Chinese with about 50 characters. Let's try.",
    " 我去书店买书，老板说没书了，只有纸。我把纸折成书，大家都笑了。",
    " 我去图书馆借书，结果管理员说没书了只有纸。我把纸折成书，大家笑了。",
    " A joke: 顾客问服务员：你们这有WiFi吗？服务员说：没有，只有纸。顾客说：那给我来张纸。",
    " One joke in Chinese (50 characters): 我去图书馆借书，管理员说：没书了，只有纸！我把纸折成书，大家笑了。",
    " 我去书店买书，服务员说：没书了，只有纸。我说：那给我来张纸吧。",
    " 老师问学生：1+1等于几？学生说：不知道。老师说：笨蛋！学生说：老师也笨蛋！",
    " 老师问学生：1+1等于几？学生说：不知道。老师说：笨蛋！学生说：你也笨蛋！",
    " 老师问学生：1+1等于几？学生说：不知道。老师说：笨蛋！学生说：你也笨蛋！老师无语。",
    " 顾客问服务员：你们这有WiFi吗？服务员说：没有，只有纸。顾客说：那给我来张纸。服务员给了张纸。",
    " 我去书店买书，服务员说没书了，只有纸。我把纸折成书，大家都笑了。",
    " One more Chinese joke (50 chars): 我去图书馆借书，管理员说没书了只有纸。我把纸折成书，大家笑了。",
    " 我去图书馆借书，管理员说没书了只有纸。我把纸折成书，大家都笑了。约50字。",
    " 我去图书馆借书，管理员说没书了只有纸。我把纸折成书，大家笑了。约50字。",
    " 我去图书馆借书，管理员说没书了只有纸。我把纸折成书，大家笑了。约50字。",
    " 我去图书馆借书，管理员说没书了只有纸。我把纸折成书，大家笑了。约50字。",
    " A Chinese joke (50 characters): 顾客问服务员：你们这有WiFi吗？服务员说：没有，只有纸。",
    " 顾客问服务员：你们这有WiFi吗？服务员说：没有，只有纸。顾客说：那给我来张纸。",
    " 顾客问服务员：你们这有WiFi吗？服务员说：没有，只有纸。顾客说：那给我来张纸。服务员给了。",
    " 老师问学生：1+1等于几？学生说：不知道。老师说：笨蛋！学生说：你也笨蛋！老师无语了。",
]

thinking_text = "".join(thinking_parts)
print(f"Total thinking chars: {len(thinking_text)}")

lines = []

# message_start
lines.append('event: message_start')
lines.append('data: ' + json.dumps({"type": "message_start", "message": {"id": "06435693ffdc83c0f019ac7465017899", "type": "message", "role": "assistant", "content": [], "model": "MiniMax-M2.7-highspeed", "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 48, "output_tokens": 0}, "service_tier": "standard"}}))

# ping
lines.append("event: ping")
lines.append("data: " + json.dumps({"type": "ping"}))

# content_block_start (thinking)
lines.append("event: content_block_start")
lines.append("data: " + json.dumps({"type": "content_block_start", "index": 0, "content_block": {"type": "thinking", "thinking": ""}}))

# thinking_delta chunks (sample every Nth chunk for brevity in fixture)
for part in thinking_parts:
    lines.append("event: content_block_delta")
    lines.append("data: " + json.dumps({"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": part}}))

# content_block_stop
lines.append("event: content_block_stop")
lines.append("data: " + json.dumps({"type": "content_block_stop", "index": 0}))

# text content chunks
text_parts = [
    "\n\n# 50字笑话\n\n",
    "我今天去图书馆借书，管理员却说：'对不起，已经没有'书'了，只有'纸'！'于是我把纸折成书，大家都笑了。",
    "\n\n（全文完）",
]
for text in text_parts:
    lines.append("event: content_block_delta")
    lines.append("data: " + json.dumps({"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}}))

# message_delta with stop_reason
lines.append("event: message_delta")
lines.append("data: " + json.dumps({"type": "message_delta", "delta": {"stop_reason": "max_tokens"}, "usage": {"input_tokens": 48, "output_tokens": 1024}}))

# message_stop
lines.append("event: message_stop")
lines.append("data: " + json.dumps({"type": "message_stop"}))

# Write as JSON array of SSE protocol lines
with open("backend/tests/fixtures/minimax_m25_anthropic.json", "w") as f:
    json.dump(lines, f, ensure_ascii=False)

print(f"Wrote {len(lines)} lines")
