import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "../components/policy-page/policy-page.tsx";
import { termsOfUse } from "../content/policies.tsx";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Genomewalk" },
      { name: "description", content: termsOfUse.description },
      { property: "og:title", content: "Terms of Use — Genomewalk" },
    ],
  }),
  component: () => <PolicyPage document={termsOfUse} page="terms" />,
});
