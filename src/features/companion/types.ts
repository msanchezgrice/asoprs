export interface CompanionSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  recap_json: SessionRecap | null;
  created_at: string;
}

export interface CompanionTurn {
  id: string;
  session_id: string;
  role: "user" | "model" | "system";
  transcript: string;
  prompt_kind: string | null;
  started_at: string;
  ended_at: string;
}

export interface CompanionEvent {
  id: string;
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  screenshot_url: string | null;
  occurred_at: string;
}

export interface SessionRecap {
  session_id: string;
  duration_seconds: number;
  turn_count: { user: number; model: number };
  frustrations: FrustrationSignal[];
  feature_requests: FeatureRequest[];
  questions_answered: number;
  screenshots_captured: number;
  summary: string;
}

export interface FrustrationSignal {
  timestamp: string;
  transcript: string;
  screenshot_url: string | null;
  signal_type: "verbal" | "behavioral";
  description: string;
}

export interface FeatureRequest {
  timestamp: string;
  transcript: string;
  screenshot_url: string | null;
  extracted_request: string;
}

export type CaptureMode = "html2canvas" | "display-media";

export interface CompanionConfig {
  captureMode: CaptureMode;
  captureIntervalMs: number;
  systemPrompt: string;
  geminiModel: string;
  geminiApiKey: string;
}
