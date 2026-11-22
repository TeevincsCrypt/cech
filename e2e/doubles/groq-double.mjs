/**
 * TEST DOUBLE for the Groq API (OpenAI-compatible chat completions) — used ONLY
 * by the local E2E harness because api.groq.com is unreachable there.
 * Point CECH at it with GROQ_BASE_URL=http://127.0.0.1:4011.
 * Answers are deterministic and derived only from the prompt CECH sent
 * (e.g. bug reports cite only evidence ids present in the prompt).
 */
import { createServer } from "node:http";

const PORT = Number(process.env.GROQ_DOUBLE_PORT || 4011);
const reply = (res, content) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ id: "x", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
};

function handle(name, user) {
  const url = (user.match(/\(start URL\): (\S+)/) ?? user.match(/Start URL: (\S+)/) ?? user.match(/Website \(start URL\): (\S+)/))?.[1] ?? "";
  if (name === "test_plan") {
    return {
      website: url,
      notes: "Planned by the Groq test double.",
      tests: [
        { key: "navigation-001", category: "navigation", title: "Pricing link reaches the pricing page", objective: `Go to ${url} and click "Pricing" in the main navigation. Verify that the browser reaches the pricing page.`, expected_outcome: "The pricing page (/demo/pricing) opens.", priority: "high", assumption: "" },
        { key: "journey-001", category: "journey", title: "Primary CTA opens signup", objective: `Go to ${url} and click the "Start your free trial" call-to-action. Verify that the signup page opens.`, expected_outcome: "The signup page (/demo/signup) opens.", priority: "high", assumption: "" },
        { key: "forms-001", category: "forms", title: "Contact form shows a confirmation", objective: `Go to ${url} and open the contact page, fill the form with test data and submit it. Verify that a confirmation message appears.`, expected_outcome: "A visible confirmation message appears after submitting.", priority: "medium", assumption: "" },
      ],
    };
  }
  if (name === "test_analysis") {
    const outcome = user.match(/BROWSER OUTCOME \(ground truth from Kane CLI\): (\w+)/)?.[1];
    const passed = outcome === "PASSED";
    const summary = user.match(/Kane summary: (.*)/)?.[1] ?? "";
    return { summary: passed ? "The objective was met." : `Kane observed a failure: ${summary}`, issue_detected: !passed, severity: passed ? "none" : "medium", title: passed ? "Working as expected" : "Interaction did not reach the expected result", description: summary, expected_behavior: user.match(/Expected outcome \(from the plan\): (.*)/)?.[1] ?? "", observed_behavior: summary, recommendation: passed ? "" : "Inspect the element's link target and click handler.", confidence: "high" };
  }
  if (name === "bug_report") {
    const ids = [...user.matchAll(/^\[([a-z_]+:?[a-z_0-9]*)\]/gm)].map((m) => m[1]);
    const line = (id) => user.match(new RegExp(`^\\[${id.replace(":", "\\:")}\\] (.*)$`, "m"))?.[1] ?? "";
    const facts = ids.filter((i) => ["url:after", "kane:summary", "console:1", "network:1"].includes(i)).map((i) => `${line(i)} [${i}]`);
    const objective = user.match(/Objective Kane executed: (.*)/)?.[1] ?? "";
    return {
      title: (user.match(/^Test: (.*?) \(/m)?.[1] ?? "Failure") + " — not working",
      severity: "medium",
      feature: user.match(/^Test: (.*?) \(/m)?.[1] ?? "Feature",
      description: line("kane:summary") || "Kane reported a failure.",
      expected_behavior: user.match(/Expected outcome: (.*)/)?.[1] ?? "",
      actual_behavior: line("kane:summary"),
      steps_to_reproduce: ["Open the website.", "Repeat the interaction described in the objective.", "Observe the result."],
      observed_facts: facts,
      evidence_refs: ids.filter((i) => i.startsWith("screenshot:") || i.startsWith("url:") || i === "kane:steps"),
      hypothesis: "Possible cause: the element's target or handler is misconfigured (unconfirmed).",
      recommendation: "Check the link href / click handler / form endpoint for this element.",
      retest_objective: objective,
      evidence_sufficient: facts.length > 0,
    };
  }
  if (name === "retest_plan") {
    const items = [...user.matchAll(/- test_case_id: (\S+)[\s\S]*?previous_objective: (.*)/g)];
    return { tests: items.map((m) => ({ test_case_id: m[1], objective: m[2], rationale: "Same interaction, sharpened from Kane's previous result." })) };
  }
  if (name === "inspection_summary") {
    const c = JSON.parse(user.match(/Counts: (\{.*\})/)?.[1] ?? "{}");
    return { headline: `${c.PASSED ?? 0} passed, ${c.FAILED ?? 0} failed.`, overview: "Summary by the Groq test double from real Kane-double outcomes.", key_issues: [], next_steps: c.FAILED ? ["Fix the failed checks, then retest."] : [] };
  }
  return {};
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const b = JSON.parse(body || "{}");
      const name = b.response_format?.json_schema?.name ?? "unknown";
      const user = b.messages?.filter((m) => m.role === "user").map((m) => m.content).join("\n") ?? "";
      reply(res, handle(name, user));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`groq double on :${PORT}`));
