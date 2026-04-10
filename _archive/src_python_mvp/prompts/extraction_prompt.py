import json
from src.models import FlowState

def build_extraction_prompt(flow_state: FlowState, field_name: str, user_message: str) -> tuple[dict, str]:
    prompts = {
        "intent": {
            "hint": "أنت تحدد نية المستخدم: هل يريد شراء (BUY)، بيع (SELL)، تأجير (RENT)، أو البحث عن إيجار (LEASE).",
            "schema": {"type": "object", "properties": {"intent": {"type": "string", "enum": ["BUY", "SELL", "RENT", "LEASE", "UNKNOWN"]}}}
        },
        "unit_type": {
            "hint": "أنت تحدد نوع العقار المذكور: شقة (APARTMENT)، أرض (LAND)، فيلا (VILLA)، أو تجاري (COMMERCIAL).",
            "schema": {"type": "object", "properties": {"unit_type": {"type": "string", "enum": ["APARTMENT", "LAND", "VILLA", "COMMERCIAL", "UNKNOWN"]}}}
        },
        "area": {
            "hint": "استخرج مساحة العقار كرقم فقط (بالمتر المربع عادة).",
            "schema": {"type": "object", "properties": {"area": {"type": "number"}}}
        },
        "rooms": {
            "hint": "استخرج عدد الغرف كرقم صحيح.",
            "schema": {"type": "object", "properties": {"rooms": {"type": "integer"}}}
        },
        "floor": {
            "hint": "استخرج رقم الدور.",
            "schema": {"type": "object", "properties": {"floor": {"type": "integer"}}}
        },
        "finishing": {
            "hint": "استخرج حالة التشطيب (مثال: طوب أحمر، محارة، سوبر لوكس، الترا سوبر لوكس).",
            "schema": {"type": "object", "properties": {"finishing": {"type": "string"}}}
        },
        "location": {
            "hint": "استخرج موقع أو عنوان العقار.",
            "schema": {"type": "object", "properties": {"location": {"type": "string"}}}
        },
        "price": {
            "hint": "استخرج السعر المطلوب كرقم.",
            "schema": {"type": "object", "properties": {"price": {"type": "number"}}}
        },
        "budget": {
            "hint": "استخرج الميزانية القصوى للشراء كرقم.",
            "schema": {"type": "object", "properties": {"budget": {"type": "number"}}}
        },
        "min_area": {
            "hint": "استخرج الحد الأدنى للمساحة المطلوبة كرقم (بالمتر المربع).",
            "schema": {"type": "object", "properties": {"min_area": {"type": "number"}}}
        },
        "min_rooms": {
            "hint": "استخرج أقل عدد غرف مطلوب كرقم صحيح.",
            "schema": {"type": "object", "properties": {"min_rooms": {"type": "integer"}}}
        },
        "monthly_budget": {
            "hint": "استخرج ميزانية الإيجار الشهري كرقم.",
            "schema": {"type": "object", "properties": {"monthly_budget": {"type": "number"}}}
        },
        "duration": {
            "hint": "استخرج مدة الإيجار المطلوبة (مثال: سنة، 6 شهور، شهرين).",
            "schema": {"type": "object", "properties": {"duration": {"type": "string"}}}
        },
        "total_area": {
            "hint": "استخرج المساحة الكلية للأرض كرقم (بالمتر المربع).",
            "schema": {"type": "object", "properties": {"total_area": {"type": "number"}}}
        },
        "legal_status": {
            "hint": "استخرج الوضع القانوني للأرض (مسجل، غير مسجل، عقد ابتدائي، توكيل).",
            "schema": {"type": "object", "properties": {"legal_status": {"type": "string"}}}
        },
        "zoning": {
            "hint": "استخرج تخصيص الأرض (سكني، زراعي، صناعي، تجاري).",
            "schema": {"type": "object", "properties": {"zoning": {"type": "string"}}}
        },
        "is_correct": {
            "hint": "المستخدم يؤكد على ملخص البيانات. هل أرد التأكيد (true) أم يريد التعديل (false)؟ إذا أراد التعديل، ما هو الحقل الذي يريد تعديله؟ الحقول: intent, unit_type, area, rooms, floor, finishing, location, price.",
            "schema": {
                "type": "object", 
                "properties": {
                    "is_correct": {"type": "boolean"},
                    "correction_field": {"type": "string"}
                }
            }
        }
    }
    
    if flow_state == FlowState.AWAITING_CONFIRMATION:
        config = prompts.get("is_correct")
    else:
        config = prompts.get(field_name, {
            "hint": f"Extract {field_name}.",
            "schema": {"type": "object", "properties": {field_name: {"type": "string"}}}
        })
        
    return config["schema"], f"""
{config['hint']}

User Message: "{user_message}"

Extract the value strictly conforming to the requested schema. If not found or ambiguous, return null or UNKNOWN.
"""
