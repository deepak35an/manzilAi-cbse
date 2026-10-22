import { createBrowserRouter, Navigate } from "react-router-dom";

// Root
import RootLayout from "./layouts/RootLayout";

// Layouts
import StudentExamLayout from "./layouts/StudentExamLayout";
import AppShell from "./components/layout/AppShell";

// Guards
import RoleRoute from "./components/guards/RoleRoute";

// Public pages
import LandingPage from "./pages/public/LandingPage";
import LoginPage from "./pages/public/LoginPage";

// Student pages
import StudentHome from "./pages/student/StudentHome";
import ExamOnboarding from "./pages/student/exam/ExamOnboarding";
import ExamDashboard from "./pages/student/exam/ExamDashboard";
import ExamPlan from "./pages/student/exam/ExamPlan";
import ExamHistory from "./pages/student/exam/ExamHistory";
import StrengthWeakness from "./pages/student/exam/StrengthWeakness";
import TopicBreakdown from "./pages/student/exam/TopicBreakdown";
import TestQuiz from "./pages/student/exam/TestQuiz";
import TestAttempt from "./pages/student/exam/TestAttempt";
import TestResult from "./pages/student/exam/TestResult";
import TestReview from "./pages/student/exam/TestReview";
import QuestionReview from "./pages/student/exam/QuestionReview";
import JobOnboarding from "./pages/student/job/JobOnboarding";
import JobDashboard from "./pages/student/job/JobDashboard";
import CuetHub from './pages/student/cuet/CuetHub';
import CuetAnalysis from './pages/student/cuet/CuetAnalysis';

// Org pages
import OrgDashboard from "./pages/org/OrgDashboard";
import StudentManagement from "./pages/org/StudentManagement";
import StudentDetails from "./pages/org/StudentDetails";
import StudentHistory from "./pages/org/StudentHistory";
import StudentTopicBreakdown from "./pages/org/StudentTopicBreakdown";
import OrgDetailTopicBreakdown from "./pages/org/OrgDetailTopicBreakdown";
import QuestionBankPage from "./pages/org/QuestionBankPage";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import ContentManagement from "./pages/admin/ContentManagement";
import OrgManagement from "./pages/admin/OrgManagement";
import AdminOrgView from "./pages/admin/AdminOrgView";
import AdminOrgDetailTopicBreakdown from "./pages/admin/AdminOrgDetailTopicBreakdown";

export const router = createBrowserRouter([
  {
    // Root layout provides AuthContext + ExamContext to every route
    element: <RootLayout />,
    children: [
      // ─── Public ────────────────────────────────────────────────────────────
      { path: "/", element: <LandingPage /> },
      { path: "/login", element: <LoginPage /> },

      // ─── Student: home + onboarding (no sidebar) ───────────────────────────
      {
        path: "/student/home",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <StudentHome />
          </RoleRoute>
        ),
      },
      {
        path: '/student/exam',
        element: (
          <RoleRoute allowedRoles={['student']}>
          <ExamOnboarding />
          </RoleRoute>
        ),
      },
      // ─── CUET: hub + analysis (no sidebar) ────────────────────────────────
      {
        path: '/student/cuet-hub',
        element: (
          <RoleRoute allowedRoles={['student']}>
          <CuetHub />
          </RoleRoute>
        ),
      },
      {
        path: '/student/cuet-hub/analysis',
        element: (
          <RoleRoute allowedRoles={['student']}>
          <CuetAnalysis />
          </RoleRoute>
        ),
      },
      {
        path: "/student/job",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <JobOnboarding />
          </RoleRoute>
        ),
      },

      // ─── Student exam: pages with sidebar (StudentExamLayout) ──────────────
      {
        path: "/student/exam/:id",
        element: (
          // <RoleRoute allowedRoles={["student"]}>
          <StudentExamLayout />
          // </RoleRoute>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: "dashboard", element: <ExamDashboard /> },
          { path: "plan", element: <ExamPlan /> },
          { path: "history", element: <ExamHistory /> },
          { path: "strength-weakness", element: <StrengthWeakness /> },
          { path: "topic-breakdown", element: <TopicBreakdown /> },
          {
            path: "strength-weakness/topic-breakdown",
            element: <TopicBreakdown />,
          },
          // TestReview has sidebar for context (dynamic back button)
          {
            path: ":testId/review",
            children: [
              { index: true, element: <Navigate to="ai-analysis" replace /> },
              { path: "ai-analysis", element: <TestReview /> },
              { path: "question-review", element: <QuestionReview /> },
            ]
          },
        ],
      },

      // ─── Student: test cycle — fullscreen, no sidebar ──────────────────────
      {
        path: "/student/exam/:id/:testId/quiz",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <TestQuiz />
          </RoleRoute>
        ),
      },
      {
        path: "/student/exam/:id/:testId/attempt",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <TestAttempt />
          </RoleRoute>
        ),
      },
      {
        path: "/student/exam/:id/:testId/result",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <TestResult />
          </RoleRoute>
        ),
      },

      // ─── Student: Job Center dashboard (has sidebar) ───────────────────────
      {
        path: "/student/job/dashboard",
        element: (
          <RoleRoute allowedRoles={["student"]}>
          <StudentExamLayout />
          </RoleRoute>
        ),
        children: [{ index: true, element: <JobDashboard /> }],
      },

      // ─── Legacy redirects (removed in Phase 10) ────────────────────────────
      {
        path: "/student/dashboard",
        element: <Navigate to="/student/home" replace />,
      },
      {
        path: "/student/evaluate",
        element: <Navigate to="/student/exam" replace />,
      },
      {
        path: "/student/quiz/:sessionId",
        element: <Navigate to="/student/home" replace />,
      },
      {
        path: "/student/results/:sessionId",
        element: <Navigate to="/student/home" replace />,
      },
      {
        path: "/student/history",
        element: <Navigate to="/student/home" replace />,
      },
      {
        path: "/student/job-eval",
        element: <Navigate to="/student/job" replace />,
      },

      // ─── Org ───────────────────────────────────────────────────────────────
      {
        element: (
          <RoleRoute allowedRoles={["org_admin"]}>
            <AppShell />
          </RoleRoute>
        ),
        children: [
          { path: "/org/dashboard", element: <OrgDashboard /> },
          { path: "/org/detail-topic-breakdown", element: <OrgDetailTopicBreakdown /> },
          { path: "/org/detail_topic_breakdown", element: <OrgDetailTopicBreakdown /> },
          { path: "/org/students", element: <StudentManagement /> },
          { path: "/org/student/:studentId", element: <StudentDetails /> },
          { path: "/org/student/:studentId/history", element: <StudentHistory /> },
          { path: "/org/student/:studentId/topic-breakdown", element: <StudentTopicBreakdown /> },
          { path: "/org/question-banks", element: <QuestionBankPage /> },
        ],
      },

      // ─── Admin ─────────────────────────────────────────────────────────────
      {
        element: (
          <RoleRoute allowedRoles={["super_admin"]}>
            <AppShell />
          </RoleRoute>
        ),
        children: [
          { path: "/admin/dashboard", element: <AdminDashboard /> },
          { path: "/admin/content", element: <ContentManagement /> },
          { path: "/admin/organizations", element: <OrgManagement /> },
          { path: "/admin/org/:orgId", element: <AdminOrgView /> },
          { path: "/admin/org/:orgId/detail-topic-breakdown", element: <AdminOrgDetailTopicBreakdown /> },
        ],

      },
    ],
  },
]);
