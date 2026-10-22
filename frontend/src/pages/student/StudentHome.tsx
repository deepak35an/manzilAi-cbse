import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Briefcase,
  ArrowRight,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useExam } from "@/context/ExamContext";
import { getMyPlans } from "@/services/quizApi";
import { getStudentDashboard } from "@/services/studentApi";
import { STUDENT_ROUTES } from "@/lib/constants";
import { useEffect } from "react";
import type { ExamJourney } from "@/types/exam";

export default function StudentHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { journeys, setJourneys, setActiveJourney } = useExam();

  const { data: plans } = useQuery({
    queryKey: ["my-plans", user?.id],
    queryFn: getMyPlans,
    enabled: !!user,
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["student-dashboard-general", user?.id],
    queryFn: () => getStudentDashboard(),
    enabled: !!user,
  });


  const processedJourneys: ExamJourney[] = [];
  const cuetGroupMap: Record<number, ExamJourney> = {};

  for (const j of journeys) {
    if (j.exam?.startsWith('CUET_') || j.exam === 'CUET') {
      if (!cuetGroupMap[j.duration_months]) {
        const cuetEntry = {
          ...j,
          exam: 'CUET',
        };
        cuetGroupMap[j.duration_months] = cuetEntry;
        processedJourneys.push(cuetEntry);
      }
    } else {
      processedJourneys.push(j);
    }
  }

  const latestPlanId =
    dashboardData?.recent_results?.find((r) => r.plan_id)?.plan_id ||
    processedJourneys[0]?.plan_id;

  const sortedJourneys = [...processedJourneys].sort((a, b) => {
    if (a.plan_id === latestPlanId) return -1;
    if (b.plan_id === latestPlanId) return 1;
    return 0;
  });

  useEffect(() => {
    if (plans) setJourneys(plans);
  }, [plans, setJourneys]);


  const handleGoToExam = (journey: ExamJourney) => {
    setActiveJourney(journey);
    navigate(STUDENT_ROUTES.examDashboard(journey.plan_id));
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50">
      {/* Header */}
      <div className="px-6 pt-10 pb-5 max-w-4xl mx-auto">
        <p className="text-primary-600 font-semibold text-sm mb-1">
          Welcome back,
        </p>
        <h1 className="text-3xl font-bold text-gray-900">
          {user?.name || "Student"} 👋
        </h1>
        <p className="text-gray-500 mt-2">
          Where would you like to prepare today?
        </p>
      </div>
      {/* Center selection cards */}
      <div className="px-6 max-w-4xl mx-auto pb-12">
      {/* Active exam journeys */}
      {journeys.length > 0 && (
        <div className="mt-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Active Journeys
          </h3>
          <div className="space-y-2">
            {sortedJourneys.map((j) => {
              const isLatest = j.plan_id === latestPlanId;
              return (
                <button
                  key={j.plan_id}
                  onClick={() => handleGoToExam(j)}
                  className={`w-full card p-4 flex items-center justify-between transition-all group ${
                    isLatest
                      ? "border-2 border-primary-500 bg-primary-50/20 hover:bg-primary-50/40 hover:shadow-card-md"
                      : "hover:shadow-card-md"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      isLatest ? "bg-primary-100" : "bg-primary-50"
                    }`}>
                      <Trophy className={`w-5 h-5 ${isLatest ? "text-primary-700" : "text-primary-600"}`} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{j.duration_months} Month Plan</p>
                        {isLatest && (
                          <span className="text-[10px] font-semibold bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Recent Visited
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {j.exam} · Week {j.current_week} of {j.total_weeks} ·{" "}
                        {j.completed_weeks.length} weeks done
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 transition" />
                </button>
              );
            })}
            <button
              onClick={() => navigate(STUDENT_ROUTES.EXAM_ONBOARDING)}
              className="w-full card p-4 flex items-center gap-3 text-primary-600 hover:bg-primary-50 transition font-medium text-sm"
            >
              <div className="w-9 h-9 border-2 border-dashed border-primary-300 rounded-xl flex items-center justify-center text-xl">
                +
              </div>
              Add New Exam Journey
            </button>
          </div>
        </div>
      )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Exam Center card */}
          <div
            className="card p-7 border-2 border-primary-100 hover:border-primary-300 transition-all group cursor-pointer"
            onClick={() => {
              if (sortedJourneys.length > 0) handleGoToExam(sortedJourneys[0]);
              else navigate(STUDENT_ROUTES.EXAM_ONBOARDING);
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="w-12 h-12 bg-primary-100 rounded-2xl flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-primary-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Exam Center
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              Prepare for GATE, CUET, JEE, and more with a personalized weekly
              study plan powered by AI.
            </p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-600 mb-6">
              {[
                "Personalized study plan",
                "Weekly adaptive tests",
                "Detailed analytics",
              ].map((f) => (
                <span key={f} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />{" "}
                  {f}
                </span>
              ))}
            </div>
            <button
              className="btn-primary btn-md w-full"
              onClick={(e) => {
                e.stopPropagation();
                if (sortedJourneys.length > 0) {
                  handleGoToExam(sortedJourneys[0]);
                } else {
                  navigate(STUDENT_ROUTES.EXAM_ONBOARDING);
                }
              }}
            >
              Get Started
            </button>
          </div>

          {/* Job Center card */}
          <div
            className="card p-7 border-2 border-accent-100 hover:border-accent-300 transition-all group cursor-pointer"
            onClick={() => navigate(STUDENT_ROUTES.JOB)}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="w-12 h-12 bg-accent-100 rounded-2xl flex items-center justify-center">
                <Briefcase className="w-7 h-7 text-accent-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-accent-500 group-hover:translate-x-1 transition-all" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Job Center</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              Upload a job description and get a skill-gap analysis with a
              targeted practice roadmap.
            </p>
            <div className="flex flex-col gap-1.5 text-sm text-gray-600 mb-6">
              {[
                "AI-powered JD parsing",
                "Skill gap analysis",
                "Role-specific questions",
              ].map((f) => (
                <span key={f} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />{" "}
                  {f}
                </span>
              ))}
            </div>
            <button
              className="btn-md w-full border-2 border-accent-200 text-accent-700 bg-accent-50 hover:bg-accent-100 transition rounded-xl font-semibold"
              onClick={(e) => {
                e.stopPropagation();
                navigate(STUDENT_ROUTES.JOB);
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
