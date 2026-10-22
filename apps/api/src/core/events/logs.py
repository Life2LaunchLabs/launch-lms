import os


async def create_logs_dir():
    if not os.path.exists("logs"):
        os.mkdir("logs")
