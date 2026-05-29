import {
  BarChart3,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  FileText,
  Gauge,
  Map,
  MessageSquareText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
} from "lucide-react";

export const navLinks = [
  { label: "Services", href: "#services", id: "services" },
  { label: "About", href: "#about", id: "about" },
  { label: "Results", href: "#results", id: "results" },
  { label: "Testimonials", href: "#testimonials", id: "testimonials" },
  { label: "Blog", href: "#blog", id: "blog" },
  { label: "FAQ", href: "#faq", id: "faq" },
];

export const trustedBrands = ["Apex", "Northstar", "Orbit", "Vertex", "Nexa", "Helio"];

export const services = [
  {
    title: "AI Job Matching",
    description: "Match with roles using skills, goals, experience, and role-fit signals.",
    icon: SearchCheck,
  },
  {
    title: "Skill Gap Analysis",
    description: "See what you already have, what matters most next, and where to focus first.",
    icon: BarChart3,
  },
  {
    title: "Career Roadmaps",
    description: "Turn a target role into a clear sequence of milestones and learning moves.",
    icon: Map,
  },
  {
    title: "Resume Intelligence",
    description: "Strengthen your resume with targeted feedback, rewrites, and role alignment.",
    icon: FileText,
  },
  {
    title: "Course Recommendations",
    description: "Find learning resources tied directly to missing skills and next-step goals.",
    icon: BookOpenCheck,
  },
  {
    title: "Mock Interview Coaching",
    description: "Practice role-specific interviews and receive structured feedback instantly.",
    icon: Bot,
  },
];

export const aboutHighlights = [
  {
    title: "Career clarity",
    description: "Understand the path before committing months of effort.",
    icon: BrainCircuit,
  },
  {
    title: "Actionable guidance",
    description: "Every insight is translated into a concrete next move.",
    icon: Target,
  },
  {
    title: "Application readiness",
    description: "Resume, interview, and job-fit support stay connected in one flow.",
    icon: BriefcaseBusiness,
  },
];

export const stats = [
  { label: "Career paths generated", value: 10000, suffix: "+", display: "10K+", icon: Map },
  { label: "AI match accuracy", value: 92, suffix: "%", display: "92%", icon: Gauge },
  { label: "Mock interviews completed", value: 5000, suffix: "+", display: "5K+", icon: MessageSquareText },
  { label: "Resume strength uplift", value: 34, suffix: "%", display: "34%", icon: TrendingUp },
];

export const testimonials = [
  {
    name: "Maya Rahman",
    role: "Computer Science Student",
    quote:
      "Smart Recruitment Platform turned a vague goal into a concrete roadmap. I finally knew which skills mattered now and which ones could wait.",
    initials: "MR",
  },
  {
    name: "Omar Khalil",
    role: "Junior Data Analyst",
    quote:
      "The job-match scoring felt practical, and the resume suggestions helped me tighten my profile before I started applying.",
    initials: "OK",
  },
  {
    name: "Lina Saad",
    role: "Career Switcher",
    quote:
      "The mock interviews made practice feel structured instead of stressful. I could see exactly what improved from one session to the next.",
    initials: "LS",
  },
  {
    name: "Yousef Nassar",
    role: "Product Analyst",
    quote:
      "I liked that the roadmap, courses, and job opportunities all connected. It felt less like separate tools and more like one system.",
    initials: "YN",
  },
];

export const teamMembers = [
  { name: "Ava Chen", role: "Career Strategy Lead", initials: "AC" },
  { name: "Noah Reed", role: "AI Product Designer", initials: "NR" },
  { name: "Mila Haddad", role: "Learning Experience", initials: "MH" },
  { name: "Ethan Cole", role: "Interview Coach", initials: "EC" },
];

export const blogPosts = [
  {
    category: "Career Strategy",
    title: "How to choose your next role without chasing every trend",
    excerpt: "A calmer way to compare skills, market demand, and long-term fit before you pivot.",
    readTime: "6 min read",
  },
  {
    category: "Resume",
    title: "What recruiters notice in the first 20 seconds of a resume",
    excerpt: "The practical signals that make your profile easier to trust and easier to shortlist.",
    readTime: "4 min read",
  },
  {
    category: "Interview Prep",
    title: "Turn interview feedback into a repeatable improvement loop",
    excerpt: "A simple framework for practicing with intention instead of repeating the same mistakes.",
    readTime: "5 min read",
  },
];

export const faqs = [
  {
    question: "How does Smart Recruitment Platform generate recommendations?",
    answer:
      "It combines your profile, skills, target role, resume signals, and goals to suggest aligned jobs, roadmaps, courses, and interview priorities.",
  },
  {
    question: "Can I use it before I know my target role?",
    answer:
      "Yes. You can start from your current skills and interests, compare multiple directions, and then choose the path that fits best.",
  },
  {
    question: "Does the platform help with resumes and interviews?",
    answer:
      "Yes. Smart Recruitment Platform supports resume improvement, rewrite assistance, and role-specific mock interviews with focused feedback.",
  },
  {
    question: "Is this built for students or professionals?",
    answer:
      "Both. The workflow supports students, early-career candidates, career switchers, and professionals preparing for their next move.",
  },
  {
    question: "What makes the experience different from a generic job board?",
    answer:
      "The platform connects role discovery, gap analysis, learning, resume readiness, and interview preparation into one guided system.",
  },
];

export const heroMetrics = [
  { label: "Match score", value: "92%", icon: ShieldCheck },
  { label: "Roadmap pace", value: "6 steps", icon: Map },
  { label: "Interview readiness", value: "84%", icon: Sparkles },
];
