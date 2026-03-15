import React from "react";
import { UserPrompt } from "../types";
import { formatDate } from "../utils/formatters";

const PLATFORM_LABELS: Record<string, string> = {
  "gemini-cli": "Gemini",
  "claude-code": "Claude",
  cursor: "Cursor",
};

interface PromptCardProps {
  prompt: UserPrompt;
}

export function PromptCard({ prompt }: PromptCardProps) {
  const date = formatDate(prompt.created_at_epoch);
  const platformLabel = prompt.platform
    ? (PLATFORM_LABELS[prompt.platform] ?? prompt.platform)
    : null;

  return (
    <div className="card prompt-card">
      <div className="card-header">
        <div className="card-header-left">
          <span className="card-type">Prompt</span>
          <span className="card-project">{prompt.project}</span>
          {platformLabel && platformLabel !== "Claude" && (
            <span
              className="card-type"
              style={{ fontSize: "0.7em", opacity: 0.8 }}
            >
              {platformLabel}
            </span>
          )}
        </div>
      </div>
      <div className="card-content">{prompt.prompt_text}</div>
      <div className="card-meta">
        <span className="meta-date">
          #{prompt.id} • {date}
        </span>
      </div>
    </div>
  );
}
