/** Deliberately partial/invalid inputs used to exercise runtime validation in tests. */
export function fixture<T>(value: unknown): T {
  return value as T;
}

/** The DOM tests implement only the element operations exercised by the renderer. */
export type TestElement = HTMLElement & {
  children: TestElement[] & HTMLCollection;
  parent: TestElement;
};
export const testElement = (tag: string) => document.createElement(tag) as TestElement;

export function mockDocument(): Document {
  const createElement = (tagName: string): TestElement =>
    ({
      tagName,
      className: "",
      innerHTML: "",
      open: false,
      children: [] as unknown as TestElement["children"],
      style: {} as CSSStyleDeclaration,
      dataset: {},
      classList: { add() {} } as unknown as DOMTokenList,
      append(this: TestElement, ...children: TestElement[]) {
        for (const child of children) {
          child.parent = this;
          this.children.push(child);
        }
      },
      remove(this: TestElement) {
        const children = this.parent.children;
        children.splice(children.indexOf(this), 1);
      },
      querySelector() {
        return { setAttribute() {} };
      },
    }) as unknown as TestElement;
  return { createElement } as unknown as Document;
}
