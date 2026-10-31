export interface ResultCategory {
  id: string;
  label: string;
  description: string;
}
export interface Suggestion {
  v: string;
  kind: string;
}
export interface IndexedSuggestion extends Suggestion {
  l: string;
}
export interface ResultIndexEntry<T> {
  h: T;
  t: string;
  categories: string[];
}
export interface IndexOptions<T> {
  textOf(hit: T): string;
  categoriesOf(hit: T): string[];
  suggestionsOf(hit: T): Suggestion[];
}
export interface ListOptions<T> extends IndexOptions<T> {
  categories: ResultCategory[];
  classificationsOf(hit: T): string[];
  priorityOf(hit: T): ResultCategory;
  renderRow(hit: T): HTMLElement;
}
