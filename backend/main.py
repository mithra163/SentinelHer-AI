from fastapi import FastAPI
from groq import Groq
from dotenv import load_dotenv
import os

from memory import update_memory, get_memory
from danger import detect_danger
from router import choose_model
from incident import generate_incident

load_dotenv()

app = FastAPI()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

@app.get("/")
def home():

    return {
        "message":"SentinelHer AI Backend Running"
    }

@app.get("/chat")
def chat(msg: str):

    emergency = detect_danger(msg)

    model = choose_model(emergency)

    if "travel" in msg.lower():
        update_memory("travel_pattern", msg)

    if "unsafe" in msg.lower():
        update_memory("unsafe_area", msg)

    memory = get_memory()

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role":"system",
                "content":f"""
                You are an AI women safety assistant.

                User Memory:
                {memory}
                """
            },
            {
                "role":"user",
                "content":msg
            }
        ]
    )

    response = completion.choices[0].message.content

    incident = None

    if emergency:
        incident = generate_incident(msg)

    return {
        "response":response,
        "emergency":emergency,
        "model_used":model,
        "memory":memory,
        "incident_summary":incident
    }