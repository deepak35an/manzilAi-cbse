import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/assessment_db')
    
    # Check study_plan_templates
    rows = await conn.fetch('SELECT id, exam, duration_months, LEFT(plan, 300) as plan_preview, created_at FROM study_plan_templates ORDER BY created_at DESC')
    print(f"\n=== study_plan_templates: {len(rows)} row(s) ===")
    for r in rows:
        rid = r['id']
        exam = r['exam']
        dur = r['duration_months']
        created = r['created_at']
        preview = r['plan_preview']
        print(f"  ID: {rid}")
        print(f"  Exam: {exam}  |  Duration: {dur} months  |  Created: {created}")
        print(f"  Plan preview: {preview[:200]}")
        print("  ---")

    # Check user_study_plans
    rows2 = await conn.fetch('SELECT id, user_id, template_id, current_week, completed_weeks, created_at FROM user_study_plans ORDER BY created_at DESC')
    print(f"\n=== user_study_plans: {len(rows2)} row(s) ===")
    for r in rows2:
        uid = r['user_id']
        tid = r['template_id']
        week = r['current_week']
        created = r['created_at']
        print(f"  UserStudyPlan ID: {r['id']}")
        print(f"  User: {uid}  |  Template: {tid}  |  CurrentWeek: {week}  |  Created: {created}")
        print("  ---")

    await conn.close()

asyncio.run(main())
