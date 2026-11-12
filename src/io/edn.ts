/**
 * Minimal EDN reader/writer covering what a flat table needs. Reads the full EDN syntax
 * (maps, vectors, lists, sets, keywords, symbols, chars, tagged literals, #_ discard, comments)
 * so files from Clojure tools parse; anything nested is surfaced as a structure the importer stringifies.
 */

export type EdnValue =
  | null
  | boolean
  | string
  | { type: "int"; value: number; text: string }
  | { type: "float"; value: number }
  | { type: "keyword"; name: string }
  | { type: "symbol"; name: string }
  | { type: "char"; value: string }
  | { type: "tagged"; tag: string; value: EdnValue }
  | { type: "vector" | "list" | "set"; items: EdnValue[] }
  | { type: "map"; entries: [EdnValue, EdnValue][] };

export class EdnParseError extends Error {}

const DELIMS = new Set(["(", ")", "[", "]", "{", "}", '"', ";"]);
const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === ",";

const CHAR_NAMES: Record<string, string> = {
  newline: "\n",
  space: " ",
  tab: "\t",
  return: "\r",
  backspace: "\b",
  formfeed: "\f",
};

export class EdnReader {
  private i = 0;
  constructor(private readonly src: string) {}

  atEnd(): boolean {
    this.skip();
    return this.i >= this.src.length;
  }

  private skip(): void {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (isWs(c)) this.i++;
      else if (c === ";") {
        while (this.i < s.length && s[this.i] !== "\n") this.i++;
      } else if (c === "#" && s[this.i + 1] === "_") {
        this.i += 2;
        this.read();
      } else break;
    }
  }

  private err(msg: string): never {
    const line = this.src.slice(0, this.i).split("\n").length;
    throw new EdnParseError(`${msg} (line ${line})`);
  }

  read(): EdnValue {
    this.skip();
    const s = this.src;
    if (this.i >= s.length) this.err("Unexpected end of input");
    const c = s[this.i]!;
    switch (c) {
      case "[":
        this.i++;
        return { type: "vector", items: this.readSeq("]") };
      case "(":
        this.i++;
        return { type: "list", items: this.readSeq(")") };
      case "{": {
        this.i++;
        const items = this.readSeq("}");
        if (items.length % 2) this.err("Map literal must have an even number of forms");
        const entries: [EdnValue, EdnValue][] = [];
        for (let k = 0; k < items.length; k += 2) entries.push([items[k]!, items[k + 1]!]);
        return { type: "map", entries };
      }
      case '"':
        return this.readString();
      case "\\":
        return this.readChar();
      case "#": {
        const next = s[this.i + 1];
        if (next === "{") {
          this.i += 2;
          return { type: "set", items: this.readSeq("}") };
        }
        this.i++;
        const tag = this.readToken();
        return { type: "tagged", tag, value: this.read() };
      }
      case ")":
      case "]":
      case "}":
        this.err(`Unexpected ${c}`);
    }
    return this.readAtom(this.readToken());
  }

  private readSeq(close: string): EdnValue[] {
    const items: EdnValue[] = [];
    for (;;) {
      this.skip();
      if (this.i >= this.src.length) this.err(`Missing ${close}`);
      if (this.src[this.i] === close) {
        this.i++;
        return items;
      }
      items.push(this.read());
    }
  }

  private readString(): string {
    const s = this.src;
    this.i++;
    let out = "";
    while (this.i < s.length) {
      const c = s[this.i++]!;
      if (c === '"') return out;
      if (c === "\\") {
        const e = s[this.i++];
        if (e === "n") out += "\n";
        else if (e === "t") out += "\t";
        else if (e === "r") out += "\r";
        else if (e === "u") {
          out += String.fromCharCode(parseInt(s.slice(this.i, this.i + 4), 16));
          this.i += 4;
        } else out += e ?? "";
      } else out += c;
    }
    this.err("Unterminated string");
  }

  private readChar(): EdnValue {
    this.i++;
    const start = this.i;
    this.i++;
    while (this.i < this.src.length && !isWs(this.src[this.i]!) && !DELIMS.has(this.src[this.i]!)) this.i++;
    const tok = this.src.slice(start, this.i);
    if (tok.length === 1) return { type: "char", value: tok };
    if (CHAR_NAMES[tok]) return { type: "char", value: CHAR_NAMES[tok]! };
    if (/^u[0-9a-fA-F]{4}$/.test(tok))
      return { type: "char", value: String.fromCharCode(parseInt(tok.slice(1), 16)) };
    this.err(`Unknown character \\${tok}`);
  }

  private readToken(): string {
    const start = this.i;
    while (this.i < this.src.length && !isWs(this.src[this.i]!) && !DELIMS.has(this.src[this.i]!)) this.i++;
    if (start === this.i) this.err("Expected a token");
    return this.src.slice(start, this.i);
  }

  private readAtom(tok: string): EdnValue {
    if (tok === "nil") return null;
    if (tok === "true") return true;
    if (tok === "false") return false;
    if (tok.startsWith(":")) return { type: "keyword", name: tok.slice(1) };
    if (/^[+-]?\d+N?$/.test(tok)) {
      const text = tok.replace(/N$/, "").replace(/^\+/, "");
      return { type: "int", value: Number(text), text };
    }
    if (/^[+-]?\d+(\.\d*)?([eE][+-]?\d+)?M?$/.test(tok))
      return { type: "float", value: Number(tok.replace(/M$/, "")) };
    if (tok === "##Inf" || tok === "##-Inf" || tok === "##NaN") return { type: "symbol", name: tok };
    return { type: "symbol", name: tok };
  }
}

export function parseEdn(src: string): EdnValue {
  const r = new EdnReader(src);
  const v = r.read();
  if (!r.atEnd()) throw new EdnParseError("Unexpected content after the first form");
  return v;
}

/** Converts nested EDN to plain JSON-ish data (used when stringifying nested values). */
export function ednToPlain(v: EdnValue): unknown {
  if (v === null || typeof v !== "object") return v;
  switch (v.type) {
    case "int":
    case "float":
      return v.value;
    case "keyword":
      return v.name;
    case "symbol":
      return v.name;
    case "char":
      return v.value;
    case "tagged":
      return ednToPlain(v.value);
    case "vector":
    case "list":
    case "set":
      return v.items.map(ednToPlain);
    case "map":
      return Object.fromEntries(v.entries.map(([k, val]) => [String(ednToPlain(k)), ednToPlain(val)]));
  }
}

/** Serialises nested EDN back to EDN text (for "stringify" of nested values). */
export function ednToString(v: EdnValue): string {
  if (v === null) return "nil";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return ednString(v);
  switch (v.type) {
    case "int":
      return v.text;
    case "float":
      return String(v.value);
    case "keyword":
      return `:${v.name}`;
    case "symbol":
      return v.name;
    case "char":
      return `\\${v.value}`;
    case "tagged":
      return `#${v.tag} ${ednToString(v.value)}`;
    case "vector":
      return `[${v.items.map(ednToString).join(" ")}]`;
    case "list":
      return `(${v.items.map(ednToString).join(" ")})`;
    case "set":
      return `#{${v.items.map(ednToString).join(" ")}}`;
    case "map":
      return `{${v.entries.map(([k, val]) => `${ednToString(k)} ${ednToString(val)}`).join(", ")}}`;
  }
}

export function ednString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r")}"`;
}

/** Whether a column name can be written as a keyword (`:name`). */
export function isKeywordName(name: string): boolean {
  return (
    /^[A-Za-z*+!_?<>=-][\w*+!?<>=.-]*(\/[A-Za-z*+!_?<>=-][\w*+!?<>=.-]*)?$/.test(name) &&
    !/^[+-]\d/.test(name)
  );
}
