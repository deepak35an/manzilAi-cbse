import asyncio
import sys
import os
import json

# Add backend directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.quiz import StudyPlanTemplate, UserStudyPlan
from sqlalchemy import select

async def inspect():
    async with AsyncSessionLocal() as db:
        # 1. StudyPlanTemplates
        t_stmt = select(StudyPlanTemplate)
        t_res = await db.execute(t_stmt)
        templates = t_res.scalars().all()
        
        print("="*80)
        print("TABLE: StudyPlanTemplates")
        print("="*80)
        for t in templates:
            print(f"\nID: {t.id}")
            print(f"Exam: {t.exam}")
            print(f"Duration: {t.duration_months} months")
            print("-" * 40)
            try:
                # Show only basic info and the first week to keep output small
                plan_data = json.loads(t.plan)
                roadmap = plan_data.get("roadmap", [])
                
                summary = {
                    "duration_weeks": plan_data.get("duration_weeks"),
                    "total_weeks_in_roadmap": len(roadmap),
                    "first_week_preview": roadmap[0] if roadmap else "EMPTY"
                }
                print(json.dumps(summary, indent=2))
            except:
                print(t.plan[:200] + "...")
            print("=" * 80)
            
        # 2. UserStudyPlans
        u_stmt = select(UserStudyPlan)
        u_res = await db.execute(u_stmt)
        user_plans = u_res.scalars().all()
        
        print("\n" + "="*80)
        print("TABLE: UserStudyPlans")
        print("="*80)
        for up in user_plans:
            print(f"\nUser ID: {up.user_id}")
            print(f"Template ID: {up.template_id}")
            print(f"Current Week: {up.current_week}")
            print(f"Completed Weeks: {up.completed_weeks}")
            print("-" * 40)

if __name__ == "__main__":
    asyncio.run(inspect())
