from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from src.config import LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
from src.tools import get_tools
from src.prompts import SYSTEM_PROMPT


def build_agent():
    """Build and return a LangGraph ReAct agent wired to the IFC tools."""
    llm = ChatOpenAI(
        base_url=LLM_BASE_URL,
        model=LLM_MODEL,
        api_key=LLM_API_KEY or "not-needed",
    )

    tools = get_tools()

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    return agent


def run_agent(agent, user_message: str) -> list:
    """Invoke the agent with a user message and return the message history.

    Returns the full list of messages from the agent run so the caller can
    extract the final AI message (the fix report).
    """
    result = agent.invoke({"messages": [("user", user_message)]})
    return result["messages"]
