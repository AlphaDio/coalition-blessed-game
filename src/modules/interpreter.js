import { ExpressionEvaluator } from './expression.js';
import { DeterministicRNG } from './rng.js';

export class DSInterpreter {
  constructor(registry, rng) {
    this.evaluator = new ExpressionEvaluator(rng);
    this.modules = new Map();
    this.maxIterations = 1000; // Safety limit
    this.iterationCount = 0;
    
    if (registry) {
      this.loadModules(registry);
    }
  }

  loadModules(registry) {
    // Load modules from registry
    for (const entry of registry.index || []) {
      // Modules should be pre-loaded into registry.modules
      if (registry.modules && registry.modules[entry.id]) {
        this.modules.set(entry.id, registry.modules[entry.id]);
      }
    }
  }

  registerModule(moduleId, moduleDoc) {
    this.modules.set(moduleId, moduleDoc);
  }

  executeHook(moduleId, hookName, context) {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    const hook = module.hooks?.[hookName];
    if (!hook) {
      throw new Error(`Hook not found: ${hookName} in module ${moduleId}`);
    }

    return this.executeDirectives(hook.logic, context);
  }

  executeFunction(moduleId, functionName, args, context) {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    const func = module.functions?.[functionName];
    if (!func) {
      throw new Error(`Function not found: ${functionName} in module ${moduleId}`);
    }

    // Create function context with parameters
    const funcContext = {
      ...context,
      inputs: args,
      vars: { ...context.vars, params: args }
    };

    const result = this.executeDirectives(func.logic, funcContext);
    return result.output;
  }

  executeDirectives(directives, context) {
    const actions = [];
    let output = undefined;

    this.iterationCount = 0;

    for (const directive of directives) {
      if (this.iterationCount++ > this.maxIterations) {
        throw new Error('Execution budget exceeded');
      }

      const result = this.executeDirective(directive, context);
      actions.push(...result.actions);

      if (result.output !== undefined) {
        output = result.output;
      }
    }

    return { actions, output };
  }

  executeDirective(directive, context) {
    if (directive.set_variable) {
      const { varName, value } = directive.set_variable;
      context.vars[varName] = typeof value === 'string'
        ? this.evaluator.evaluate(value, context.scope, context.vars)
        : value;
      return { actions: [] };
    }

    if (directive.let) {
      const { name, value } = directive.let;
      context.vars[name] = typeof value === 'string'
        ? this.evaluator.evaluate(value, context.scope, context.vars)
        : value;
      return { actions: [] };
    }

    if (directive.if) {
      const { condition, then: thenBranch, else: elseBranch } = directive.if;
      const conditionResult = this.evaluator.evaluate(condition, context.scope, context.vars);

      if (conditionResult) {
        return this.executeDirectives(thenBranch, context);
      } else if (elseBranch) {
        return this.executeDirectives(elseBranch, context);
      }

      return { actions: [] };
    }

    if (directive.for_each) {
      const { collection, as, do: doBlock } = directive.for_each;
      const collectionValue = this.evaluator.evaluate(collection, context.scope, context.vars);

      if (!Array.isArray(collectionValue)) {
        throw new Error('for_each collection must be an array');
      }

      const actions = [];

      for (const item of collectionValue) {
        const loopContext = {
          ...context,
          vars: { ...context.vars, [as]: item }
        };

        const result = this.executeDirectives(doBlock, loopContext);
        actions.push(...result.actions);
      }

      return { actions };
    }

    if (directive.switch) {
      const { value, cases, default: defaultCase } = directive.switch;
      const valueResult = this.evaluator.evaluate(value, context.scope, context.vars);

      for (const caseItem of cases) {
        const caseValue = 'when' in caseItem && typeof caseItem.when === 'string'
          ? this.evaluator.evaluate(caseItem.when, context.scope, context.vars)
          : caseItem.when;

        if (valueResult === caseValue) {
          return this.executeDirectives(caseItem.do, context);
        }
      }

      if (defaultCase) {
        return this.executeDirectives(defaultCase, context);
      }

      return { actions: [] };
    }

    if (directive.call) {
      const { function: funcName, args, assign_to } = directive.call;

      // Parse module.function format
      const [moduleId, functionName] = funcName.includes('.')
        ? funcName.split('.')
        : ['current', funcName]; // Assume current module if not specified

      const evaluatedArgs = {};
      for (const [key, expr] of Object.entries(args)) {
        evaluatedArgs[key] = this.evaluator.evaluate(expr, context.scope, context.vars);
      }

      const result = this.executeFunction(moduleId, functionName, evaluatedArgs, context);

      if (assign_to) {
        context.vars[assign_to] = result;
      }

      return { actions: [] };
    }

    if (directive.return !== undefined) {
      const value = typeof directive.return === 'string'
        ? this.evaluator.evaluate(directive.return, context.scope, context.vars)
        : directive.return;
      return { actions: [], output: value };
    }

    if (directive.append) {
      const { to, value } = directive.append;
      const target = typeof to === 'string'
        ? this.evaluator.evaluate(to, context.scope, context.vars)
        : to;
      const appendValue = typeof value === 'string'
        ? this.evaluator.evaluate(value, context.scope, context.vars)
        : value;

      if (Array.isArray(target)) {
        target.push(appendValue);
      }

      return { actions: [] };
    }

    if (directive.emit_event) {
      const { name, payload } = directive.emit_event;

      const evaluatedPayload = {};
      for (const [key, value] of Object.entries(payload)) {
        evaluatedPayload[key] = typeof value === 'string'
          ? this.evaluator.evaluate(value, context.scope, context.vars)
          : value;
      }

      // Events are handled by the game engine
      return {
        actions: [{
          type: 'emit_event',
          args: { name, payload: evaluatedPayload }
        }]
      };
    }

    if (directive.game_action) {
      const { action, args } = directive.game_action;

      const evaluatedArgs = {};
      for (const [key, value] of Object.entries(args)) {
        evaluatedArgs[key] = typeof value === 'string'
          ? this.evaluator.evaluate(value, context.scope, context.vars)
          : value;
      }

      return {
        actions: [{
          type: action,
          args: evaluatedArgs
        }]
      };
    }

    throw new Error(`Unknown directive: ${Object.keys(directive)[0]}`);
  }
}
