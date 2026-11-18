// 03 §5.2 constraint grammar: a small hand-written parser and evaluator, never `eval`.
// The compiler uses it to check that given lesson params satisfy their template's constraints
// (V21) and that constraint strings parse. All arithmetic is on integers; strings support only
// `==` and `!=`.
//
//   expr  := or            or := and ("||" and)*      and := not ("&&" not)*
//   not   := "!" not | cmp  cmp := sum (("=="|"!="|"<"|"<="|">"|">=") sum)?
//   sum   := term (("+"|"-") term)*                   term := unary (("*"|"//"|"%") unary)*
//   unary := "-" unary | atom                         atom := INT | STRING | IDENT | call | "(" expr ")"
//   call  := FN "(" expr ("," expr)* ")"   FN := abs|min|max|digit|ndigits|carries|borrows|gcd|iszero

export type Expr =
  | { t: 'int'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; name: string }
  | { t: 'neg'; e: Expr }
  | { t: 'not'; e: Expr }
  | { t: 'bin'; op: string; l: Expr; r: Expr }
  | { t: 'call'; fn: string; args: Expr[] };

const FNS: Record<string, number | [number, number]> = {
  abs: 1,
  min: [2, Number.POSITIVE_INFINITY],
  max: [2, Number.POSITIVE_INFINITY],
  digit: 2,
  ndigits: 1,
  carries: 2,
  borrows: 2,
  gcd: 2,
  iszero: 1,
};

export class ExprError extends Error {}

type Tok = { k: 'int' | 'str' | 'id' | 'op'; v: string; at: number };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const ops = [
    '||',
    '&&',
    '==',
    '!=',
    '<=',
    '>=',
    '//',
    '<',
    '>',
    '+',
    '-',
    '*',
    '%',
    '!',
    '(',
    ')',
    ',',
  ];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i += 1;
    } else if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j] as string)) j += 1;
      toks.push({ k: 'int', v: src.slice(i, j), at: i });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] as string)) j += 1;
      toks.push({ k: 'id', v: src.slice(i, j), at: i });
      i = j;
    } else if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0) throw new ExprError(`unterminated string at ${i + 1}`);
      toks.push({ k: 'str', v: src.slice(i + 1, j), at: i });
      i = j + 1;
    } else {
      const op = ops.find((o) => src.startsWith(o, i));
      if (!op) {
        throw new ExprError(
          c === '/'
            ? `'/' is not allowed; use '//' for floor division`
            : `unexpected '${c}' at ${i + 1}`,
        );
      }
      toks.push({ k: 'op', v: op, at: i });
      i += op.length;
    }
  }
  return toks;
}

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === 'op' && peek()?.v === v;
  const expectOp = (v: string) => {
    if (!isOp(v))
      throw new ExprError(`expected '${v}'${peek() ? ` at ${(peek() as Tok).at + 1}` : ' at end'}`);
    p += 1;
  };
  const binLevel = (ops: string[], next: () => Expr) => (): Expr => {
    let l = next();
    while (peek()?.k === 'op' && ops.includes((peek() as Tok).v)) {
      const op = (toks[p++] as Tok).v;
      l = { t: 'bin', op, l, r: next() };
    }
    return l;
  };
  const atom = (): Expr => {
    const tok = peek();
    if (!tok) throw new ExprError('unexpected end of expression');
    if (tok.k === 'int') {
      p += 1;
      return { t: 'int', v: Number(tok.v) };
    }
    if (tok.k === 'str') {
      p += 1;
      return { t: 'str', v: tok.v };
    }
    if (tok.k === 'id') {
      p += 1;
      if (isOp('(')) {
        const arity = FNS[tok.v];
        if (arity === undefined) throw new ExprError(`unknown function '${tok.v}'`);
        p += 1;
        const args = [expr()];
        while (isOp(',')) {
          p += 1;
          args.push(expr());
        }
        expectOp(')');
        const [lo, hi] = typeof arity === 'number' ? [arity, arity] : arity;
        if (args.length < lo || args.length > hi) {
          throw new ExprError(`${tok.v}() takes ${lo === hi ? lo : `${lo}+`} arguments`);
        }
        return { t: 'call', fn: tok.v, args };
      }
      return { t: 'id', name: tok.v };
    }
    if (isOp('(')) {
      p += 1;
      const e = expr();
      expectOp(')');
      return e;
    }
    throw new ExprError(`unexpected '${tok.v}' at ${tok.at + 1}`);
  };
  const unary = (): Expr => {
    if (isOp('-')) {
      p += 1;
      return { t: 'neg', e: unary() };
    }
    return atom();
  };
  const term = binLevel(['*', '//', '%'], unary);
  const sum = binLevel(['+', '-'], term);
  const cmp = (): Expr => {
    const l = sum();
    const tok = peek();
    if (tok?.k === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(tok.v)) {
      p += 1;
      return { t: 'bin', op: tok.v, l, r: sum() };
    }
    return l;
  };
  const not = (): Expr => {
    if (isOp('!')) {
      p += 1;
      return { t: 'not', e: not() };
    }
    return cmp();
  };
  const and = binLevel(['&&'], not);
  const or = binLevel(['||'], and);
  const expr = or;
  const result = expr();
  if (p < toks.length)
    throw new ExprError(`unexpected '${(toks[p] as Tok).v}' at ${(toks[p] as Tok).at + 1}`);
  return result;
}

export function identifiers(e: Expr, out = new Set<string>()): Set<string> {
  switch (e.t) {
    case 'id':
      out.add(e.name);
      break;
    case 'neg':
    case 'not':
      identifiers(e.e, out);
      break;
    case 'bin':
      identifiers(e.l, out);
      identifiers(e.r, out);
      break;
    case 'call':
      for (const a of e.args) identifiers(a, out);
      break;
  }
  return out;
}

type Value = number | string;

const digits = (n: number) =>
  String(Math.abs(Math.trunc(n)))
    .split('')
    .reverse()
    .map(Number);

function carries(a: number, b: number): number {
  const da = digits(a);
  const db = digits(b);
  let carry = 0;
  let n = 0;
  for (let i = 0; i < Math.max(da.length, db.length); i += 1) {
    const s = (da[i] ?? 0) + (db[i] ?? 0) + carry;
    carry = s >= 10 ? 1 : 0;
    n += carry;
  }
  return n;
}

function borrows(a: number, b: number): number {
  const da = digits(a);
  const db = digits(b);
  let borrow = 0;
  let n = 0;
  for (let i = 0; i < da.length; i += 1) {
    const d = (da[i] ?? 0) - borrow - (db[i] ?? 0);
    borrow = d < 0 ? 1 : 0;
    n += borrow;
  }
  return n;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function evaluate(e: Expr, env: Readonly<Record<string, number | string | boolean>>): Value {
  const num = (x: Expr): number => {
    const v = evaluate(x, env);
    if (typeof v !== 'number') throw new ExprError('arithmetic on a string');
    return v;
  };
  switch (e.t) {
    case 'int':
    case 'str':
      return e.v;
    case 'id': {
      const v = env[e.name];
      if (v === undefined) throw new ExprError(`unknown identifier '${e.name}'`);
      return typeof v === 'boolean' ? (v ? 1 : 0) : v;
    }
    case 'neg':
      return -num(e.e);
    case 'not':
      return num(e.e) ? 0 : 1;
    case 'call': {
      const a = e.args.map(num);
      switch (e.fn) {
        case 'abs':
          return Math.abs(a[0] as number);
        case 'min':
          return Math.min(...a);
        case 'max':
          return Math.max(...a);
        case 'digit':
          return digits(a[0] as number)[a[1] as number] ?? 0;
        case 'ndigits':
          return digits(a[0] as number).length;
        case 'carries':
          return carries(a[0] as number, a[1] as number);
        case 'borrows':
          return borrows(a[0] as number, a[1] as number);
        case 'gcd':
          return gcd(a[0] as number, a[1] as number);
        default:
          return a[0] === 0 ? 1 : 0; // iszero
      }
    }
    case 'bin': {
      if (e.op === '&&') return num(e.l) && num(e.r) ? 1 : 0;
      if (e.op === '||') return num(e.l) || num(e.r) ? 1 : 0;
      if (e.op === '==' || e.op === '!=') {
        const l = evaluate(e.l, env);
        const r = evaluate(e.r, env);
        return (l === r) === (e.op === '==') ? 1 : 0;
      }
      const l = num(e.l);
      const r = num(e.r);
      switch (e.op) {
        case '<':
          return l < r ? 1 : 0;
        case '<=':
          return l <= r ? 1 : 0;
        case '>':
          return l > r ? 1 : 0;
        case '>=':
          return l >= r ? 1 : 0;
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '//':
          if (r === 0) throw new ExprError('division by zero');
          return Math.floor(l / r);
        default:
          if (r === 0) throw new ExprError('modulo by zero');
          return ((l % r) + r) % r;
      }
    }
  }
}
