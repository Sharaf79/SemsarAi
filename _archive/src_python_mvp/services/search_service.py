from typing import List
from src.models import Listing, Unit
from src.services.supabase_service import SupabaseService

def search_units_for_buyer(listing: Listing, supabase_service: SupabaseService) -> List[Unit]:
    # Placeholder for foundation: queries the units table
    # Buy listings look for SELL intents.
    query = supabase_service.client.table("units").select("*").eq("is_active", True).eq("intent", "SELL").eq("unit_type", listing.unit_type.value)
    
    if listing.location:
        query = query.ilike("location", f"%{listing.location}%")
        
    if listing.price: # representing budget
        query = query.lte("price", listing.price)
        
    response = query.order("created_at", desc=True).limit(5).execute()
    return [Unit(**data) for data in response.data]

def format_search_results(units: List[Unit]) -> str:
    if not units:
        return "مفيش حاجة مطابقة لطلبك دلوقتي، بس سجلنا طلبك وهنبلغك أول ما يظهر حاجة مناسبة."
        
    results = ["لقينا العروض دي اللي ممكن تناسبك:"]
    for i, u in enumerate(units, 1):
        line = f"{i}. {u.unit_type.value} في {u.location or 'مكان غير محدد'}"
        if u.price:
            line += f" بسعر {u.price} جنيه"
        if u.specs.get("area"):
            line += f"، بمساحة {u.specs['area']} متر"
        results.append(line)
        
    return "\n".join(results)
