import type { SiteProbe } from "@/lib/server/site-probe";
import type { TestCategory } from "@/lib/types";
import type { PlannedTest } from "./schemas";

/**
 * Deterministic fallback objectives, used ONLY when Groq is unavailable
 * (not configured, rate-limited, down). They are clearly labelled
 * plan_source="baseline" in the UI. This only affects WHICH objectives are
 * executed; outcomes still come exclusively from real Kane executions.
 */
export function baselinePlan(url: string, categories: TestCategory[], probe: SiteProbe): { tests: PlannedTest[]; notes: string } {
  const host = new URL(url).host;
  const internal = probe.links.filter((l) => {
    try {
      const u = new URL(l.href);
      return u.host === host && u.pathname !== new URL(url).pathname && !u.hash;
    } catch {
      return false;
    }
  });
  const tests: PlannedTest[] = [];
  const add = (t: Omit<PlannedTest, "key">) =>
    tests.push({ ...t, key: `${t.category}-${String(tests.filter((x) => x.category === t.category).length + 1).padStart(3, "0")}` });

  for (const c of categories) {
    if (c === "interface") {
      add({
        category: "interface",
        title: "Homepage renders its main content",
        objective: `Go to ${url} and wait for the page to load. Verify that a main heading is visible and the page shows primary content with no visible error message.`,
        expected_outcome: "The homepage loads with a visible main heading and content.",
        priority: "high",
        assumption: "",
      });
    }
    if (c === "navigation") {
      const link = internal[0];
      add(
        link
          ? {
              category: "navigation",
              title: `"${link.text}" link reaches its destination`,
              objective: `Go to ${url} and click the "${link.text}" link. Verify that the browser navigates to ${new URL(link.href).pathname} and that page shows a visible heading.`,
              expected_outcome: `Browser reaches ${new URL(link.href).pathname} with visible content.`,
              priority: "high",
              assumption: "",
            }
          : {
              category: "navigation",
              title: "Primary navigation leads to a new page",
              objective: `Go to ${url} and locate the primary navigation menu. Click its first link. Verify that a different page loads and shows a visible heading.`,
              expected_outcome: "A different page loads after clicking the first navigation link.",
              priority: "high",
              assumption: "Assumes the site has a primary navigation menu.",
            },
      );
    }
    if (c === "forms") {
      const form = probe.forms.find((f) => f.fields.length > 0);
      add({
        category: "forms",
        title: "Form shows validation for empty required fields",
        objective: form
          ? `Go to ${url} and find the form with fields ${form.fields.slice(0, 4).join(", ")}. Submit it without filling any fields. Verify that a visible validation message appears and the form is not submitted.`
          : `Go to ${url} and find a contact or signup form (follow a "Contact" link if needed). Submit it with all fields empty. Verify that a visible validation message appears.`,
        expected_outcome: "Visible validation feedback prevents an empty submission.",
        priority: "medium",
        assumption: form ? "" : "Assumes the site has a contact or signup form.",
      });
    }
    if (c === "journey") {
      const cta = probe.buttons[0] ?? internal[1]?.text;
      add({
        category: "journey",
        title: "Main call-to-action leads somewhere useful",
        objective: cta
          ? `Go to ${url} and click the "${cta}" call-to-action. Verify that the browser navigates to a different page or shows a new section relevant to "${cta}".`
          : `Go to ${url} and click the most prominent call-to-action button on the page. Verify that the browser navigates to a different page.`,
        expected_outcome: "Clicking the main CTA takes the visitor to its destination.",
        priority: "high",
        assumption: cta ? "" : "Assumes the homepage has a primary call-to-action.",
      });
    }
  }
  return {
    tests,
    notes: "Groq was unavailable, so CECH used its built-in baseline objectives. Outcomes still come from real Kane browser runs.",
  };
}
