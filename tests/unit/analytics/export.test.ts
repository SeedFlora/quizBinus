import { describe, expect, it } from "vitest";
import { simulateGame } from "@/lib/demo/simulate";
import { computeSessionAnalytics } from "@/lib/analytics/compute";
import {
  csvLabels,
  CSV_BOM,
  escapeCell,
  EXPORT_FORMATS,
  exportFileName,
  toCSV,
  toCsvText,
} from "@/lib/analytics/export";
import { createTranslator } from "@/lib/i18n/config";

const analytics = computeSessionAnalytics(simulateGame({ playedQuestions: 10, stopAt: "finished" }).engine.state);
const labels = csvLabels(createTranslator("id"));

describe("CSV escaping", () => {
  it("quotes delimiters, quotes and line breaks", () => {
    expect(escapeCell('Kata "kunci", lalu')).toBe('"Kata ""kunci"", lalu"');
    expect(escapeCell("dua\nbaris")).toBe('"dua\nbaris"');
    expect(escapeCell("a;b", "comma")).toBe("a;b");
    expect(escapeCell("a;b", "semicolon")).toBe('"a;b"');
  });

  it("neutralizes spreadsheet formulas in text but not in numbers", () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(escapeCell("@rara")).toBe("'@rara");
    expect(escapeCell(-5)).toBe("-5");
  });

  it("writes decimals with the dialect's separator", () => {
    expect(escapeCell(8.8, "comma")).toBe("8.8");
    expect(escapeCell(8.8, "semicolon")).toBe("8,8");
    expect(
      toCsvText(
        [
          ["a", 1.5],
          [null, "b"],
        ],
        "semicolon",
      ),
    ).toBe("a;1,5\r\n;b");
  });
});

describe("toCSV", () => {
  const csv = toCSV(analytics, { labels, dialect: "comma", formatDate: () => "28/09/2026 09.00" });
  const lines = csv.slice(1).split("\r\n");

  it("starts with a UTF-8 BOM and uses CRLF", () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.includes("\r\n")).toBe(true);
  });

  it("contains every section in order, one row per student and question", () => {
    const titles = [
      labels.sections.summary,
      labels.sections.students,
      labels.sections.questions,
      labels.sections.outcomes,
      labels.sections.topics,
    ];
    const positions = titles.map((title) => lines.indexOf(title));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    const studentHeader = positions[1]! + 1;
    expect(lines[studentHeader]).toContain(labels.columns.nickname);
    expect(positions[2]! - studentHeader - 2).toBe(analytics.students.length);
    expect(positions[3]! - (positions[2]! + 1) - 2).toBe(analytics.questions.length);
  });

  it("writes whole percents and localized labels", () => {
    expect(csv).toContain(`${labels.summary.overallAccuracy},${Math.round(analytics.overview.overallAccuracy! * 100)}`);
    expect(csv).toContain("Pilihan A (%)");
    expect(csv).toContain("28/09/2026 09.00");
  });
});

describe("export registry", () => {
  it("implements CSV and declares PDF as planned", () => {
    expect(EXPORT_FORMATS.csv.status).toBe("ready");
    expect(EXPORT_FORMATS.pdf.status).toBe("planned");
  });

  it("builds a UTF-8 CSV blob", async () => {
    const format = EXPORT_FORMATS.csv;
    if (format.status !== "ready") throw new Error("csv must be ready");
    const blob = format.build(analytics, { labels });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("names files after course, class, quiz and date", () => {
    expect(exportFileName(analytics, "csv", "2026-09-28")).toBe(
      "nusaquest_comp6716-la01_os-battle-scheduling-concurrency_2026-09-28.csv",
    );
  });
});
