🚀 SEMSAR AI — FULL BACKEND PROMPT (DATA COLLECTION + NEGOTIATION ENGINE)

You are a senior backend engineer and system architect متخصص في NestJS + Prisma + scalable SaaS systems.

Your task is to build a production-ready backend for a real estate AI platform called "Semsar AI".

The system consists of TWO MAIN PHASES:

━━━━━━━━━━━━━━━━━━━━━━━
🧩 PHASE 1: GUIDED DATA COLLECTION ENGINE (CHAT-BASED)
━━━━━━━━━━━━━━━━━━━━━━━

🎯 الهدف:
جمع بيانات العقار من المستخدم عن طريق Chat UI ولكن باستخدام State Machine (NOT free chat).

⚠️ قواعد مهمة:

* المستخدم لا يمكنه تخطي أي خطوة
* كل خطوة سؤال واحد فقط
* الإجابات تكون structured (multi-choice / input)
* يتم حفظ البيانات تدريجيًا في draft
* بعد الانتهاء يتم عرض نموذج مراجعة قابل للتعديل
* المستخدم يمكنه رفع صور وفيديو
* عند التأكيد يتم حفظ البيانات في properties table

---

🗂️ DATABASE MODELS (PRISMA)

1. property_drafts

* id
* user_id
* current_step (enum)
* data (JSON)
* is_completed (boolean)
* created_at
* updated_at

2. properties

* id
* user_id
* title
* description
* price
* type (sale, rent)
* property_type (apartment, villa, shop, office)
* bedrooms
* bathrooms
* area_m2
* governorate
* city
* district
* zone
* street
* nearest_landmark
* latitude
* longitude
* created_at

3. property_media

* id
* draft_id (nullable)
* property_id (nullable)
* url
* type (image, video)
* created_at

---

🧠 STATE MACHINE

enum OnboardingStep {
PROPERTY_TYPE,
LISTING_TYPE,
LOCATION,
DETAILS,
PRICE,
MEDIA,
REVIEW,
COMPLETED
}

---

🧠 QUESTIONS (Egyptian Arabic polite)

PROPERTY_TYPE:
"حضرتك نوع العقار ايه؟"
options: ["شقة", "فيلا", "محل", "مكتب"]

LISTING_TYPE:
"عايز تبيع ولا تأجر؟"
options: ["بيع", "إيجار"]

LOCATION:
"حدد الموقع من فضلك"
fields:

* governorate
* city
* district
* zone
* nearest_landmark

DETAILS:

* bedrooms
* bathrooms
* area

PRICE:
"السعر المتوقع كام؟"

MEDIA:
"تحب تضيف صور أو فيديوهات؟"

---

⚙️ CORE LOGIC

* startOrResumeDraft(userId)
* getCurrentQuestion(userId)
* submitAnswer(userId, step, answer)
* validate step order strictly
* store data in JSON
* move to next step

---

🧾 REVIEW STEP

Return editable form:

* كل field قابل للتعديل
* المستخدم يقدر يرجع لأي خطوة

---

📸 MEDIA

* Upload linked to draft_id
* After submit → attach to property_id

---

✅ FINAL SUBMIT

* validate all required fields
* create property
* attach media
* mark draft completed

---

━━━━━━━━━━━━━━━━━━━━━━━
🤖 PHASE 2: NEGOTIATION ENGINE (CONTROLLED, NOT CHAT)
━━━━━━━━━━━━━━━━━━━━━━━

🎯 الهدف:
تنفيذ عملية تفاوض بين buyer و seller باستخدام algorithm controlled system

⚠️ قواعد:

* لا يوجد chat مباشر بين المستخدمين
* AI لا يقرر — فقط يصيغ الرسائل
* كل القرارات من negotiation engine

---

🗂️ DATABASE

negotiations

* id
* property_id
* buyer_id
* seller_id
* min_price (seller)
* max_price (buyer)
* current_offer
* round_number
* status (active, agreed, failed)

offers

* id
* negotiation_id
* amount
* round
* created_by (AI)
* created_at

---

🧠 NEGOTIATION FLOW

1. عرض السعر الأساسي (listing price)
2. buyer يحدد max budget
3. seller يحدد min acceptable price
4. يبدأ التفاوض

---

🧠 ALGORITHM

function nextStep():

* if current_offer >= min_price → ACCEPT
* if round > max_rounds → FAIL
* else → COUNTER

---

🎯 COUNTER FORMULA

gap = max_price - min_price

concession:

* round 1-2 → 5%
* round 3-5 → 10%
* round 6+ → 15%

counter_offer = current_offer + (gap * concession)

---

🎯 FIRST OFFER (ANCHOR)

initial_offer = max_price * 0.85

---

🎯 MAX ROUNDS

max_rounds = 6

---

🤖 AI MESSAGE (Egyptian Arabic)

* Counter:
  "بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟"

* Accept:
  "تم الاتفاق على {price} جنيه. برجاء استكمال الدفع."

* Reject:
  "نأسف، لم نتمكن من الوصول لاتفاق مناسب."

---

🔒 USER ACTIONS

User cannot type freely.

Allowed actions:

* accept
* reject
* request_counter (optional bounded)

---

💰 DEAL CREATION

If accepted:

* create deal
* trigger payment flow

If failed:

* mark negotiation failed

---

📡 API ENDPOINTS

PHASE 1:
POST /onboarding/start
GET /onboarding/question
POST /onboarding/answer
GET /onboarding/review
POST /onboarding/submit
POST /onboarding/upload-media

PHASE 2:
POST /negotiation/start
POST /negotiation/next-step
GET /negotiation/status

---

📦 EXPECTED OUTPUT

* Prisma schema
* NestJS modules
* Services (onboarding + negotiation)
* Controllers
* DTOs
* Validation
* Example responses

---

🎯 FINAL GOAL

Build a system where:

* Data collection is structured and controlled
* Negotiation is algorithm-driven
* AI is only a communication layer
* Backend enforces all logic
