import json
import re
from nltk.stem import SnowballStemmer, PorterStemmer
from langdetect import detect
from pyarabic.araby import strip_tashkeel, normalize_hamza, strip_tatweel
import nltk

nltk.download('punkt')

# 🧠 Normalize the text
def normalize_text(text, lang):
    text = text.lower()
    if lang == "ar":
        text = strip_tashkeel(text)
        text = strip_tatweel(text)
        text = normalize_hamza(text)
    return re.sub(r'[^\w\s]', '', text)

# 🦾 Stem the word
def stem_word(word, lang):
    try:
        if lang == "ar":
            return SnowballStemmer("arabic").stem(word)
        elif lang == "en":
            return PorterStemmer().stem(word)
        elif lang == "fr":
            return SnowballStemmer("french").stem(word)
        else:
            return word
    except:
        return word

# 📖 Load Bible data
def load_bible_texts(lang_code):
    file_map = {
        "ar": "src/app/data/bibles/ar_svd_converted.json",
        "en": "src/data/bibles/en_bbe.json",
        "fr": "src/data/bibles/fe_apee.json"
    }

    path = file_map.get(lang_code)
    if not path:
        print("⚠️ لغة غير مدعومة:", lang_code)
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    except FileNotFoundError:
        print(f"❌ الملف غير موجود: {path}")
        return []

# 🔍 Smart Search Logic
def smart_search(query, lang_code, use_stemming=False):
    normalized_query = normalize_text(query, lang_code)
    query_tokens = normalized_query.split()

    stemmed_query_tokens = [stem_word(w, lang_code) for w in query_tokens] if use_stemming else query_tokens

    results = []
    verses = load_bible_texts(lang_code)

    for verse in verses:
        verse_text = verse.get("verseText", "")
        norm_verse = normalize_text(verse_text, lang_code)
        verse_words = norm_verse.split()

        check_words = [stem_word(w, lang_code) for w in verse_words] if use_stemming else verse_words

        if all(stem in check_words for stem in stemmed_query_tokens):
            results.append(verse)

    return results

# 🧪 Local test (CLI)
if __name__ == "__main__":
    q = input("🔍 اكتب كلمة للبحث (بأي لغة): ")
    lang = detect(q)
    lang_code = "ar" if lang == "ar" else "en" if lang == "en" else "fr"
    matches = smart_search(q, lang_code, use_stemming=True)
    print(f"\n📜 النتائج ({len(matches)}):\n")
    for res in matches:
        print(f"- {res.get('book', '?')} {res.get('chapter', '?')}:{res.get('verseNumber', '?')} - {res.get('verseText', '')}")
