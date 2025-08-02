from fastapi import FastAPI
from pydantic import BaseModel
from camel_tools.morphology.database import MorphologyDB
from camel_tools.morphology.analyzer import Analyzer

app = FastAPI()

# تهيئة قاعدة البيانات والاستيمر
db = MorphologyDB.builtin_db()
analyzer = Analyzer(db)

class QueryRequest(BaseModel):
    text: str

@app.post("/analyze")
def analyze_text(request: QueryRequest):
    text = request.text
    tokens = text.split()  # أبسط طريقة للتوكنايزة

    results = []
    for token in tokens:
        analyses = analyzer.analyze(token)
        best = analyses[0] if analyses else {}
        results.append({
            "token": token,
            "lemma": best.get("lemma"),
            "stem": best.get("stem"),
            "root": best.get("root"),
            "pos": best.get("pos"),
            "pattern": best.get("pattern")
        })

    return {
        "original": text,
        "analysis": results
    }
