import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "../components/policy-page/policy-page.tsx";
import { privacyPolicy } from "../content/policies.tsx";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Genomewalk" },
      { name: "description", content: privacyPolicy.description },
      { property: "og:title", content: "Privacy Policy — Genomewalk" },
    ],
  }),
  component: () => <PolicyPage document={privacyPolicy} page="privacy" />,
});
