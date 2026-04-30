import os
from dotenv import load_dotenv
load_dotenv()
from google import genai
from google.genai import types

def my_tool(x: int) -> int:
    """Multiplies x by 2."""
    return x * 2

client = genai.Client()
chat = client.chats.create(
    model="gemini-2.5-flash",
    config=types.GenerateContentConfig(
        tools=[my_tool],
        temperature=0.1,
    )
)
response = chat.send_message("What is my_tool of 5?")
print(response.function_calls)
if response.function_calls:
    call = response.function_calls[0]
    res = my_tool(**call.args)
    part = types.Part.from_function_response(name=call.name, response={"result": res})
    response2 = chat.send_message(part)
    print(response2.text)
