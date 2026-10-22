import asyncio
from app.database import AsyncSessionLocal
from app.models.quiz import UserStudyPlan
from sqlalchemy import select

async def check_user_plans():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(UserStudyPlan))
        plans = r.scalars().all()
        if not plans:
            print("No user plans found.")
            return
            
        for p in plans:
            print("-"*30)
            print(f"USER ID: {p.user_id}")
            print(f"TEMPLATE ID: {p.template_id}")
            print(f"COMPLETED WEEKS: {p.completed_weeks}")
            print(f"CURRENT WEEK: {p.current_week}")
            print("-"*30)

if __name__ == "__main__":
    asyncio.run(check_user_plans())
