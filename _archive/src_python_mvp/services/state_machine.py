from typing import Tuple, Optional, Dict, Any
from src.models import Conversation, FlowState, Intent, UnitType, Listing, ListingStatus

FIELD_SEQUENCES = {
    (Intent.SELL, UnitType.APARTMENT): ["area", "rooms", "floor", "finishing", "location", "price"],
    (Intent.SELL, UnitType.LAND): ["total_area", "legal_status", "zoning", "location", "price"],
    (Intent.BUY, UnitType.APARTMENT): ["location", "budget", "min_area", "min_rooms"],
    (Intent.BUY, UnitType.LAND): ["location", "budget", "min_area"],
    (Intent.RENT, UnitType.APARTMENT): ["location", "monthly_budget", "duration", "rooms"],
    (Intent.LEASE, UnitType.APARTMENT): ["location", "monthly_budget", "duration", "rooms"],
}

def get_next_field(intent: Intent, unit_type: UnitType, current_field: Optional[str]) -> Optional[str]:
    sequence = FIELD_SEQUENCES.get((intent, unit_type), [])
    if not sequence:
        return None
        
    if current_field is None:
        return sequence[0]
        
    try:
        current_idx = sequence.index(current_field)
        if current_idx + 1 < len(sequence):
            return sequence[current_idx + 1]
    except ValueError:
        return sequence[0]
        
    return None

def generate_question(field: str) -> str:
    questions = {
        "intent": "عايز تبيع، تشتري، ولا تأجر؟",
        "unit_type": "إيه نوع العقار؟ (شقة، أرض، فيلا، ولا تجاري؟)",
        "area": "المساحة كام متر؟",
        "rooms": "عدد الغرف كام؟",
        "floor": "الدور الكام؟",
        "finishing": "مستوى التشطيب أيه؟ (طوب أحمر، محارة، سوبر لوكس، إلخ)",
        "location": "المكان فين بالظبط؟",
        "price": "السعر المطلوب كام؟",
        "total_area": "المساحة الكلية كام؟",
        "legal_status": "الوضع القانوني ايه؟ (مسجل ولا لأ؟)",
        "zoning": "التخصيص إيه؟ (سكني، زراعي، صناعي؟)",
        "budget": "الميزانية في حدود كام؟",
        "min_area": "أقل مساحة بتدور عليها كام؟",
        "min_rooms": "أقل عدد غرف كام؟",
        "monthly_budget": "ميزانية الإيجار في الشهر كام؟",
        "duration": "هتأجر لمدة أد إيه؟",
    }
    return questions.get(field, f"ممكن تدينا تفاصيل عن الـ {field}؟")

def format_summary_card(listing: Listing) -> str:
    specs = listing.specs or {}
    
    m = {
        "area": "المساحة",
        "rooms": "عدد الغرف",
        "floor": "الدور",
        "finishing": "التشطيب",
        "location": "الموقع",
        "price": "السعر (إجمالي)",
        "total_area": "المساحة الكلية",
        "legal_status": "الوضع القانوني",
        "zoning": "التخصيص",
        "budget": "الميزانية القصوى",
        "min_area": "الحد الأدنى للمساحة",
        "min_rooms": "الحد الأدنى للغرف",
        "monthly_budget": "الإيجار الشهري",
        "duration": "المدة"
    }
    
    summary = ["ملخص البيانات اللي جمعناها:"]
    summary.append(f"النية: {listing.intent.value if listing.intent else 'معلق'}")
    summary.append(f"النوع: {listing.unit_type.value if listing.unit_type else 'معلق'}")
    
    for f_key in FIELD_SEQUENCES.get((listing.intent, listing.unit_type), []):
        val = specs.get(f_key, getattr(listing, f_key, None) if hasattr(listing, f_key) else None)
        if val is None or val == "Pending":
            val = "معلق"
        summary.append(f"- {m.get(f_key, f_key)}: {val}")
        
    summary.append("\nده صح ولا عايز تغير حاجة؟")
    return "\n".join(summary)

def generate_welcome_back(question: str) -> str:
    return f"أهلاً تاني! كنا وقفنا عند سؤال:\n{question}"

def transition(conversation: Conversation, listing: Listing, user_input: str, extracted_data: Dict[str, Any]) -> Tuple[Conversation, Listing, str]:
    if conversation.flow_state == FlowState.AWAITING_INTENT:
        intent_val = extracted_data.get("intent")
        if intent_val and intent_val != "UNKNOWN":
            try:
                intent_enum = Intent(intent_val)
                conversation.intent = intent_enum
                listing.intent = intent_enum
                conversation.flow_state = FlowState.AWAITING_UNIT_TYPE
                return conversation, listing, generate_question("unit_type")
            except ValueError:
                pass
        return conversation, listing, generate_question("intent")

    elif conversation.flow_state == FlowState.AWAITING_UNIT_TYPE:
        ut_val = extracted_data.get("unit_type")
        if ut_val and ut_val != "UNKNOWN":
            try:
                ut_enum = UnitType(ut_val)
                listing.unit_type = ut_enum
                
                next_field = get_next_field(conversation.intent, listing.unit_type, None)
                if next_field:
                    conversation.flow_state = FlowState.AWAITING_SPECS
                    conversation.current_field = next_field
                    return conversation, listing, generate_question(next_field)
                else:
                    return conversation, listing, "عفواً، النوع ده لسه مش مدعوم بالكامل."
            except ValueError:
                pass
        return conversation, listing, generate_question("unit_type")

    elif conversation.flow_state == FlowState.AWAITING_SPECS:
        curr = conversation.current_field
        val = extracted_data.get(curr)
        if val is not None:
            if curr == "location":
                listing.location = str(val)
            elif curr in ["price", "budget", "monthly_budget"]:
                try:
                    listing.price = float(val)
                except ValueError:
                    pass
            else:
                if not listing.specs:
                    listing.specs = {}
                listing.specs[curr] = val

            next_field = get_next_field(conversation.intent, listing.unit_type, curr)
            if next_field:
                conversation.current_field = next_field
                return conversation, listing, generate_question(next_field)
            else:
                conversation.current_field = None
                
                # BUY skips AWAITING_MEDIA
                if conversation.intent == Intent.BUY:
                    conversation.flow_state = FlowState.AWAITING_CONFIRMATION
                    return conversation, listing, format_summary_card(listing)
                else:
                    conversation.flow_state = FlowState.AWAITING_MEDIA
                    return conversation, listing, "الصور بتبيع الشقة — ابعتلي صور أو فيديو لو عندك. أو قول 'مش دلوقتي'."

        return conversation, listing, generate_question(curr or "intent")
        
    elif conversation.flow_state == FlowState.AWAITING_MEDIA:
        if "مش دلوقتي" in user_input or "لا" in user_input or extracted_data.get("has_media"):
            conversation.flow_state = FlowState.AWAITING_CONFIRMATION
            return conversation, listing, format_summary_card(listing)
        
        conversation.flow_state = FlowState.AWAITING_CONFIRMATION
        return conversation, listing, format_summary_card(listing)

    elif conversation.flow_state == FlowState.AWAITING_CONFIRMATION:
        is_correct = extracted_data.get("is_correct")
        correction_field = extracted_data.get("correction_field")
        
        if is_correct:
            conversation.flow_state = FlowState.CONFIRMED
            listing.status = ListingStatus.CONFIRMED
            return conversation, listing, "تمام، تم تأكيد البيانات بنجاح!"
        elif correction_field:
            conversation.flow_state = FlowState.AWAITING_SPECS
            conversation.current_field = correction_field
            return conversation, listing, generate_question(correction_field)
            
        return conversation, listing, "ده صح ولا عايز تغير حاجة؟ (قول 'صح' أو 'عايز أغير ...')"

    return conversation, listing, "عفواً، حصلت مشكلة، هنعيد من الأول؟"
