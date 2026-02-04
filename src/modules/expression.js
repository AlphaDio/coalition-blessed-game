import { DeterministicRNG } from './rng.js';

// Safe expression evaluator - no eval, only whitelisted operations
export class ExpressionEvaluator {
  constructor(rng) {
    this.rng = rng || new DeterministicRNG();
    this.builtins = {};
    this.registerBuiltins();
  }

  evaluate(expr, scope, vars = {}) {
    if (typeof expr !== 'string') {
      return expr;
    }

    // Parse and evaluate the expression
    return this.parseExpression(expr, { scope, vars });
  }

  parseExpression(expr, context) {
    expr = expr.trim();

    // Handle literals
    if (this.isLiteral(expr)) {
      return this.parseLiteral(expr);
    }

    // Handle function calls
    if (expr.includes('(') && expr.endsWith(')')) {
      return this.evaluateFunctionCall(expr, context);
    }

    // Handle operators
    return this.evaluateOperators(expr, context);
  }

  isLiteral(expr) {
    // Check for string literals
    if ((expr.startsWith('"') && expr.endsWith('"')) ||
        (expr.startsWith("'") && expr.endsWith("'"))) {
      return true;
    }

    // Check for numbers
    if (!isNaN(Number(expr))) {
      return true;
    }

    // Check for booleans
    if (expr === 'true' || expr === 'false') {
      return true;
    }

    // Check for null
    if (expr === 'null') {
      return true;
    }

    return false;
  }

  parseLiteral(expr) {
    // String literals
    if ((expr.startsWith('"') && expr.endsWith('"')) ||
        (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.slice(1, -1);
    }

    // Numbers
    if (!isNaN(Number(expr))) {
      return Number(expr);
    }

    // Booleans
    if (expr === 'true') return true;
    if (expr === 'false') return false;

    // Null
    if (expr === 'null') return null;

    throw new Error(`Invalid literal: ${expr}`);
  }

  resolvePath(path, context) {
    const parts = path.split('.');
    let current = null;
    let startIndex = 0;

    // Check if path starts with 'scope.' or 'vars.'
    if (parts[0] === 'scope' && context.scope) {
      current = context.scope;
      startIndex = 1;
    } else if (parts[0] === 'vars' && context.vars) {
      current = context.vars;
      startIndex = 1;
    } else {
      // Try to resolve from context
      current = context;
    }

    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i];
      
      if (current === undefined || current === null) {
        return undefined;
      }

      // Handle array indexing
      if (part.includes('[') && part.endsWith(']')) {
        const [prop, indexStr] = part.split('[');
        const index = parseInt(indexStr.slice(0, -1));

        if (current[prop] && Array.isArray(current[prop])) {
          current = current[prop][index];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }

    return current;
  }

  evaluateFunctionCall(expr, context) {
    const match = expr.match(/^(\w+)\((.*)\)$/);
    if (!match) {
      throw new Error(`Invalid function call: ${expr}`);
    }

    const [, funcName, argsStr] = match;
    const args = this.parseArguments(argsStr, context);

    if (this.builtins[funcName]) {
      return this.builtins[funcName](...args);
    }

    throw new Error(`Unknown function: ${funcName}`);
  }

  parseArguments(argsStr, context) {
    if (!argsStr.trim()) return [];

    const args = [];
    let current = '';
    let parenDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === '(' || char === '[' || char === '{') {
          parenDepth++;
          current += char;
        } else if (char === ')' || char === ']' || char === '}') {
          parenDepth--;
          current += char;
        } else if (char === ',' && parenDepth === 0) {
          args.push(this.parseExpression(current.trim(), context));
          current = '';
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === stringChar && argsStr[i - 1] !== '\\') {
          inString = false;
        }
      }
    }

    if (current.trim()) {
      args.push(this.parseExpression(current.trim(), context));
    }

    return args;
  }

  evaluateOperators(expr, context) {
    // Simple operator precedence handling
    const operators = [
      ['||'],
      ['&&'],
      ['==', '!=', '===', '!=='],
      ['<', '>', '<=', '>='],
      ['+', '-'],
      ['*', '/', '%']
    ];

    for (const ops of operators) {
      for (const op of ops) {
        if (expr.includes(op)) {
          const parts = this.splitByOperator(expr, op);
          if (parts.length === 2) {
            const left = this.parseExpression(parts[0], context);
            const right = this.parseExpression(parts[1], context);
            return this.applyOperator(left, op, right);
          }
        }
      }
    }

    // If no operators found, try to resolve as a path or variable
    return this.resolvePath(expr, context);
  }

  splitByOperator(expr, op) {
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];

      if (!inString) {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === '(' || char === '[' || char === '{') {
          parenDepth++;
        } else if (char === ')' || char === ']' || char === '}') {
          parenDepth--;
        } else if (parenDepth === 0 && expr.substr(i, op.length) === op) {
          return [expr.substr(0, i), expr.substr(i + op.length)];
        }
      } else {
        if (char === stringChar && expr[i - 1] !== '\\') {
          inString = false;
        }
      }
    }

    return [expr];
  }

  applyOperator(left, op, right) {
    switch (op) {
      case '||': return left || right;
      case '&&': return left && right;
      case '==': return left == right;
      case '!=': return left != right;
      case '===': return left === right;
      case '!==': return left !== right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      default: throw new Error(`Unknown operator: ${op}`);
    }
  }

  registerBuiltins() {
    // Data functions
    this.builtins.has_field = (obj, field) => obj && typeof obj === 'object' && field in obj;
    this.builtins.get = (obj, path, defaultValue) => {
      const parts = path.split('.');
      let current = obj;
      for (const part of parts) {
        if (current === undefined || current === null) return defaultValue;
        current = current[part];
      }
      return current !== undefined ? current : defaultValue;
    };
    this.builtins.set = (obj, path, value) => {
      const parts = path.split('.');
      let current = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return obj;
    };
    this.builtins.keys = (obj) => obj && typeof obj === 'object' ? Object.keys(obj) : [];
    this.builtins.values = (obj) => obj && typeof obj === 'object' ? Object.values(obj) : [];
    this.builtins.len = (arr) => Array.isArray(arr) ? arr.length : 0;
    this.builtins.length = (arr) => Array.isArray(arr) ? arr.length : 0; // Alias
    this.builtins.clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // Math functions
    this.builtins.min = (...args) => Math.min(...args);
    this.builtins.max = (...args) => Math.max(...args);
    this.builtins.floor = (x) => Math.floor(x);
    this.builtins.ceil = (x) => Math.ceil(x);
    this.builtins.abs = (x) => Math.abs(x);
    this.builtins.pow = (base, exponent) => Math.pow(base, exponent);
    this.builtins.sqrt = (x) => Math.sqrt(x);
    this.builtins.round = (x) => Math.round(x);
    this.builtins.cos = (angle) => Math.cos(angle);
    this.builtins.sin = (angle) => Math.sin(angle);

    // Constants
    this.builtins.PI = Math.PI;

    // Array functions
    this.builtins.append = (arr, item) => [...(Array.isArray(arr) ? arr : []), item];
    this.builtins.range = (count) => Array.from({ length: Math.max(0, count) }, (_, i) => i);
    this.builtins.includes = (arr, value) => Array.isArray(arr) ? arr.includes(value) : false;
    this.builtins.intersects = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      return a.some(value => b.includes(value));
    };

    // Time function (will be set by game context)
    this.builtins.current_time = () => Date.now();

    // Distance function (generic - works with both Vector2 and Vector3)
    this.builtins.distance = (a, b) => {
      if (a.x !== undefined && a.y !== undefined && b.x !== undefined && b.y !== undefined) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = (a.z || 0) - (b.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      return 0;
    };

    // RNG (deterministic)
    this.builtins.rand = () => {
      return this.rng.random();
    };
    this.builtins.randInt = (min, max) => {
      return this.rng.randomInt(min, max);
    };
    this.builtins.randFloat = (min, max) => {
      return this.rng.randomFloat(min, max);
    };
    this.builtins.randChoice = (array) => {
      return this.rng.choice(array);
    };
  }
}
