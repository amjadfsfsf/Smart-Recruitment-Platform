"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const normalize = (value = "") => value.trim().replace(/\s+/g, " ");

export default function SkillPicker({
  label = "Skills",
  helperText = "Search for a skill or press Enter to add a custom one.",
  placeholder = "Start typing a skill...",
  selectedSkills = [],
  onSelectedChange = () => {},
  fetchSuggestions = async () => [],
  onPersistAdd,
  onPersistRemove,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [status, setStatus] = useState("");
  const [pendingAdd, setPendingAdd] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef(null);
  const suggestionBoxRef = useRef(null);

  const selectedKeys = useMemo(
    () =>
      new Set(
        (selectedSkills || []).map((item) =>
          normalize(item.skill_name || item.name || "").toLowerCase(),
        ),
      ),
    [selectedSkills],
  );

  useEffect(() => {
    let active = true;
    setLoadingSuggestions(true);
    const timer = setTimeout(() => {
      fetchSuggestions(query)
        .then((results) => {
          if (!active) return;
          const list = Array.isArray(results) ? results : [];
          setSuggestions(list);
          setLoadingSuggestions(false);
          setHighlightedIndex(list.length ? 0 : -1);
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
          setLoadingSuggestions(false);
          setHighlightedIndex(-1);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetchSuggestions, query]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionBoxRef.current &&
        !suggestionBoxRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuggestions = useMemo(() => {
    return (suggestions || []).filter(
      (item) => item && !selectedKeys.has(normalize(item).toLowerCase()),
    );
  }, [suggestions, selectedKeys]);

  const normalizedQuery = normalize(query);
  const hasExactSuggestion = normalizedQuery
    ? filteredSuggestions.some(
        (item) => normalize(item).toLowerCase() === normalizedQuery.toLowerCase(),
      )
    : false;

  const options = useMemo(() => {
    const base = filteredSuggestions.slice(0, 8).map((item) => ({
      type: "suggestion",
      value: item,
      label: item,
    }));

    if (normalizedQuery && !hasExactSuggestion) {
      base.push({
        type: "custom",
        value: normalizedQuery,
        label: `Add "${normalizedQuery}" as a custom skill`,
      });
    }

    return base;
  }, [filteredSuggestions, hasExactSuggestion, normalizedQuery]);

  useEffect(() => {
    setHighlightedIndex(options.length ? 0 : -1);
  }, [options.length]);

  const handleAddSkill = async (rawValue) => {
    const name = normalize(rawValue);
    if (!name) {
      setStatus("Please enter a skill name.");
      return;
    }

    if (selectedKeys.has(name.toLowerCase())) {
      setStatus("That skill is already added.");
      return;
    }

    setPendingAdd(true);
    setStatus("");

    try {
      let saved = { skill_name: name };
      if (onPersistAdd) {
        const result = await onPersistAdd(name);
        if (result && result.skill_name) {
          saved = result;
        }
      }
      onSelectedChange([...(selectedSkills || []), saved]);
      setQuery("");
      setHighlightedIndex(-1);
    } catch (error) {
      setStatus(error?.message || "Could not add skill. Please try again.");
    } finally {
      setPendingAdd(false);
    }
  };

  const handleRemoveSkill = async (skill) => {
    const normalizedName = normalize(skill.skill_name || skill.name || "");
    const targetId = skill.id ?? null;

    setStatus("");
    if (onPersistRemove) {
      setRemovingId(targetId ?? normalizedName);
      try {
        await onPersistRemove(skill);
      } catch (error) {
        setStatus(error?.message || "Could not remove skill.");
        setRemovingId(null);
        return;
      }
      setRemovingId(null);
    }

    const next = (selectedSkills || []).filter((item) => {
      if (targetId !== null && item.id !== undefined && item.id !== null) {
        return item.id !== targetId;
      }
      return (
        normalize(item.skill_name || item.name || "").toLowerCase() !==
        normalizedName.toLowerCase()
      );
    });

    onSelectedChange(next);
  };

  const handleKeyDown = (event) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        options.length ? (prev + 1) % options.length : -1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) =>
        options.length ? (prev - 1 + options.length) % options.length : -1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option =
        options[highlightedIndex] ||
        (normalizedQuery ? { value: normalizedQuery, type: "custom" } : null);
      if (option) {
        handleAddSkill(option.value);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const emptyState =
    !loadingSuggestions && normalizedQuery && options.length === 0;
  const disabledInput = pendingAdd || removingId !== null;

  return (
    <div className="dashboard-subcard rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-slate-500">{helperText}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            inputRef.current?.focus();
          }}
          className="premium-secondary-action rounded-xl px-3 py-2 text-xs font-semibold transition"
        >
          + Add Skill
        </button>
      </div>

      <div className="relative mt-3" ref={suggestionBoxRef}>
        <input
          ref={inputRef}
          value={query}
          disabled={disabledInput}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setStatus("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="dashboard-field w-full rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 disabled:opacity-60"
        />

        {open ? (
          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/95 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            {loadingSuggestions ? (
              <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
            ) : options.length ? (
              <ul className="max-h-56 divide-y divide-white/[0.06] overflow-y-auto">
                {options.map((option, index) => (
                  <li
                    key={`${option.type}-${option.value}`}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === highlightedIndex
                        ? "bg-[#A78BFA]/14 text-[#DDD6FE]"
                        : "text-white/[0.76] hover:bg-white/[0.06] hover:text-white"
                    }`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleAddSkill(option.value)}
                  >
                    {option.label}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500">
                {emptyState
                  ? "No matching skills found. Press Enter to add as a custom skill."
                  : "Type to search skills."}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {selectedSkills?.length ? (
          selectedSkills.map((skill) => {
            const normalizedName = normalize(skill.skill_name || skill.name || "");
            const key = skill.id ?? normalizedName;
            return (
              <span
                key={key}
                className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.065] px-3 py-1 text-xs font-medium text-white/[0.78]"
              >
                {skill.skill_name || skill.name}
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill)}
                  disabled={removingId === key}
                  className="text-white/[0.42] transition hover:text-red-200 disabled:opacity-60"
                  aria-label={`Remove ${normalizedName}`}
                >
                  x
                </button>
              </span>
            );
          })
        ) : (
          <span className="text-sm text-slate-500">No skills added yet.</span>
        )}
      </div>

      {status ? <p className="mt-3 text-xs text-red-600">{status}</p> : null}
    </div>
  );
}
