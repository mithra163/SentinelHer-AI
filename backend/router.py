def choose_model(is_emergency):

    if is_emergency:
        return "mixtral-8x7b-32768"

    return "llama3-8b-8192"