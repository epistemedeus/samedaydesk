from fastapi import FastAPI

app = FastAPI()

@app.get("/terms")
def terms():
    return {"path": "/terms"}
