import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const TITLE = "ASOPRS Study Portal";
const DESCRIPTION =
  "Read the ASOPRS library, generate flashcards and quizzes, build study packs, and track your board-review progress in one place.";

async function loadImageDataUrl(filename: string, mimeType: string) {
  const buffer = await readFile(path.join(process.cwd(), "public", filename));
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export default async function OpenGraphImage() {
  const [logoSrc, markSrc] = await Promise.all([
    loadImageDataUrl("asoprs-logo.jpg", "image/jpeg"),
    loadImageDataUrl("asoprs-mark.png", "image/png"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#f5efe5",
          padding: "34px",
          color: "#0B1426",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRadius: "32px",
            border: "1px solid #e7ded1",
            background: "linear-gradient(135deg, #ffffff 0%, #f6efe4 100%)",
            padding: "38px 42px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <img src={markSrc} width={72} height={72} alt="" />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontSize: "18px",
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#8c857a",
                  }}
                >
                  Board Review Portal
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: "34px",
                    fontWeight: 700,
                    lineHeight: 1.1,
                  }}
                >
                  {TITLE}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderRadius: "999px",
                background: "#0B1426",
                color: "#ffffff",
                padding: "12px 20px",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              Read. Quiz. Review. Track progress.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              flexDirection: "column",
              gap: "28px",
            }}
          >
            <img src={logoSrc} width={980} height={109} alt="" />

            <div
              style={{
                display: "flex",
                maxWidth: "980px",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "54px",
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: "-0.03em",
                }}
              >
                Turn the ASOPRS library into a focused study workflow.
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: "28px",
                  lineHeight: 1.35,
                  color: "#405063",
                }}
              >
                {DESCRIPTION}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            {[
              "Library",
              "Flashcards",
              "Quizzes",
              "Mind Maps",
              "Study Packs",
              "Progress",
            ].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  borderRadius: "999px",
                  border: "1px solid #ded3c2",
                  background: "#fffaf2",
                  padding: "10px 16px",
                  fontSize: "19px",
                  fontWeight: 600,
                  color: "#213551",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
