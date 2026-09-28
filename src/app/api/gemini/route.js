import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { kv } from "../../../lib/kv";

export const dynamic = "force-dynamic";

/* =========================================================
   GEMINI
========================================================= */

const apiKeys = (process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

function getGenAI(index = 0) {
  if (apiKeys.length === 0) {
    throw new Error("No Gemini API keys configured on the server");
  }

  const key = apiKeys[index % apiKeys.length];

  return new GoogleGenerativeAI(key);
}

/* =========================================================
   CORS
========================================================= */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version",
  "Access-Control-Max-Age": "86400",
};

/* =========================================================
   ANALYSIS PROMPT
========================================================= */

const ANALYSIS_PROMPTS = {
  ar: (reference, verseText) => `
أنت "مساعد آجيوس الذكي"، متخصص في دراسة الكتاب المقدس.

مهمتك هنا هي تحليل الشاهد الكتابي المحدد أدناه تحليلاً دقيقاً وعميقاً وكاملاً.

==================================================
البيانات المقدمة
==================================================

المرجع الكتابي:
"${reference}"

النص الكتابي الكامل الذي اختاره المستخدم:
"${verseText}"

==================================================
قاعدة أساسية لا يمكن تجاوزها
==================================================

النص الموجود في خانة "النص الكتابي الكامل" هو النص الوحيد الذي يُسمح لك بتحليله.

ممنوع تماماً أن:
- تستبدل الآية بآية أخرى.
- تفسر آية مشابهة من نفس الإصحاح.
- تكمل الآية من ذاكرتك.
- تفترض كلمات غير موجودة في النص المرسل.
- تفسر نصف النص وتتجاهل النصف الآخر.
- تبني الإجابة على آية تتذكرها بدلاً من النص الموجود أمامك.
- تخلط بين عددين متتاليين.
- تنسب معنى إلى كلمة غير موجودة في النص.
- تتعامل مع نص محفوظ في ذاكرتك على أنه أهم من النص الذي أرسله المستخدم.

اقرأ النص الكتابي كاملاً من أول كلمة إلى آخر كلمة قبل أن تبدأ التحليل.

==================================================
التحقق الإجباري قبل التفسير
==================================================

قبل كتابة الإجابة، تحقق داخلياً من الآتي:

1. هل يوجد نص كتابي فعلي في المدخل؟
2. هل المرجع واضح؟
3. هل النص المرسل يبدو متوافقاً مع المرجع؟
4. هل النص يبدو كاملاً بالنسبة إلى الآية/العدد المحدد؟
5. هل توجد أي علامة على أن النص مقطوع أو ناقص؟
6. هل أنت على وشك استخدام آية أخرى بدلاً من النص المرسل؟

إذا وجدت تعارضاً واضحاً بين المرجع والنص، أو كان النص ناقصاً بشكل يمنع التحليل الصحيح:

لا تخمّن.
لا تحاول إكمال النص من ذاكرتك.
لا تفسر آية أخرى.

بدلاً من ذلك قل بوضوح إن هناك مشكلة في البيانات المرسلة وتحتاج إلى تصحيح النص أو المرجع.

==================================================
تغطية النص بالكامل
==================================================

يجب أن يغطي التحليل النص الكتابي من أوله إلى آخره.

قسّم النص داخلياً إلى وحدات معنوية أثناء التفكير، حتى تتأكد أنك لم تتجاهل أي جزء منه.

يجب أن تتأكد قبل إنهاء الإجابة من أنك تناولت:

- بداية الآية.
- الفكرة أو العبارة الوسطى.
- نهاية الآية.
- العلاقة بين أجزاء الآية.
- الفكرة الكاملة التي تنتج من النص كله.

لا تختصر التحليل لمجرد الوصول إلى نهاية الإجابة.

إذا كان النص يحتوي على عدة عبارات أو جمل، يجب ألا تشرح عبارة واحدة فقط وتعتبر ذلك تفسيراً للآية كلها.

==================================================
المصادر والتوثيق
==================================================

مهم جداً:

لا تدّعِ أنك راجعت كتاباً أو تفسيراً أو مصدراً لم يتم توفيره لك.

إذا كنت لا تملك النص الفعلي لمصدر معين، لا تقل:
"يقول القمص تادرس يعقوب..."
أو
"بحسب تفسير القمص أنطونيوس فكري..."

إلا إذا كان لديك أساس موثوق يسمح بهذه النسبة.

يجب التمييز بوضوح بين:

1. معنى النص الكتابي نفسه.
2. المعلومات التاريخية.
3. التحليل اللغوي.
4. التفسير الآبائي الموثق.
5. الاستنتاج الروحي الذي تبنيه أنت من النص.

عند عدم التأكد من نسبة تفسير معين إلى أب أو مفسر:
قل إن النسبة غير مؤكدة، ولا تنسبها إليه.

ممنوع اختراع مصادر أو اقتباسات أو أسماء كتب أو أرقام صفحات.

==================================================
المنهج اللاهوتي
==================================================

عند تقديم التفسير الآبائي، حافظ على الإطار القبطي الأرثوذكسي.

يمكن الاستفادة من التفسيرات المعروفة للقمص تادرس يعقوب ملطي والقمص أنطونيوس فكري فقط عندما تكون النسبة موثوقة.

لا تنسب إليهما أفكاراً لمجرد أنها تبدو متوافقة مع منهجهما.

إذا لم تتوفر لديك معلومة موثوقة عن تفسيرهما للنص، قل ذلك بوضوح ثم قدم التحليل الكتابي العام دون اختلاق نسبة.

==================================================
التحليل اللغوي
==================================================

عندما يكون ذلك مفيداً:

- اذكر الكلمة الأصلية بالعبرية للعهد القديم أو اليونانية للعهد الجديد.
- اذكر النطق التقريبي.
- اذكر الـ lemma أو الشكل الأساسي إن أمكن.
- اشرح المجال الدلالي للكلمة.
- وضح معناها في سياق الآية.

لكن لا تقع في مغالطة أن أصل الكلمة وحده يحدد معناها اللاهوتي.

لا تقل إن كلمة لها "معنى عميق سري" لمجرد اشتقاقها من جذر معين.

إذا كنت غير متأكد من معلومة لغوية، صرّح بعدم اليقين بدلاً من اختلاقها.

==================================================
السياق
==================================================

اشرح:

- السياق المباشر للآية.
- علاقتها بما قبلها وبعدها عندما يكون ذلك ضرورياً لفهم النص.
- الشخصيات والأحداث المرتبطة بها.
- الخلفية التاريخية عندما تكون معلومة موثوقة.
- الهدف من الكلام داخل السفر.

لكن:

السياق يستخدم لفهم الآية، وليس لاستبدال الآية.

==================================================
الشبهات والأسئلة
==================================================

لا تخترع شبهات لمجرد ملء القسم.

إذا كانت هناك شبهة معروفة ومرتبطة مباشرة بالنص، اذكرها واشرحها.

إذا لم توجد شبهة مهمة مرتبطة مباشرة بالنص، قل ذلك باختصار بدلاً من اختراع اعتراض وهمي.

==================================================
شكل الإجابة
==================================================

لا تستخدم Markdown.

لا تستخدم:
*
**
#
##
-
عناوين Markdown

استخدم عناوين نصية بسيطة فقط.

يجب أن تكون الإجابة شاملة وعميقة وليست مختصرة.

لا تحاول تقليل عدد الكلمات لمجرد السرعة.

لا تجعل كل قسم سطراً أو فقرة قصيرة جداً.

يجب أن تعطي مساحة كافية لتفسير النص بالكامل.

رتّب الإجابة كالتالي:

مقدمة عن النص وسياقه

شرح النص كاملاً من أوله إلى آخره

المعاني اللغوية للكلمات المحورية

الخلفية التاريخية

التفسير الكتابي والروحي

التفسير الآبائي الموثق إن توفر

العلاقة بين أجزاء الآية والفكرة الرئيسية

التطبيق الحياتي

الشبهات والأسئلة المرتبطة بالنص إن وجدت

خلاصة مركزة

وفي النهاية أضف حرفياً:

ودائماً ننصح بالرجوع لأب اعترافك.

==================================================
فحص نهائي إلزامي
==================================================

قبل إرسال الإجابة، راجعها داخلياً:

هل فسرت النص الكامل؟

هل تناولت بداية النص ووسطه ونهايته؟

هل هناك أي جملة في الإجابة تتحدث عن آية أخرى وكأنها الآية المطلوبة؟

هل أضفت كلمات غير موجودة في النص وفسرتها وكأنها موجودة؟

هل نسبت تفسيراً إلى أب أو مفسر بدون أساس موثوق؟

هل اخترعت مصدراً أو اقتباساً؟

هل خلطت بين معلومات مؤكدة واستنتاج شخصي؟

إذا كانت الإجابة على أي من هذه الأسئلة "نعم"، صحح الإجابة قبل إرسالها.
`,

  en: (reference, verseText) => `
You are "Agios Intelligent Assistant", specialized in careful Biblical study.

Your task is to provide a complete and accurate analysis of the exact Biblical passage supplied below.

REFERENCE:
"${reference}"

FULL BIBLICAL TEXT SELECTED BY THE USER:
"${verseText}"

STRICT TEXT RULE:

The supplied Biblical text is the ONLY text you are allowed to analyze.

Never:
- replace it with another verse;
- analyze a similar verse instead;
- complete missing words from memory;
- interpret only part of the supplied text;
- confuse it with another verse from the same chapter;
- treat remembered Biblical text as more authoritative than the supplied text.

Read the entire supplied text from beginning to end before analyzing it.

MANDATORY VALIDATION:

Before answering, internally verify:

1. The reference is present.
2. The Biblical text is present.
3. The text appears compatible with the reference.
4. The supplied text does not appear obviously truncated.
5. You are analyzing the complete supplied text.
6. You are not accidentally replacing it with another verse.

If there is a clear mismatch or insufficient text, do NOT guess.
Do NOT complete the verse from memory.
State clearly that the supplied reference and text need correction.

COMPLETE COVERAGE:

Your analysis must cover the beginning, middle, and end of the supplied text.

Break the verse into meaningful units internally and make sure every significant phrase is addressed.

SOURCES:

Never claim that you consulted a source that was not actually provided or made available to you.

Do not fabricate:
- quotations;
- books;
- page numbers;
- patristic statements;
- historical sources;
- citations.

Clearly distinguish between:
1. Biblical text analysis.
2. Historical information.
3. Linguistic analysis.
4. Documented patristic interpretation.
5. Your own synthesis.

If you are not certain that a specific interpretation belongs to Fr. Tadros Malaty or Fr. Antonios Fekry, do not attribute it to them.

THEOLOGICAL FRAMEWORK:

Keep the interpretation within a Coptic Orthodox framework.

LINGUISTIC ANALYSIS:

When useful, provide the original Hebrew or Greek term, transliteration, lemma/basic form, and semantic range.

Do not commit etymological fallacies or invent "hidden meanings".

HISTORICAL CONTEXT:

Explain reliable historical context when relevant.

Context may clarify the passage but must never replace the supplied passage.

OBJECTIONS:

Only discuss objections genuinely relevant to this exact text.
Do not invent objections merely to make the answer longer.

RESPONSE QUALITY:

Provide a substantial, deep answer.
Do not unnecessarily shorten the response.

Use plain-text section headings.
Do not use Markdown formatting.

Use these sections:

Introduction and context

Complete explanation of the passage

Key linguistic meanings

Historical background

Biblical and spiritual interpretation

Documented patristic interpretation, if reliably known

Relationship between the parts of the passage

Life application

Relevant objections and questions

Conclusion

End with:

We always encourage you to refer back to your father of confession.

FINAL INTERNAL CHECK:

Before sending the answer, verify that:
- the whole supplied text was analyzed;
- beginning, middle, and end were covered;
- no other verse was substituted;
- no missing text was invented;
- no unsupported attribution was made;
- no source was fabricated;
- facts and interpretation are clearly distinguished.
`,
};

/* =========================================================
   OTHER PROMPTS
========================================================= */

const PROMPTS = {
  analysis: ANALYSIS_PROMPTS,

  derivatives: {
    ar: (word) => `
أنت مساعد آجيوس.

حلل الكلمة التالية تحليلاً لغوياً دقيقاً:

"${word}"

أرجع JSON صالحاً فقط.

يجب التفريق بين:
- الجذر.
- المشتقات الصحيحة.
- الكلمات المرتبطة بالمعنى فقط.
- الكلمات التي ليست مشتقة فعلياً من الجذر.

لا تخترع مشتقات.
إذا لم تكن متأكداً من كلمة، لا تضعها ضمن المشتقات المؤكدة.

الشكل:
{
  "root": "",
  "derivatives": [],
  "relatedWords": [],
  "confidence": ""
}
`,

    en: (word) => `
Analyze the following word linguistically:

"${word}"

Return valid JSON only.

Do not invent derivatives.
Clearly distinguish actual derivatives from merely related words.

{
  "root": "",
  "derivatives": [],
  "relatedWords": [],
  "confidence": ""
}
`,
  },

  semantic: {
    ar: (concept, context = "") => `
أنت مساعد آجيوس.

ابحث من معرفتك الكتابية عن أكثر الآيات ارتباطاً بالمفهوم التالي:

"${concept}"

السياق الإضافي:
"${context}"

أرجع JSON صالحاً فقط.

لا تخترع مراجع كتابية.
إذا لم تكن متأكداً من المرجع، لا تستخدمه.

{
  "results": [
    {
      "title": "",
      "book": "",
      "chapter": 0,
      "verses": "",
      "reason": ""
    }
  ]
}
`,

    en: (concept, context = "") => `
Find the most relevant Biblical passages for:

"${concept}"

Additional context:
"${context}"

Return valid JSON only.

Never invent Biblical references.

{
  "results": [
    {
      "title": "",
      "book": "",
      "chapter": 0,
      "verses": "",
      "reason": ""
    }
  ]
}
`,
  },

  studyPlan: {
    ar: (payload) => `
أنت مساعد آجيوس لإنشاء خطة قراءة كتابية.

أنشئ خطة بناءً على البيانات التالية:

${JSON.stringify(payload, null, 2)}

أرجع JSON صالحاً فقط.

لا تخترع أسماء أسفار أو أرقام إصحاحات.
يجب أن تكون الخطة منطقية ومتدرجة وغير مكررة قدر الإمكان.

{
  "title": "",
  "description": "",
  "days": [
    {
      "day": 1,
      "title": "",
      "book": "",
      "chapter": 0,
      "reason": ""
    }
  ]
}
`,

    en: (payload) => `
Create a structured Biblical reading plan using:

${JSON.stringify(payload, null, 2)}

Return valid JSON only.

Do not invent books or chapter numbers.
Avoid unnecessary repetition.

{
  "title": "",
  "description": "",
  "days": [
    {
      "day": 1,
      "title": "",
      "book": "",
      "chapter": 0,
      "reason": ""
    }
  ]
}
`,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function getLanguage(lang) {
  if (lang === "en") return "en";
  return "ar";
}

function normalizeAnalysisPayload(payload = {}) {
  /*
    IMPORTANT:

    The frontend MUST send the COMPLETE selected verse.

    Supported:
      payload.reference
      payload.targetText
      payload.verseText

    We deliberately do not try to reconstruct a missing verse here.
  */

  const reference =
    payload.reference ||
    payload.targetText ||
    payload.ref ||
    "";

  const verseText =
    payload.verseText ||
    payload.fullVerseText ||
    payload.text ||
    "";

  return {
    reference: String(reference).trim(),
    verseText: String(verseText).trim(),
  };
}

function validateAnalysisInput(reference, verseText) {
  if (!reference) {
    return {
      valid: false,
      error: "Missing Biblical reference.",
    };
  }

  if (!verseText) {
    return {
      valid: false,
      error:
        "Missing complete Biblical verse text. The selected verse must be sent in full.",
    };
  }

  /*
    Very short text is suspicious.

    We do NOT reject a genuinely short verse automatically,
    because some Biblical verses are naturally short.
    This is only a basic protection against accidentally
    sending an empty/partial UI string.
  */

  if (verseText.length < 3) {
    return {
      valid: false,
      error: "The supplied Biblical text is too short.",
    };
  }

  return {
    valid: true,
  };
}

/* =========================================================
   OPTIONS
========================================================= */

function getGenerationConfig(task) {
  if (task === "analysis") {
    return {
      maxOutputTokens: 8192,
      temperature: 0.15,
    };
  }

  if (task === "studyPlan") {
    return {
      maxOutputTokens: 4096,
      temperature: 0.65,
    };
  }

  if (task === "derivatives") {
    return {
      maxOutputTokens: 4096,
      temperature: 0.1,
    };
  }

  if (task === "semantic") {
    return {
      maxOutputTokens: 4096,
      temperature: 0.1,
    };
  }

  return {
    maxOutputTokens: 4096,
    temperature: 0.2,
  };
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    /* -------------------------------------------------------
       Static export
    ------------------------------------------------------- */

    if (process.env.NEXT_PUBLIC_EXPORT === "true") {
      return NextResponse.json(
        { static: true },
        { status: 200, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------------
       Parse request
    ------------------------------------------------------- */

    const body = await request.json();

    const {
      task,
      lang = "ar",
      payload = {},
      attempt = 0,
      cacheKey,
    } = body;

    const language = getLanguage(lang);

    /* -------------------------------------------------------
       Cache
    ------------------------------------------------------- */

    if (cacheKey) {
      try {
        const cached = await kv.get(cacheKey);

        if (cached) {
          return NextResponse.json(
            {
              cached: true,
              data: cached,
            },
            {
              status: 200,
              headers: corsHeaders,
            }
          );
        }
      } catch (cacheError) {
        console.error("KV GET error:", cacheError);
      }
    }

    /* -------------------------------------------------------
       ANALYSIS
    ------------------------------------------------------- */

    if (task === "analysis") {
      const {
        reference,
        verseText,
      } = normalizeAnalysisPayload(payload);

      const validation = validateAnalysisInput(
        reference,
        verseText
      );

      if (!validation.valid) {
        return NextResponse.json(
          {
            error: validation.error,
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      /*
        This is the critical part.

        Gemini receives:
        1. the exact reference
        2. the complete verse text selected by the user

        The model is explicitly forbidden from reconstructing
        or substituting the verse.
      */

      const prompt = PROMPTS.analysis[language](
        reference,
        verseText
      );

      const genAI = getGenAI(Number(attempt) || 0);

      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
      });

      const generationConfig = getGenerationConfig("analysis");

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();

      if (!text || !text.trim()) {
        throw new Error(
          "Gemini returned an empty analysis response."
        );
      }

      /* -----------------------------------------------------
         Cache analysis
      ----------------------------------------------------- */

      if (cacheKey) {
        try {
          await kv.set(cacheKey, text);
        } catch (cacheError) {
          console.error("KV SET error:", cacheError);
        }
      }

      return NextResponse.json(
        {
          data: text,
          cached: false,

          /*
            Useful for debugging and ensuring the server actually
            received the intended passage.
          */
          reference,
          verseText,
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    /* -------------------------------------------------------
       DERIVATIVES
    ------------------------------------------------------- */

    if (task === "derivatives") {
      const word =
        payload.word ||
        payload.text ||
        "";

      if (!word.trim()) {
        return NextResponse.json(
          {
            error: "Missing word.",
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const promptFactory =
        PROMPTS.derivatives[language] ||
        PROMPTS.derivatives.ar;

      const prompt = promptFactory(word);

      const genAI = getGenAI(Number(attempt) || 0);

      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: getGenerationConfig("derivatives"),
      });

      const text = result.response.text();

      if (cacheKey) {
        try {
          await kv.set(cacheKey, text);
        } catch (cacheError) {
          console.error("KV SET error:", cacheError);
        }
      }

      return NextResponse.json(
        {
          data: text,
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    /* -------------------------------------------------------
       SEMANTIC
    ------------------------------------------------------- */

    if (task === "semantic") {
      const concept =
        payload.concept ||
        payload.query ||
        "";

      const context =
        payload.context ||
        "";

      if (!concept.trim()) {
        return NextResponse.json(
          {
            error: "Missing semantic concept.",
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const promptFactory =
        PROMPTS.semantic[language] ||
        PROMPTS.semantic.ar;

      const prompt = promptFactory(
        concept,
        context
      );

      const genAI = getGenAI(Number(attempt) || 0);

      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: getGenerationConfig("semantic"),
      });

      const text = result.response.text();

      if (cacheKey) {
        try {
          await kv.set(cacheKey, text);
        } catch (cacheError) {
          console.error("KV SET error:", cacheError);
        }
      }

      return NextResponse.json(
        {
          data: text,
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    /* -------------------------------------------------------
       STUDY PLAN
    ------------------------------------------------------- */

    if (task === "studyPlan") {
      const promptFactory =
        PROMPTS.studyPlan[language] ||
        PROMPTS.studyPlan.ar;

      const prompt = promptFactory(payload);

      const genAI = getGenAI(Number(attempt) || 0);

      const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: getGenerationConfig("studyPlan"),
      });

      const text = result.response.text();

      if (cacheKey) {
        try {
          await kv.set(cacheKey, text);
        } catch (cacheError) {
          console.error("KV SET error:", cacheError);
        }
      }

      return NextResponse.json(
        {
          data: text,
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    /* -------------------------------------------------------
       UNKNOWN TASK
    ------------------------------------------------------- */

    return NextResponse.json(
      {
        error: `Unknown task: ${task}`,
      },
      {
        status: 400,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Gemini API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

/* =========================================================
   OPTIONS
========================================================= */

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/* =========================================================
   GET
========================================================= */

export async function GET() {
  return NextResponse.json(
    {
      status: "active",
      service: "Agios Gemini API",
    },
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}