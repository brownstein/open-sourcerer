// Additive, tiny alias map for glossary anchors. Keys are lowercase.
export const GLOSSARY_ANCHORS: Record<string, string> = {
  // canonical examples
  recursion: "recursion",
  closure: "closure",
  variable: "variable",
  constant: "constant",
  array: "array",
  "hash map": "hash-map",
  object: "object",
  console: "console",
  editor: "editor",
  "console.log()": "console-log",
  "console.log": "console-log",
  string: "string",

  // aliases → canonical
  "recursive function": "recursion",
  dict: "hash-map",
  map: "hash-map"
};

export function slugifyToAnchor(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Extended glossary terms mapping for comprehensive documentation links
export const glossaryTerms: Record<string, string> = {
  // Core Concepts
  editor: "#using-the-docs",
  console: "#using-the-docs",
  "console.log()": "#using-the-docs",
  hotbar: "#using-the-docs",

  // Spell System
  element: "#spell-apis",
  "spell api": "#spell-apis",
  empowered: "#fire-spell-api",
  "mana cost": "#operators-and-expressions",

  // Data Types & Collections
  string: "#data-types-and-collections",
  number: "#data-types-and-collections",
  boolean: "#data-types-and-collections",
  object: "#data-types-and-collections",
  array: "#data-types-and-collections",
  null: "#data-types-and-collections",
  undefined: "#data-types-and-collections",
  nan: "#data-types-and-collections",
  map: "#data-types-and-collections",
  set: "#data-types-and-collections",
  weakmap: "#data-types-and-collections",
  weakset: "#data-types-and-collections",
  "type checking": "#data-types-and-collections",
  destructuring: "#data-types-and-collections",
  "spread syntax": "#data-types-and-collections",
  "optional chaining": "#data-types-and-collections",
  "nullish coalescing": "#data-types-and-collections",

  // Operators & Expressions
  "arithmetic operators": "#operators-and-expressions",
  "comparison operators": "#operators-and-expressions",
  "logical operators": "#operators-and-expressions",
  "assignment operators": "#operators-and-expressions",
  "ternary operator": "#operators-and-expressions",
  "unary operators": "#operators-and-expressions",
  "operator precedence": "#operators-and-expressions",
  "type coercion": "#operators-and-expressions",
  arithmetic: "#operators-and-expressions",
  comparison: "#operators-and-expressions",
  logical: "#operators-and-expressions",
  assignment: "#operators-and-expressions",
  ternary: "#operators-and-expressions",
  unary: "#operators-and-expressions",
  precedence: "#operators-and-expressions",

  // Syntax & Variables
  syntax: "#syntax-and-variables",
  variables: "#syntax-and-variables",
  statements: "#syntax-and-variables",
  expressions: "#syntax-and-variables",
  blocks: "#syntax-and-variables",
  comments: "#syntax-and-variables",
  scope: "#syntax-and-variables",
  lifetime: "#syntax-and-variables",
  "naming conventions": "#syntax-and-variables",
  debugging: "#syntax-and-variables",

  // Gameplay Integration
  event: "#events-and-triggers",
  entity: "#game-entities",
  state: "#state-management",
  performance: "#performance-tips",

  // Reference & Support
  troubleshooting: "#troubleshooting",
  changelog: "#changelog"
};

// Helper function to get anchor link for a term
export function getGlossaryLink(term: string): string {
  const normalizedTerm = term.toLowerCase().trim();
  return glossaryTerms[normalizedTerm] || "#keyword-glossary";
}

// Helper function to check if a term exists in the glossary
export function isGlossaryTerm(term: string): boolean {
  const normalizedTerm = term.toLowerCase().trim();
  return normalizedTerm in glossaryTerms;
}
