export interface DailyFact {
  id: string;
  prompt: string;
  fact: string;
  sourceTitle: string;
}

export interface DailyQuestion {
  id: string;
  stem: string;
  options: [string, string, string];
  correctIndex: number;
  explanation: string;
  sourceTitle: string;
}

interface DailyStudyEmailInput {
  date: string;
  facts: DailyFact[];
  questions: DailyQuestion[];
  appUrl: string;
}

export interface DailyStudyEmail {
  subject: string;
  html: string;
  text: string;
}

const OPTION_LABELS = ["A", "B", "C"] as const;

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(state: number) {
  const nextState = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return { state: nextState, value: nextState / 4294967296 };
}

export function pickDailyIndexes(total: number, count: number, seed: string) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeCount = Math.min(safeTotal, Math.max(0, Math.floor(count)));
  const indexes = Array.from({ length: safeTotal }, (_, index) => index);
  let state = hashSeed(seed);

  for (let index = 0; index < safeCount; index += 1) {
    const random = nextRandom(state);
    state = random.state;
    const swapIndex = index + Math.floor(random.value * (safeTotal - index));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }

  return indexes.slice(0, safeCount);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function factHtml(fact: DailyFact, index: number) {
  return `
    <tr>
      <td style="padding:0 24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#fff7f2;border:1px solid #f4d8cc;border-radius:14px;">
          <tr>
            <td style="padding:18px 18px 16px;">
              <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.4px;color:#c35f45;text-transform:uppercase;">Pearl ${index + 1}</div>
              <div style="padding-top:6px;font-size:14px;line-height:20px;font-weight:700;color:#22314d;">${escapeHtml(fact.prompt)}</div>
              <div style="padding-top:8px;font-size:16px;line-height:24px;color:#26354f;">${escapeHtml(fact.fact)}</div>
              <div style="padding-top:10px;font-size:11px;line-height:16px;color:#7b8493;">From ${escapeHtml(fact.sourceTitle)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function questionHtml(question: DailyQuestion, index: number) {
  const options = question.options
    .map(
      (option, optionIndex) => `
        <tr>
          <td style="padding:5px 0;vertical-align:top;width:30px;">
            <span style="display:inline-block;width:25px;height:25px;line-height:25px;text-align:center;border-radius:50%;background:#edf1f5;color:#22314d;font-size:12px;font-weight:800;">${OPTION_LABELS[optionIndex]}</span>
          </td>
          <td style="padding:7px 0 5px 8px;font-size:15px;line-height:21px;color:#344158;">${escapeHtml(option)}</td>
        </tr>`
    )
    .join("");

  return `
    <tr>
      <td style="padding:0 24px 18px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;border:1px solid #e3e6ea;border-radius:14px;">
          <tr>
            <td style="padding:18px;">
              <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.3px;color:#67758c;text-transform:uppercase;">Question ${index + 1}</div>
              <div style="padding:7px 0 10px;font-size:17px;line-height:24px;font-weight:700;color:#192942;">${escapeHtml(question.stem)}</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;">${options}</table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function answerHtml(question: DailyQuestion, index: number) {
  const safeCorrectIndex = Math.min(2, Math.max(0, question.correctIndex));
  return `
    <tr>
      <td style="padding:0 24px 14px;">
        <div style="font-size:15px;line-height:22px;font-weight:800;color:#1e4f45;">${index + 1}. ${OPTION_LABELS[safeCorrectIndex]}. ${escapeHtml(question.options[safeCorrectIndex])}</div>
        <div style="padding-top:5px;font-size:14px;line-height:21px;color:#3e5f59;">${escapeHtml(question.explanation)}</div>
        <div style="padding-top:6px;font-size:11px;line-height:16px;color:#71817e;">From ${escapeHtml(question.sourceTitle)}</div>
      </td>
    </tr>`;
}

export function buildDailyStudyEmail({
  date,
  facts,
  questions,
  appUrl,
}: DailyStudyEmailInput): DailyStudyEmail {
  const dateLabel = displayDate(date);
  const subject = `Irena’s 5-minute ASOPRS drill — ${dateLabel}`;
  const hasContent = facts.length > 0 || questions.length > 0;
  const emptyMessage = "No study items were available today. Open the study portal for a full review session.";
  const safeAppUrl = escapeHtml(appUrl.replace(/\/$/, ""));

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Three pearls, three board-style questions, five useful minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f4f1ea;">
      <tr>
        <td align="center" style="padding:16px 8px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fbfaf7;border-radius:18px;overflow:hidden;box-shadow:0 5px 24px rgba(31,45,68,.08);">
            <tr>
              <td style="padding:26px 24px 24px;background:#20304b;">
                <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.8px;color:#f39a79;text-transform:uppercase;">ASOPRS Daily · ${escapeHtml(dateLabel)}</div>
                <div style="padding-top:10px;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:34px;color:#ffffff;">Good morning, Irena.</div>
                <div style="padding-top:8px;font-size:16px;line-height:23px;color:#dce3ed;">Your 5-minute drill: read three pearls, commit to three answers, then scroll to check yourself.</div>
              </td>
            </tr>
            ${
              hasContent
                ? `
            <tr><td style="padding:25px 24px 13px;font-size:12px;line-height:18px;font-weight:800;letter-spacing:1.5px;color:#c35f45;text-transform:uppercase;">Rapid recall</td></tr>
            ${facts.map(factHtml).join("")}
            <tr><td style="padding:18px 24px 13px;font-size:12px;line-height:18px;font-weight:800;letter-spacing:1.5px;color:#56667e;text-transform:uppercase;">Board-style questions</td></tr>
            ${questions.map(questionHtml).join("")}
            <tr>
              <td align="center" style="padding:22px 24px 44px;">
                <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.3px;color:#9a7754;text-transform:uppercase;">Commit to your answers before scrolling</div>
                <div style="padding-top:9px;font-size:24px;line-height:24px;color:#c7b69f;">↓</div>
              </td>
            </tr>
            <tr><td style="padding:22px 24px 17px;background:#e9f3ef;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:30px;color:#1e4f45;">Answer key</td></tr>
            <tr><td style="height:1px;background:#d3e5dd;"></td></tr>
            <tr><td style="padding-top:18px;background:#e9f3ef;"></td></tr>
            ${questions.map(answerHtml).join("")}
            <tr><td style="height:10px;background:#e9f3ef;"></td></tr>`
                : `<tr><td style="padding:34px 24px;font-size:16px;line-height:24px;color:#344158;">${emptyMessage}</td></tr>`
            }
            <tr>
              <td align="center" style="padding:26px 24px 10px;">
                <a href="${safeAppUrl}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#e77655;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:800;">Open the study portal</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:10px 24px 25px;font-size:11px;line-height:17px;color:#89919d;">Built from your ASOPRS study library · One small session every day</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const factText = facts
    .map((fact, index) => `${index + 1}. ${fact.prompt}\n${fact.fact}\nFrom: ${fact.sourceTitle}`)
    .join("\n\n");
  const questionText = questions
    .map(
      (question, index) =>
        `${index + 1}. ${question.stem}\n${question.options
          .map((option, optionIndex) => `${OPTION_LABELS[optionIndex]}. ${option}`)
          .join("\n")}`
    )
    .join("\n\n");
  const answerText = questions
    .map((question, index) => {
      const safeCorrectIndex = Math.min(2, Math.max(0, question.correctIndex));
      return `${index + 1}. ${OPTION_LABELS[safeCorrectIndex]} — ${question.options[safeCorrectIndex]}\n${question.explanation}\nFrom: ${question.sourceTitle}`;
    })
    .join("\n\n");

  const text = hasContent
    ? `ASOPRS DAILY — ${dateLabel}\n\nGood morning, Irena.\nYour 5-minute drill: read three pearls, commit to three answers, then check yourself.\n\nRAPID RECALL\n\n${factText}\n\nBOARD-STYLE QUESTIONS\n\n${questionText}\n\nANSWERS\n\n${answerText}\n\nOpen the study portal: ${appUrl}`
    : `ASOPRS DAILY — ${dateLabel}\n\n${emptyMessage}\n\nOpen the study portal: ${appUrl}`;

  return { subject, html, text };
}
