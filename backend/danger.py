danger_words = [
    "unsafe",
    "help",
    "danger",
    "scared",
    "followed",
    "stalking",
    "fear"
]

def detect_danger(msg):

    msg = msg.lower()

    for word in danger_words:

        if word in msg:
            return True

    return False