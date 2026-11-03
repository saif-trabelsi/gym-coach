# AI Gym Coach Backend

## Install
```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
```

## Run
```bash
uvicorn app.main:app --reload --port 8000
```

## Test
```bash
pytest
```

Note: Rep.timestamp must be Unix epoch time in milliseconds (the value of JavaScript Date.now()).

