# Definitions DSL Conventions

This DSL powers `.ds.yml` logic blocks (hooks, functions). It is intentionally small, deterministic, and data‑centric.

**File Types**
- Module files: `modules/**/*.ds.yml`
- Logic entrypoints: `hooks.<hook_name>.logic` and `functions.<fn_name>.logic`

**Execution Model**
- Directives run in order.
- Each directive can emit zero or more `game_action`s.
- The game engine consumes actions and applies the real state changes.

**Scope + Vars**
- `scope` is read-only data passed in by the engine (hero, empire, law, battle, etc).
- `vars` is a mutable scratchpad for local variables.
- Use `set_variable` / `let` to define `vars.*`.

**Expression Rules**
- Expressions are strings evaluated by the DSL evaluator.
- Operators: `||`, `&&`, `==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `%`
- Dot paths: `scope.hero.name`, `vars.bonus`
- Function calls: `round(1.2)`, `intersects(scope.hero_tags, scope.law_tags)`
- Object literals are not supported; use primitives, arrays from `range`, or data on `scope`.

**String Literals (Important)**
- Any string in an expression must be quoted.
- If you want a literal string passed through, wrap it in quotes inside the expression.
- Examples:
```yaml
value: "'Hero Passive triggered: {hero} rallies votes (+{percent}% legitimacy).'"
condition: "scope.battle && scope.battle.type == 'SCOURGE'"
```

**Directives**
- `set_variable`: assign `vars.<name>` from an expression.
- `let`: alias for `set_variable`.
- `if`: conditional with `then` and optional `else`.
- `for_each`: iterate arrays.
- `switch`: value matching with `cases` and `default`.
- `call`: invoke a module function.
- `return`: return a value from a function.
- `append`: push to an array.
- `emit_event`: emit an event the engine can listen to.
- `game_action`: emit a game action for the engine to apply.

**Builtins (Selected)**
- Math: `min`, `max`, `floor`, `ceil`, `round`, `abs`, `pow`, `sqrt`
- Arrays: `len`, `length`, `append`, `range`, `includes`, `intersects`
- Utilities: `clamp`, `get`, `set`, `keys`, `values`

**Hero Passive Hook Context**
When a hero passive fires, the engine provides:
- `scope.hero`, `scope.empire`, `scope.state`
- `scope.law_process`, `scope.law`
- `scope.battle`
- `scope.popularity_scalar`
- `scope.cadence`, `scope.phase`
- `scope.hero_tags`, `scope.empire_tags`, `scope.law_tags`

**Hero Ability Hook Context**
When a hero ability triggers, the engine provides:
- `scope.hero`, `scope.empire`, `scope.state`
- `scope.law_process`
- `scope.popularity_scalar`
- `scope.hero_tags`, `scope.empire_tags`

**Example: Hero Passive Hook**
```yaml
hooks:
  on_trigger:
    description: "Boost legitimacy at the start of voting."
    logic:
      - set_variable:
          varName: "bonus"
          value: "0.03 * scope.popularity_scalar"
      - if:
          condition: "vars.bonus > 0"
          then:
            - game_action:
                action: "add_law_legitimacy"
                args:
                  amount: "vars.bonus"
                  percent: "vars.bonus * 100"
                  log_message: "'Hero Passive triggered: {hero} rallies votes (+{percent}% legitimacy).'"
```

**Hero Actions (Game Actions)**
These are emitted by passives/abilities and applied by the engine:
- `grant_credits` args: `amount`, optional `log_message`
- `add_law_momentum` args: `amount`, optional `percent`, optional `log_message`
- `add_law_legitimacy` args: `amount`, optional `percent`, optional `log_message`
- `add_scourge_manpower_damage_pct` args: `amount`, optional `percent`, optional `log_message`
- `adjust_hero_meter` args: `meter` (`heat` | `grievance` | `popularity`), `amount`, optional `log_message`
- `add_law_progress` args: `amount`, optional `log_message`
- `grant_requisition` args: `amount`, optional `log_message`

**Debugging Tips**
- If a hook does nothing, verify `log_message` is quoted and expressions evaluate to numbers.
- Prefer `vars.*` for intermediate values and check conditions explicitly.
