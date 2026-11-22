import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { evaluateIssue, formatElapsed } from "@/lib/proof-of-fix";
import { getArtifactStore } from "@/lib/server/artifact-store";
import { CECH_LOGO_PNG_BASE64 } from "@/lib/server/brand-logo";
import { CATEGORY_LABELS, type EvidenceArtifact, type FixVerification, type InspectionReport } from "@/lib/types";

type ReportTest = InspectionReport["tests"][number];
type ReportResult = ReportTest["results"][number];

export interface ProofData {
  reference: string;
  verification: FixVerification | null;
  inspection: { id: string; website_url: string };
  test: { id: string; title: string; category: string; priority: string; expected_outcome: string };
  equivalence: "exact_objective" | "same_expected_outcome";
  elapsedMs: number | null;
  original: ReportResult;
  retest: ReportResult;
  status: "verified" | "regressed";
}

export const PROOF_STATEMENT =
  "The evidence in this report comes from actual browser executions performed by Kane CLI and observed by the CECH worker in the same browser session. Verification status is derived only from Kane's recorded outcomes: an original genuine failure followed by an equivalent genuine pass. AI text is interpretation, clearly labelled, and never changes an outcome. This report is not an external certification or independent audit.";

/** Assemble Proof of Fix data from stored records. Returns null if the test has no proven fix. */
export function buildProof(report: InspectionReport, testCaseId: string): ProofData | null {
  const test = report.tests.find((t) => t.id === testCaseId);
  if (!test) return null;
  const ev = evaluateIssue(test, test.results);
  const record = report.verifications.find((v) => v.test_case_id === testCaseId && (ev.proof ? v.retest_result_id === ev.proof.retest.id : true)) ?? null;
  // A regressed record still documents a fix that was once proven; show it as regressed.
  const pair =
    ev.state === "verified" && ev.proof
      ? { original: ev.proof.original, retest: ev.proof.retest, equivalence: ev.proof.equivalence, elapsedMs: ev.proof.elapsedMs, status: "verified" as const }
      : record && record.status === "regressed"
        ? (() => {
            const o = test.results.find((r) => r.id === record.original_result_id);
            const r = test.results.find((x) => x.id === record.retest_result_id);
            return o && r ? { original: o, retest: r, equivalence: record.equivalence, elapsedMs: Date.parse(r.completed_at ?? r.created_at) - Date.parse(o.completed_at ?? o.created_at), status: "regressed" as const } : null;
          })()
        : null;
  if (!pair) return null;
  const reference = `POF-${(record?.id ?? pair.retest.id).slice(0, 8).toUpperCase()}`;
  return {
    reference,
    verification: record,
    inspection: { id: report.inspection.id, website_url: report.inspection.website_url },
    test: { id: test.id, title: test.title, category: CATEGORY_LABELS[test.category], priority: test.priority, expected_outcome: test.expected_outcome },
    equivalence: pair.equivalence,
    elapsedMs: pair.elapsedMs,
    original: pair.original,
    retest: pair.retest,
    status: pair.status,
  };
}

const EQUIVALENCE_LABEL = {
  exact_objective: "Exact replay — the identical objective was re-executed.",
  same_expected_outcome: "Focused retest — same test, same start URL, identical expected outcome.",
} as const;

const shot = (r: ReportResult, kinds: EvidenceArtifact["kind"][]) => kinds.map((k) => r.artifacts.find((a) => a.kind === k)).find(Boolean) ?? null;
export const originalShot = (p: ProofData) => shot(p.original, ["at_failure", "after_viewport", "before"]);
export const retestShot = (p: ProofData) => shot(p.retest, ["after_viewport", "after_fullpage", "before"]);

function observed(r: ReportResult) {
  return r.analysis?.observed_behavior ?? r.kane_summary ?? r.kane_reason ?? "Not recorded.";
}

// ------------------------------------------------------------------ JSON
export function proofToJson(p: ProofData) {
  const side = (r: ReportResult) => ({
    result_id: r.id,
    kane_outcome: r.execution_status,
    executed_at: r.completed_at ?? r.started_at,
    objective_executed: r.objective,
    expected_outcome: r.expected_outcome ?? p.test.expected_outcome,
    observed: observed(r),
    kane_summary: r.kane_summary,
    kane_reason: r.kane_reason,
    url_before: r.evidence?.url_before ?? null,
    url_after: r.evidence?.url_after ?? null,
    console_errors: r.evidence?.console_errors ?? [],
    failed_requests: r.evidence?.failed_requests ?? [],
    capture_errors: r.evidence?.capture_errors ?? [],
    screenshots: r.artifacts.map((a) => ({ id: a.id, kind: a.kind, sha256: a.sha256, captured_at: a.captured_at, page_url: a.page_url })),
    kane_test_url: r.kane_test_url,
  });
  return {
    title: "CECH — PROOF OF FIX REPORT",
    verification_reference: p.reference,
    verification_record_id: p.verification?.id ?? null,
    status: p.status === "verified" ? "PROOF OF FIX — VERIFIED" : "REGRESSED (previously verified fix failed again)",
    website_url: p.inspection.website_url,
    inspection_id: p.inspection.id,
    test: p.test,
    equivalence: { kind: p.equivalence, description: EQUIVALENCE_LABEL[p.equivalence] },
    time_between_executions: formatElapsed(p.elapsedMs),
    original: side(p.original),
    retest: side(p.retest),
    ai: {
      label: "AI interpretation (Groq) — not an execution outcome",
      explanation: p.original.analysis?.summary ?? null,
      bug_report: p.original.analysis?.bug_report ?? null,
    },
    statement: PROOF_STATEMENT,
    generated_at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ Markdown
export function proofToMarkdown(p: ProofData): string {
  const j = proofToJson(p);
  const bug = p.original.analysis?.bug_report;
  const L: string[] = [];
  L.push("# CECH — PROOF OF FIX REPORT", "");
  L.push(`**${j.status}**`, "");
  L.push(`- **Verification reference:** ${p.reference}${p.verification ? ` (record ${p.verification.id})` : ""}`);
  L.push(`- **Website:** ${p.inspection.website_url}`, `- **Inspection ID:** ${p.inspection.id}`);
  L.push(`- **Issue:** ${bug?.title ?? p.test.title}`, `- **Test:** ${p.test.title} (${p.test.category}, ${p.test.priority} priority)`);
  L.push(`- **Equivalence:** ${EQUIVALENCE_LABEL[p.equivalence]}`, `- **Time between executions:** ${j.time_between_executions}`, "");
  for (const [label, s] of [["Original inspection", j.original], ["Retest", j.retest]] as const) {
    L.push(`## ${label} — ${s.kane_outcome}`, "");
    L.push(`- Executed at: ${s.executed_at ?? "—"}`, `- Objective executed: ${s.objective_executed}`, `- Expected: ${s.expected_outcome}`, `- Observed: ${s.observed}`);
    if (s.url_before || s.url_after) L.push(`- URL before → after: ${s.url_before ?? "—"} → ${s.url_after ?? "—"}`);
    if (s.console_errors.length) L.push(`- Console errors: ${s.console_errors.map((c) => c.text).join(" | ")}`);
    if (s.failed_requests.length) L.push(`- Failed requests: ${s.failed_requests.map((r) => `${r.method} ${r.url} → ${r.status ?? r.error}`).join(" | ")}`);
    if (s.screenshots.length) L.push(`- Screenshots (sha256): ${s.screenshots.map((x) => `${x.kind} ${x.sha256.slice(0, 16)}…`).join(", ")}`);
    if (s.capture_errors.length) L.push(`- Evidence capture notes: ${s.capture_errors.join(" | ")}`);
    L.push("");
  }
  if (bug) {
    L.push("## Reproduction (AI-generated from the original failure's evidence)", "");
    bug.steps_to_reproduce.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push("", "**Observed facts:**", ...bug.observed_facts.map((f) => `- ${f}`));
    if (bug.hypothesis) L.push("", `**Hypothesis (unconfirmed):** ${bug.hypothesis}`);
    L.push(`**Recommended correction:** ${bug.recommendation}`, "");
  } else if (p.original.analysis?.summary) {
    L.push("## AI explanation", "", p.original.analysis.summary, "");
  }
  L.push("## Verification summary", "");
  L.push(
    p.status === "verified"
      ? `The test failed in the original inspection and passed when the equivalent test was re-executed by Kane in a real browser ${j.time_between_executions} later.`
      : "This fix was previously verified, but the same test has since failed again (regressed).",
    "",
    `_${PROOF_STATEMENT}_`,
  );
  return L.join("\n");
}

// ------------------------------------------------------------------ PDF
/** Map text into the WinAnsi range supported by the standard PDF fonts. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[✓✔]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

class Writer {
  page!: PDFPage;
  y = 0;
  readonly M = 48;
  readonly W = 595.28;
  readonly H = 841.89;
  constructor(
    private doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([this.W, this.H]);
    this.y = this.H - this.M;
  }
  ensure(h: number) {
    if (this.y - h < this.M) this.newPage();
  }
  lines(text: string, size: number, width: number, font = this.font): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) > width && line) {
          out.push(line);
          line = word;
        } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  text(text: string, o: { size?: number; bold?: boolean; color?: [number, number, number]; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    const x = o.x ?? this.M;
    const lines = this.lines(text, size, o.width ?? this.W - x - this.M, font);
    for (const l of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: rgb(...(o.color ?? [0.07, 0.07, 0.08])) });
      this.y -= size * 1.4;
    }
    this.y -= o.gap ?? 4;
  }
}

export async function proofToPdf(p: ProofData): Promise<Uint8Array> {
  const j = proofToJson(p);
  const doc = await PDFDocument.create();
  doc.setTitle(`CECH Proof of Fix ${p.reference}`);
  doc.setProducer("CECH");
  doc.setCreator("CECH");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);
  const muted: [number, number, number] = [0.37, 0.37, 0.42];
  const green: [number, number, number] = [0.09, 0.5, 0.27];
  const red: [number, number, number] = [0.84, 0.27, 0.27];

  // Header
  const logo = await doc.embedPng(Buffer.from(CECH_LOGO_PNG_BASE64, "base64"));
  w.page.drawImage(logo, { x: w.M, y: w.y - 40, width: 40, height: 40 });
  w.page.drawText("CECH - PROOF OF FIX REPORT", { x: w.M + 52, y: w.y - 18, size: 16, font: bold });
  w.page.drawText(pdfSafe(`Verification reference ${p.reference}`), { x: w.M + 52, y: w.y - 34, size: 9, font, color: rgb(...muted) });
  w.y -= 60;

  // Status banner
  const ok = p.status === "verified";
  w.page.drawRectangle({ x: w.M, y: w.y - 34, width: w.W - 2 * w.M, height: 34, color: ok ? rgb(0.9, 0.965, 0.925) : rgb(0.99, 0.925, 0.92) });
  w.page.drawText(ok ? "PROOF OF FIX - VERIFIED" : "REGRESSED - previously verified fix failed again", { x: w.M + 14, y: w.y - 22, size: 13, font: bold, color: rgb(...(ok ? green : red)) });
  w.y -= 48;

  const field = (k: string, v: string) => {
    w.text(`${k}`, { size: 8, color: muted, gap: 0 });
    w.text(v, { size: 10, gap: 6 });
  };
  field("Website", p.inspection.website_url);
  field("Inspection ID", p.inspection.id);
  field("Issue", p.original.analysis?.bug_report?.title ?? p.test.title);
  field("Test", `${p.test.title} (${p.test.category}, ${p.test.priority} priority)`);
  field("Equivalence", EQUIVALENCE_LABEL[p.equivalence]);
  field("Time between executions", j.time_between_executions);

  // Side-by-side screenshots
  const store = getArtifactStore();
  const embed = async (a: EvidenceArtifact | null): Promise<PDFImage | null> => {
    if (!a) return null;
    try {
      const bytes = await store.get(a.storage_key);
      if (!bytes) return null;
      return a.content_type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  };
  const colW = (w.W - 2 * w.M - 16) / 2;
  const imgs = [await embed(originalShot(p)), await embed(retestShot(p))];
  const imgH = Math.max(...imgs.map((im) => (im ? (im.height / im.width) * colW : 60)));
  w.ensure(imgH + 60);
  const top = w.y;
  for (const [i, [label, r, color]] of ([["ORIGINAL - " + p.original.execution_status, p.original, red], ["RETEST - " + p.retest.execution_status, p.retest, green]] as const).entries()) {
    const x = w.M + i * (colW + 16);
    w.page.drawText(label, { x, y: top - 10, size: 10, font: bold, color: rgb(...color) });
    w.page.drawText(pdfSafe(`Executed ${r.completed_at ?? r.started_at ?? "-"}`), { x, y: top - 24, size: 8, font, color: rgb(...muted) });
    const im = imgs[i];
    if (im) {
      const h = (im.height / im.width) * colW;
      w.page.drawImage(im, { x, y: top - 32 - h, width: colW, height: h });
      w.page.drawRectangle({ x, y: top - 32 - h, width: colW, height: h, borderColor: rgb(0.86, 0.86, 0.9), borderWidth: 0.5 });
    } else {
      w.page.drawText("No screenshot captured for this execution.", { x, y: top - 46, size: 9, font, color: rgb(...muted) });
    }
  }
  w.y = top - 32 - imgH - 16;

  for (const [label, s] of [["Original inspection", j.original], ["Retest", j.retest]] as const) {
    w.ensure(80);
    w.text(`${label} - Kane outcome: ${s.kane_outcome}`, { size: 11, bold: true, gap: 2 });
    w.text(`Expected: ${s.expected_outcome}`, { size: 9 });
    w.text(`Observed: ${s.observed}`, { size: 9 });
    if (s.url_before || s.url_after) w.text(`URL before -> after: ${s.url_before ?? "-"} -> ${s.url_after ?? "-"}`, { size: 9 });
    if (s.console_errors.length) w.text(`Console errors: ${s.console_errors.map((c) => c.text).join(" | ")}`, { size: 9 });
    if (s.failed_requests.length) w.text(`Failed requests: ${s.failed_requests.map((r) => `${r.method} ${r.url} -> ${r.status ?? r.error}`).join(" | ")}`, { size: 9 });
    w.text(`Objective executed: ${s.objective_executed}`, { size: 8, color: muted, gap: 10 });
  }

  const bug = p.original.analysis?.bug_report;
  if (bug) {
    w.text("Reproduction steps (AI-generated from the original failure's evidence)", { size: 11, bold: true, gap: 2 });
    bug.steps_to_reproduce.forEach((s, i) => w.text(`${i + 1}. ${s}`, { size: 9, gap: 1 }));
    w.y -= 6;
    if (bug.hypothesis) w.text(`Hypothesis (unconfirmed): ${bug.hypothesis}`, { size: 9 });
    w.text(`Recommended correction: ${bug.recommendation}`, { size: 9, gap: 10 });
  } else if (p.original.analysis?.summary) {
    w.text("AI explanation (Groq interpretation)", { size: 11, bold: true, gap: 2 });
    w.text(p.original.analysis.summary, { size: 9, gap: 10 });
  }

  w.text("Verification summary", { size: 11, bold: true, gap: 2 });
  w.text(
    ok
      ? `The test failed in the original inspection and passed when the equivalent test was re-executed by Kane in a real browser ${j.time_between_executions} later.`
      : "This fix was previously verified, but the same test has since failed again (regressed).",
    { size: 9, gap: 8 },
  );
  w.text(PROOF_STATEMENT, { size: 8, color: muted });
  w.text(`Generated ${j.generated_at} - record ${p.verification?.id ?? "n/a"}`, { size: 7, color: muted });
  return doc.save();
}
