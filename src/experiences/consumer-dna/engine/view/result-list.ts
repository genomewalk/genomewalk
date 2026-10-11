import type { ConsumerMatch } from "../../types.ts";
import { resultList } from "../../../../lib/results/list.ts";
import { condList } from "../../../../lib/view/conditions.ts";
import { matchKey, variantLocation } from "../match-identity.ts";
import {
  SIG_LABEL,
  resultCategories,
  RESULT_CATEGORIES,
  resultSummary,
} from "../../../../lib/results/evidence.ts";
import { matchRow } from "./results.ts";

export function matchList(hits: ConsumerMatch[]) {
  return resultList<ConsumerMatch>(hits, {
    categories: RESULT_CATEGORIES,
    categoriesOf: resultCategories,
    renderRow: matchRow,
    textOf: (h) =>
      `${h.gene || ""} ${condList(h.conditions).join(" ")} ${h.call.id || ""} ${(h.rsIds || "")
        .split("|")
        .map((id) => "rs" + id)
        .join(
          " ",
        )} ${matchKey(h)} ${variantLocation(h)} ${SIG_LABEL[h.sig] || ""} ${resultSummary(h).label} ${h.rawSig || ""} ${resultCategories(h).join(" ")}`,
    suggestionsOf: (h) => [
      { v: h.gene, kind: "gene" },
      ...condList(h.conditions).map((v) => ({ v, kind: "condition" })),
      ...(/^rs\d+$/.test(h.call.id || "") ? [{ v: h.call.id, kind: "rsID" }] : []),
      ...(h.rsIds || "")
        .split("|")
        .filter((id) => /^\d+$/.test(id))
        .map((id) => ({ v: "rs" + id, kind: "rsID" })),
    ],
  });
}
