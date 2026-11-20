import { Compass, FormInput, LayoutTemplate, Route } from "lucide-react";
import type { TestCategory } from "@/lib/types";

export const CATEGORY_DETAILS: Record<TestCategory, { title: string; icon: React.ElementType; items: string[] }> = {
  navigation: {
    title: "Navigation testing",
    icon: Compass,
    items: ["Main navigation", "Internal links", "Page loading", "Redirect behaviour", "Broken links"],
  },
  forms: {
    title: "Form testing",
    icon: FormInput,
    items: ["Contact & registration forms", "Required fields", "Invalid input", "Visible validation feedback", "Successful submission where safe"],
  },
  interface: {
    title: "Interface testing",
    icon: LayoutTemplate,
    items: ["Main headings", "Buttons", "Visible interface elements", "Missing content", "Basic rendering issues"],
  },
  journey: {
    title: "User journey testing",
    icon: Route,
    items: ["Homepage to key destination", "Main CTA navigation", "Basic shopping journeys", "Other safe interactions"],
  },
};
