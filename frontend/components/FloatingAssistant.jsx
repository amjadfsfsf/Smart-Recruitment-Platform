"use client";

import { useState } from "react";

function generateReply(message) {
  const prompt = message.toLowerCase();

  if (prompt.includes("resume")) {
    return "Start with measurable impact bullets. Use action verbs, metrics, and role-specific keywords from your target job description.";
  }

  if (prompt.includes("interview")) {
    return "Use STAR structure for each answer and close with the result you achieved. Practice 3 stories: challenge, teamwork, and leadership.";
  }

  if (prompt.includes("skill") || prompt.includes("learn")) {
    return "Focus on one core technical skill, one portfolio project, and one communication skill each month for balanced growth.";
  }

  if (prompt.includes("job") || prompt.includes("apply")) {
    return "Prioritize roles above 60% match, tailor your CV per role, and submit with a short impact-focused cover note.";
  }

  return "I can help with career goals, skill planning, resume updates, and interview prep. Tell me your desired job title to get a focused plan.";
}

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I am your Smart Recruitment Platform assistant. Ask me about resume tips, skills, or interview prep.",
    },
  ]);
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const response = generateReply(text);
    setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: response }]);
    setDraft("");
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 max-lg:bottom-4 max-lg:right-4">
      {open && (
        <div className="mb-3 w-[320px] max-w-[90vw] rounded-2xl border border-white/[0.08] bg-[#111827]/95 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="border-b border-white/[0.08] px-4 py-3">
            <h3 className="text-sm font-semibold text-slateplus">Smart Recruitment Platform Assistant</h3>
            <p className="text-xs text-slate-500">Career advice, resume tips, and interview prep</p>
          </div>

          <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  message.role === "assistant"
                    ? "bg-white/[0.065] text-white/[0.82]"
                    : "ml-8 bg-[#A78BFA] text-[#0A0F1C]"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-white/[0.08] p-3">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSend();
                }
              }}
              placeholder="Ask a career question..."
              className="flex-1 rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2 text-sm text-white outline-none placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15"
            />
            <button
              type="button"
              onClick={handleSend}
              className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA] px-3 py-2 text-sm font-semibold text-[#0A0F1C] transition hover:bg-[#C4B5FD]"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full border border-[#A78BFA]/20 bg-[#A78BFA] px-5 py-3 text-sm font-semibold text-[#0A0F1C] shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-[#C4B5FD]"
      >
        {open ? "Close Assistant" : "AI Assistant"}
      </button>
    </div>
  );
}
