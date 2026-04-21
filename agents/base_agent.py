import anthropic
from config import ANTHROPIC_API_KEY, MODEL, MAX_TOKENS


class BaseAgent:
    def __init__(self, name: str, system_prompt: str, tools: list):
        self.name = name
        self.system_prompt = system_prompt
        self.tools = tools
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        raise NotImplementedError

    def run(self, user_message: str, conversation_history: list = None) -> dict:
        messages = list(conversation_history or [])
        messages.append({"role": "user", "content": user_message})

        while True:
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=[
                    {
                        "type": "text",
                        "text": self.system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=self.tools,
                messages=messages,
            )

            if response.stop_reason == "end_turn":
                text_content = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        text_content += block.text
                return {
                    "agent": self.name,
                    "response": text_content,
                    "conversation_history": messages,
                }

            elif response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = self.execute_tool(block.name, block.input)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": str(result),
                            }
                        )

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

            else:
                break

        return {
            "agent": self.name,
            "response": "작업이 완료되었습니다.",
            "conversation_history": messages,
        }
