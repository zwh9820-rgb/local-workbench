import { z } from 'zod';

/**
 * 极简 Zod → JSON Schema 转换器。
 *
 * 只覆盖工具参数会用到的那部分类型（object/string/number/boolean/array/enum/
 * optional/default/nullable/union），避免为了一个转换再引入额外依赖。
 * 好处：工具参数只有一份 Zod 定义，既做运行时校验，又生成 function calling schema。
 */
type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName?: string; description?: string } & Record<string, unknown>;
  const typeName = def.typeName ?? '';
  const describe = (schema as { description?: string }).description;

  const wrap = (out: JsonSchema): JsonSchema =>
    describe ? { ...out, description: describe } : out;

  switch (typeName) {
    case 'ZodString': {
      const out: JsonSchema = { type: 'string' };
      const checks = (def.checks as Array<{ kind: string; value?: number }> | undefined) ?? [];
      for (const c of checks) {
        if (c.kind === 'min' && c.value !== undefined) out.minLength = c.value;
        if (c.kind === 'max' && c.value !== undefined) out.maxLength = c.value;
      }
      return wrap(out);
    }

    case 'ZodNumber': {
      const out: JsonSchema = { type: 'number' };
      const checks = (def.checks as Array<{ kind: string; value?: number }> | undefined) ?? [];
      for (const c of checks) {
        if (c.kind === 'min' && c.value !== undefined) out.minimum = c.value;
        if (c.kind === 'max' && c.value !== undefined) out.maximum = c.value;
        if (c.kind === 'int') out.type = 'integer';
      }
      return wrap(out);
    }

    case 'ZodBoolean':
      return wrap({ type: 'boolean' });

    case 'ZodEnum':
      return wrap({ type: 'string', enum: def.values as string[] });

    case 'ZodLiteral':
      return wrap({ const: def.value });

    case 'ZodArray': {
      const item = zodToJsonSchema(def.type as z.ZodTypeAny);
      return wrap({ type: 'array', items: item });
    }

    case 'ZodOptional':
    case 'ZodNullable':
      return zodToJsonSchema(def.innerType as z.ZodTypeAny);

    case 'ZodDefault': {
      const inner = zodToJsonSchema(def.innerType as z.ZodTypeAny);
      const dv = (def.defaultValue as () => unknown)();
      return wrap({ ...inner, default: dv });
    }

    case 'ZodUnion': {
      const options = (def.options as z.ZodTypeAny[]).map(zodToJsonSchema);
      return wrap({ anyOf: options });
    }

    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const v = value as z.ZodTypeAny;
        properties[key] = zodToJsonSchema(v);
        const isOptional =
          v.isOptional() ||
          (v._def as { typeName?: string }).typeName === 'ZodDefault' ||
          (v._def as { typeName?: string }).typeName === 'ZodOptional';
        if (!isOptional) required.push(key);
      }

      return wrap({
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      });
    }

    case 'ZodRecord':
      return wrap({ type: 'object', additionalProperties: true });

    default:
      return wrap({});
  }
}
