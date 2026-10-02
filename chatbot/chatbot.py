import streamlit as st
from openai import OpenAI
import json, os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)

# As a fallback model list in case the API call fails or returns an empty list
FALLBACK_MODELS = [
    "openai/gpt-4o",
    "anthropic/claude-sonnet-4",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.3-70b-instruct",
]

HISTORY_FILE = "chat_history.json"

# Dyanamically retrieve the list of available models from the OpenRouter API
@st.cache_data(ttl=600, show_spinner = "Fetching available models...")
def fetch_all_models():
    try:
        response = client.models.list()
        ids = sorted([model.id for model in response.data])
        return ids if ids else FALLBACK_MODELS
    except Exception:
        return FALLBACK_MODELS
    
ALL_MODELS = fetch_all_models()
        
# load and save chat history
def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
                # compatibility for older versions
                if isinstance(data, list):
                    return {"default message": data}
                return data 
        except Exception:
            return {"default message": []}
    return {"default message": []}

def save_history(conversation):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(conversation, f, ensure_ascii=False, indent=2)

def message_to_markdown(message):
    lines = []
    for m in message:
        role = "**User**" if m["role"] == "user" else "**Assistant**"
        lines.append(f"### {role}\n\n{m['content']}\n")
    return "\n---\n".join(lines)



# state initialization
if "conversation" not in st.session_state:
    st.session_state.conversation = load_history()
if "current_conversation" not in st.session_state:
    st.session_state.current_conversation = list(st.session_state.conversation.keys())[0]
if "show_free_only" not in st.session_state:
    st.session_state.show_free_only = True

# side frame
with st.sidebar:
    st.title("Settings")

    # model selection
    st.session_state.show_free_only = st.checkbox(
        "Show Free Models Only", value=st.session_state.show_free_only)

    if st.session_state.show_free_only:
        AVAILABLE_MODELS = [m for m in ALL_MODELS if m.endswith(":free")]
        if not AVAILABLE_MODELS:
            available_models = ALL_MODELS
    else:
        AVAILABLE_MODELS = ALL_MODELS

    if "model" not in st.session_state or st.session_state.model not in AVAILABLE_MODELS:
        st.session_state.model = AVAILABLE_MODELS[0] if AVAILABLE_MODELS else FALLBACK_MODELS[0]

    st.session_state.model = st.selectbox(
        "Select Model", 
        AVAILABLE_MODELS, 
        index=AVAILABLE_MODELS.index(st.session_state.model),
    )

    if st.button("Refresh Models", use_container_width=True):
        fetch_all_models.clear()
        st.rerun()

    temperature = st.slider("Temperature", 0.0, 2.0, 0.7, 0.1)
    max_tokens = st.slider("Max Tokens", 128, 4096, 1024, 128)
    system_prompt = st.text_area("System Prompt", "You are a helpful assistant.", height=80)

    st.divider()

    # area for conversation history
    st.subheader("Conversation History")

    for conv_name in list(st.session_state.conversation.keys()):
        col_left, col_right = st.columns([5, 1])

        with col_left:
            label = f"{conv_name}" if conv_name == st.session_state.current_conversation else conv_name
            if st.button(label, key=f"conv_{conv_name}", use_container_width=True):
                st.session_state.current_conversation = conv_name
                st.rerun()

        with col_right:
            if st.button("🗑️", key=f"del_{conv_name}", use_container_width=True):
                # delete the conversation
                del st.session_state.conversation[conv_name]

                # if no conversations remiain, switch to the default conversation
                if not st.session_state.conversation:
                    st.session_state.conversation = {"default message": []}

                # if the current conversation is deleted, switch to the first available conversation
                if st.session_state.current_conversation == conv_name:
                    st.session_state.current_conversation = list(st.session_state.conversation.keys())[0]

                save_history(st.session_state.conversation)
                st.rerun()

    # new conversation but put it under the history list
    if st.button("New Conversation", use_container_width=True):
        # create a new conversation with a unique name
        idx = len(st.session_state.conversation) + 1
        new_name = f"Conversation {idx}"
        while new_name in st.session_state.conversation:
            idx += 1
            new_name = f"Conversation {idx}"
        st.session_state.conversation[new_name] = []
        st.session_state.current_conversation = new_name
        save_history(st.session_state.conversation)
        st.rerun()

    st.divider()

    # clear current conversation + export current conversation
    col_a, col_b = st.columns(2)

    with col_a:
        if st.button("Clear Current Conversation", use_container_width=True):
            st.session_state.conversation[st.session_state.current_conversation] = []
            save_history(st.session_state.conversation)
            st.rerun()

    with col_b:
        st.download_button(
            "Export Current Conversation",
            data=message_to_markdown(st.session_state.conversation[st.session_state.current_conversation]),
            file_name= "chat.md",
            mime="text/markdown",
            use_container_width=True,
        )

# main frame
st.title("Chatbot Interface")
st.caption(
    f"Current Conversation: {st.session_state.current_conversation} | "
    f"Model: {st.session_state.model}"
)

# Retrieve the current conversation
current_messages = st.session_state.conversation[st.session_state.current_conversation]

# Render history of messages
for i, msg in enumerate(current_messages):
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Input and response handling
if prompt := st.chat_input("Type your message here..."):
    # 1. user message quened
    current_messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # 2. call model (streaming)
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        full_reply = ""
        try:
            messages = [{"role": "system", "content": system_prompt}] + current_messages
            stream = client.chat.completions.create(
                model=st.session_state.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                full_reply += delta
                message_placeholder.markdown(full_reply + "▌")
            message_placeholder.markdown(full_reply)
        except Exception as e:
            full_reply = f"Error: {str(e)}"
            message_placeholder.markdown(full_reply)

    # 3. ai message quened + write back session state + persistence
    current_messages.append({"role": "assistant", "content": full_reply})
    st.session_state.conversation[st.session_state.current_conversation] = current_messages
    save_history(st.session_state.conversation)
    st.rerun()