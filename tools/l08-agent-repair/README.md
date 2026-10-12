# Task readiness caller

Diagnose one caller-owned readiness input. The command reads a regular JSON file and prints one result. It does not fetch the path, repair a service, generate a quote, or take payment.

## Command

```
node tools/l08-agent-repair/task-readiness-caller.mjs --in caller.json
```

After `npm pack` and install, the executable name is `task-readiness-caller`.

## Caller JSON

```json
{
  "method": "GET",
  "path": "/estimate",
  "schema": {
    "type": "object",
    "required": ["data"],
    "properties": {
      "data": {
        "type": "object",
        "required": ["quote"],
        "properties": {
          "quote": { "type": "string", "pattern": "^\\d+(\\.\\d+)?$" }
        }
      }
    }
  },
  "value": { "data": { "quote": "4.50" } },
  "semantic": { "pointer": "data.quote", "pattern": "^\\d+(\\.\\d+)?$" },
  "pin": "00267aeb03c3ce01b9b318f5ee0172aee34d7e34",
  "deadline": "2099-01-01T00:00:00.000Z"
}
```

`decimal_match` for this input means three separate facts are true: the sample satisfies the supported schema, `data.quote` is a decimal string, and the schema proves every permitted `data.quote` is a decimal string.

## Supported schema

The owned semantic contract is pointer `data.quote` and pattern `^\d+(\.\d+)?$`. A proved schema has all of these:

- root `type` is `object`, and `required` includes `data`
- `data.type` is `object`, and `data.required` includes `quote`
- `quote.type` is `string`
- one decimal restriction: `pattern` equal to `^\d+(\.\d+)?$`, or `const` a decimal string, or `enum` a non-empty list of decimal strings

All declared root and `data` required keys are checked against this sample. Sibling property schemas may be empty or annotations-only; other sibling constraints return `no_fit` with their location rather than a false schema pass. This is a bounded owned-path checker, not a general JSON Schema validator.

`minLength` and `maxLength` are checked against this sample. They do not prove that future strings are decimals. `additionalProperties` may be `true` or `false`. Annotations `title`, `description`, `examples`, `example`, `default`, `deprecated`, `readOnly`, `writeOnly`, and `$comment` do not change the result.

## How to read the result

- `schema` is the shape check for this supplied value.
- `semantic` is the decimal check for this sample only.
- `guarantee` is `proved` only for the supported schema above. `unproved` means the schema is understood and does not exclude a non-decimal future quote. `unsupported` means this caller does not evaluate that schema form.
- `nextAction` is `decimal_match` only when `schema` passes, `semantic` passes, and `guarantee` is `proved`.

A sample mismatch is a failure of this value: `type_mismatch`, `const_mismatch`, `enum_mismatch`, `length_mismatch`, `required_missing`, or `value_mismatch`. An unproved guarantee can still carry a passing sample. Those are different facts.

## No-fit

Combinators (`allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`, `dependentSchemas`, `patternProperties`), a `pattern` other than the owned decimal pattern, a non-decimal `const`, a non-boolean `additionalProperties` schema, and malformed keywords return `no_fit`. The caller does not compile a schema pattern, follow `$ref`, or execute schema code. `$ref` and catalog `coldStart` refuse as hostile input.

Optional or nullable `data`, a missing or untyped quote schema, a string quote with no decimal restriction, and an enum that contains a non-decimal are unproved. A matching sample does not turn them into `decimal_match`.

## Boundaries

The input must be a regular file within the supplied-row byte limit. FIFO, URL, and non-file sources refuse. The pin must be the public S14 pin above. The deadline must be a real UTC instant in the future; impossible calendar days refuse. `cost` stays unknown. `quoteGenerated`, `paymentSent`, `repairPosted`, and `routeFetched` stay false.
