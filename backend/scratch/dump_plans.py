import asyncio
import asyncpg
import json

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/assessment_db')
    rows = await conn.fetch(
        "SELECT id, exam, duration_months, plan, created_at FROM study_plan_templates ORDER BY duration_months"
    )
    print(f"Found {len(rows)} templates\n")
    for r in rows:
        print(f"=== {r['exam']} | {r['duration_months']} months | ID: {r['id']} ===")
        # print full plan so we can capture it
        print(r['plan'])
        print("\n" + "="*80 + "\n")
    await conn.close()

asyncio.run(main())
