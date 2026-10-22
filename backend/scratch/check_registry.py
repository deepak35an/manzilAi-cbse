import asyncio, asyncpg
async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/assessment_db')
    rows = await conn.fetch('SELECT file_path, question_count FROM content_registry ORDER BY file_path')
    print(f"Total registry rows: {len(rows)}")
    for r in rows:
        print(f"  {r['file_path']}  ({r['question_count']} questions)")
    await conn.close()
asyncio.run(main())
