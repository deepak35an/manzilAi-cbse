import asyncio
from sqlalchemy import select
from app.database import engine, AsyncSession
from app.models.content_registry import ContentRegistry
from app.models.quiz import StudyPlanTemplate, UserStudyPlan, QuizSession
from app.models.user import User

async def check():
    async with AsyncSession(engine) as db:
        # Check users
        users_q = await db.execute(select(User))
        users = users_q.scalars().all()
        print(f"--- USERS ({len(users)}) ---")
        for u in users:
            print(f"User: id={u.id}, name={u.name}, phone={u.phone}, role={u.role}")

        # Check templates
        tmpl_q = await db.execute(select(StudyPlanTemplate))
        tmpls = tmpl_q.scalars().all()
        print(f"\n--- STUDY PLAN TEMPLATES ({len(tmpls)}) ---")
        for t in tmpls:
            print(f"Template: id={t.id}, exam={t.exam}, duration={t.duration_months}")

        # Check content registries
        reg_q = await db.execute(select(ContentRegistry))
        regs = reg_q.scalars().all()
        print(f"\n--- CONTENT REGISTRY ({len(regs)}) ---")
        for r in regs:
            print(f"Registry: id={r.id}, root={r.root_folder}, subfolder={r.subfolder}, title={r.title}, questions={r.question_count}")

        # Check user plans
        up_q = await db.execute(select(UserStudyPlan))
        ups = up_q.scalars().all()
        print(f"\n--- USER STUDY PLANS ({len(ups)}) ---")
        for up in ups:
            print(f"UserPlan: user_id={up.user_id}, template_id={up.template_id}, current_week={up.current_week}")

        # Check quiz sessions
        qs_q = await db.execute(select(QuizSession))
        qss = qs_q.scalars().all()
        print(f"\n--- QUIZ SESSIONS ({len(qss)}) ---")
        for qs in qss:
            print(f"Session: id={qs.id}, user_id={qs.user_id}, plan_id={qs.plan_id}, week={qs.week_number}")

if __name__ == "__main__":
    asyncio.run(check())
