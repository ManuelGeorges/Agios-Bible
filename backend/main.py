from fastapi import FastAPI
from pydantic import BaseModel
from camel_tools.morphology.database import MorphologyDB
from camel_tools.morphology.analyzer import Analyzer
from alyahmor.genelex import genelex

app = FastAPI()

# CAMeL Tools setup
db = MorphologyDB.builtin_db()
analyzer = Analyzer(db)

# Alyahmor setup
yahmor = genelex()  # ← الصح هنا

class QueryRequest(BaseModel):
    text: str

@app.post("/analyze")
def analyze_text(request: QueryRequest):
    text = request.text
    tokens = text.split()

    results = []
    for token in tokens:
        analyses = analyzer.analyze(token)
        best = analyses[0] if analyses else {}

        lemma = str(best.get("lemma", ""))
        stem = str(best.get("stem", ""))
        root = str(best.get("root", ""))
        pos = str(best.get("pos", ""))
        pattern = str(best.get("pattern", ""))

        # Get derivatives using Alyahmor
        try:
            derivations = yahmor.generate_forms(lemma, word_type="verb")
            derivatives = derivations
        except Exception:
            derivatives = []

        results.append({
            "token": token,
            "lemma": lemma,
            "stem": stem,
            "root": root,
            "pos": pos,
            "pattern": pattern,
            "derivatives": derivatives
        })

    return {
        "original": text,
        "analysis": results
    }
