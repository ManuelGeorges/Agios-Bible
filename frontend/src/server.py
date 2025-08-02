# app.py (backend)

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from smart_search import smart_search
import json

app = Flask(__name__)
CORS(app)

@app.route("/api/search", methods=["GET"])
def search():
    q = request.args.get("q")
    lang = request.args.get("lang", "ar")
    stem = request.args.get("stem", "false").lower() == "true"

    if not q:
        return jsonify([])

    try:
        # لو فيه دالة للجذور
        if stem:
            from stemmer import stem_text  # لو دي موجودة عندك
            q = stem_text(q, lang)

        results = smart_search(q, lang_code=lang, use_stemming=stem)
        json_data = json.dumps(results, ensure_ascii=False)
        return Response(json_data, content_type="application/json; charset=utf-8")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5000, debug=True)
