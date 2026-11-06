"""The picture sort's cards: our own words, one open-licensed photo each (see picture_sort.py).

Each card: key (also the photo's file name under apps/web/public/picture-sort/), interest type, the words read
aloud, the photo's alt text and its credit (title, author, license and links, as the license asks).
"""

CARDS: list[dict] = [
    {"key": "car", "type": "R", "text": "Fix a car", "alt": "", "credit": None},
    {"key": "wood", "type": "R", "text": "Build things out of wood", "alt": "", "credit": None},
    {"key": "farm", "type": "R", "text": "Grow food on a farm", "alt": "", "credit": None},
    {"key": "weld", "type": "R", "text": "Weld metal", "alt": "", "credit": None},
    {"key": "animals", "type": "R", "text": "Take care of farm animals", "alt": "", "credit": None},
    {"key": "fire", "type": "R", "text": "Fight forest fires", "alt": "", "credit": None},
    {"key": "microscope", "type": "I", "text": "Look at things under a microscope", "alt": "", "credit": None},
    {"key": "experiment", "type": "I", "text": "Do science experiments", "alt": "", "credit": None},
    {"key": "stars", "type": "I", "text": "Study the stars and planets", "alt": "", "credit": None},
    {"key": "wildlife", "type": "I", "text": "Study animals in the wild", "alt": "", "credit": None},
    {"key": "water", "type": "I", "text": "Test water from a river", "alt": "", "credit": None},
    {"key": "computer-code", "type": "I", "text": "Figure out how computers work", "alt": "", "credit": None},
    {"key": "paint", "type": "A", "text": "Paint a picture", "alt": "", "credit": None},
    {"key": "band", "type": "A", "text": "Play music in a band", "alt": "", "credit": None},
    {"key": "photo", "type": "A", "text": "Take photos", "alt": "", "credit": None},
    {"key": "act", "type": "A", "text": "Act in a play", "alt": "", "credit": None},
    {"key": "clothes", "type": "A", "text": "Design clothes", "alt": "", "credit": None},
    {"key": "video", "type": "A", "text": "Make videos", "alt": "", "credit": None},
    {"key": "teach", "type": "S", "text": "Teach a class", "alt": "", "credit": None},
    {"key": "nurse", "type": "S", "text": "Take care of sick people", "alt": "", "credit": None},
    {"key": "coach", "type": "S", "text": "Coach a sports team", "alt": "", "credit": None},
    {"key": "elder", "type": "S", "text": "Help older people", "alt": "", "credit": None},
    {"key": "kids", "type": "S", "text": "Look after young kids", "alt": "", "credit": None},
    {"key": "listen", "type": "S", "text": "Help someone who is upset", "alt": "", "credit": None},
    {"key": "sell", "type": "E", "text": "Sell things to customers", "alt": "", "credit": None},
    {"key": "own", "type": "E", "text": "Run your own business", "alt": "", "credit": None},
    {"key": "lead", "type": "E", "text": "Lead a team", "alt": "", "credit": None},
    {"key": "speech", "type": "E", "text": "Give a speech", "alt": "", "credit": None},
    {"key": "vote", "type": "E", "text": "Run for office", "alt": "", "credit": None},
    {"key": "deal", "type": "E", "text": "Make a deal", "alt": "", "credit": None},
    {"key": "records", "type": "C", "text": "Keep records on a computer", "alt": "", "credit": None},
    {"key": "money", "type": "C", "text": "Count money at a bank", "alt": "", "credit": None},
    {"key": "mail", "type": "C", "text": "Sort mail", "alt": "", "credit": None},
    {"key": "shelves", "type": "C", "text": "Keep a stockroom in order", "alt": "", "credit": None},
    {"key": "desk", "type": "C", "text": "Work at a front desk", "alt": "", "credit": None},
    {"key": "check", "type": "C", "text": "Check numbers for mistakes", "alt": "", "credit": None},
]
