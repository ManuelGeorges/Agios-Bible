import json
import os

# 📍 ضع هنا مسار الملف الأصلي
ORIGINAL_FILE = "src/data/bibles/ar_svd.json"

# 📍 المسار اللي هيطلع فيه الملف المحول
CONVERTED_FILE = "src/app/data/bibles/ar_svd_converted.json"

# 🛠️ عملية التحويل
def convert_arabic_bible(original_path, converted_path):
    with open(original_path, "r", encoding="utf-8-sig") as f:
        raw_data = json.load(f)

    converted = []
    for book_data in raw_data:
        book_name = book_data["abbrev"] if "abbrev" in book_data else "unknown"
        chapters = book_data.get("chapters", [])
        for chapter_num, verses in enumerate(chapters, start=1):
            for verse_num, verse_text in enumerate(verses, start=1):
                converted.append({
                    "book": book_name,
                    "chapter": chapter_num,
                    "verseNumber": verse_num,
                    "verseText": verse_text.strip()
                })

    # تأكد من وجود المجلد قبل الحفظ
    os.makedirs(os.path.dirname(converted_path), exist_ok=True)

    with open(converted_path, "w", encoding="utf-8") as f:
        json.dump(converted, f, ensure_ascii=False, indent=2)

    print(f"✅ تم التحويل بنجاح. عدد الآيات: {len(converted)}")


# ✅ نفذ السكريبت
if __name__ == "__main__":
    convert_arabic_bible(ORIGINAL_FILE, CONVERTED_FILE)
