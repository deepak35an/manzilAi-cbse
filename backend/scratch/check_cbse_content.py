import asyncio
import os
import asyncpg


async def main():
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)

    rows = await conn.fetch(
        """
        SELECT id::text, subfolder, title, file_path, visibility::text AS visibility
        FROM content_registry
        WHERE subfolder ILIKE '%CBSE%' OR file_path ILIKE '%CBSE%' OR title ILIKE '%Social%'
        ORDER BY subfolder, file_path
        """
    )
    print(f"CBSE/Social content rows: {len(rows)}")
    for r in rows:
        print(dict(r))

    all_subs = await conn.fetch(
        "SELECT DISTINCT subfolder, source_type::text FROM content_registry ORDER BY 1"
    )
    print(f"\nAll subfolders ({len(all_subs)}):")
    for s in all_subs:
        print(f"  {s['subfolder']} ({s['source_type']})")

    tmpl = await conn.fetchrow(
        """
        SELECT id::text, exam, duration_months
        FROM study_plan_templates
        WHERE exam = 'CBSE_10_SOCIAL_SCIENCE'
        """
    )
    print("\nCBSE template:", dict(tmpl) if tmpl else None)
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
