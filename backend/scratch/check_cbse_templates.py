import asyncio
import os
import asyncpg

async def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)
    rows = await conn.fetch(
        """
        SELECT exam, duration_months, left(plan, 100) AS preview
        FROM study_plan_templates
        WHERE exam ILIKE '%CBSE%' OR duration_months IS NULL
        ORDER BY exam, duration_months NULLS FIRST
        """
    )
    print(f"matching templates: {len(rows)}")
    for r in rows:
        print(f"  exam={r['exam']!r} duration={r['duration_months']} preview={r['preview']!r}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
