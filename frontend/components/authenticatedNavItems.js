import {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  Compass,
  FileText,
  LayoutDashboard,
  Radio,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

export const userNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/dashboard/profile", icon: UserRound },
  { label: "Job Matching", shortLabel: "Match", href: "/dashboard/job-matching", icon: Sparkles },
  { label: "Skill Gap", shortLabel: "Skills", href: "/dashboard/skill-gap", icon: ChartNoAxesCombined },
  { label: "Career Path", shortLabel: "Path", href: "/dashboard/career-path", icon: Compass },
  { label: "Courses", href: "/dashboard/courses", icon: BookOpen },
  { label: "Resume Builder", shortLabel: "Resume", href: "/dashboard/resume-builder", icon: FileText },
  { label: "Mock Interview", shortLabel: "Mock", href: "/dashboard/mock-interview", icon: Bot },
  { label: "Company Interviews", shortLabel: "Interviews", href: "/dashboard/company-interviews", icon: BriefcaseBusiness },
  { label: "Job Feed", shortLabel: "Jobs", href: "/dashboard/job-feed", icon: Radio },
];

export const companyNavItems = [
  { label: "Dashboard", href: "/company-dashboard", icon: LayoutDashboard },
  { label: "Company Jobs", shortLabel: "Jobs", href: "/company-dashboard/jobs", icon: BriefcaseBusiness },
  { label: "Candidates", href: "/company-dashboard/candidates", icon: UsersRound },
  { label: "Company Profile", shortLabel: "Profile", href: "/company-dashboard/profile", icon: Building2 },
];
