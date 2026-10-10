import ts from "typescript";

/** Keep lesson copy checks independent of type annotations and property-access syntax. */
export function lessonStrings(code: string): string[] {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  const source = ts.createSourceFile("chapter.js", javascript, ts.ScriptTarget.Latest, true);
  const statement = source.statements.find(ts.isVariableStatement);
  const chapter = statement?.declarationList.declarations[0]?.initializer;
  if (!chapter) throw new Error("Expected a chapter definition");
  const strings: string[] = [];
  function walk(node: ts.Node) {
    if (ts.isElementAccessExpression(node)) {
      walk(node.expression);
      if (!ts.isStringLiteral(node.argumentExpression)) walk(node.argumentExpression);
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      strings.push(node.text);
    ts.forEachChild(node, walk);
  }
  walk(chapter);
  return strings;
}

/** Module scopes change class ownership, not the reviewed visual declarations. */
export function unscopedStyles(css: string): string {
  return css.replace(/:where\(\.genome-explorer\) /g, "").replace(/:global\((\.[\w-]+)\)/g, "$1");
}
