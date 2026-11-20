import { z } from "zod";

import type {
  ManifestVersion,
  PluginManifest,
  WidgetArgValues,
  WidgetContribution,
} from "./manifest";
import {
  DEVICE_PERMISSIONS,
  MANIFEST_VERSION,
  supportsManifestVersion,
} from "./manifest";
import { validateMatchPattern } from "./match";
import { validateNetworkPermission } from "./network";

// A URL-safe identifier — the plugin is served from `lightfern-plugin://<id>/` and the id is
// joined into its CSP header. Lowercase alphanumerics with `.`/`-` separators, e.g.
// `csv-viewer` or `com.lightfern.csv`.
const PLUGIN_ID = /^[a-z0-9][a-z0-9.-]*$/;

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// Bare npm specifiers only. Deep imports are covered by the root package declaration
// (for example, `react-dom` permits `react-dom/client`).
const PACKAGE_NAME = /^(?:@[-a-z0-9~][-.a-z0-9~]*\/)?[-a-z0-9~][-.a-z0-9~]*$/i;

const permissionSchema = z.enum([
  "files.read",
  "files.write",
  "multiplayer",
  ...DEVICE_PERMISSIONS,
]);

const viewSchema = z
  .object({
    match: z.string().min(1),
    entry: z.string().min(1),
    title: z.string().min(1).optional(),
  })
  .superRefine((view, ctx) => {
    const error = validateMatchPattern(view.match);
    if (error) {
      ctx.addIssue({ code: "custom", message: error, path: ["match"] });
    }
  });

const homeViewSchema = z.object({
  entry: z.string().min(1),
  title: z.string().min(1).optional(),
});

// Widget and argument names travel in an address's hash, so they stay URL-safe as written.
const WIDGET_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const WIDGETS_SINCE: ManifestVersion = "3.3";

const widgetArgSchema = z
  .object({
    type: z.enum(["string", "number", "boolean", "enum"]),
    values: z.array(z.string().min(1)).min(1).optional(),
    optional: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string().min(1),
  })
  .strict()
  .superRefine((arg, ctx) => {
    if ((arg.type === "enum") !== (arg.values !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "an enum argument lists its `values`, and only an enum does",
        path: ["values"],
      });
    }
    if (arg.default !== undefined) {
      const parsed = argValueSchema("default", arg).safeParse(String(arg.default));
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: `must be a valid ${arg.type}`,
          path: ["default"],
        });
      }
    }
  });

function refuseDuplicateIds(widgets: { id: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  widgets.forEach((widget, i) => {
    if (seen.has(widget.id)) {
      ctx.addIssue({
        code: "custom",
        message: `a widget with the ID "${widget.id}" is already declared`,
        path: [i, "id"],
      });
    }
    seen.add(widget.id);
  });
}

const widgetNameSchema = z
  .string()
  .regex(WIDGET_NAME, "must start with a letter, then letters, digits, '-' or '_'");

const widgetSchema = z.object({
  id: widgetNameSchema,
  entry: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  args: z.record(widgetNameSchema, widgetArgSchema).default({}),
});

/**
 * Refuses widgets in a manifest older than the version that brought them. A host that parses an
 * absent version, to explain it, applies this to its own copy of the schema; it skips that case.
 */
export function requireWidgetsVersion(
  manifest: {
    manifestVersion?: ManifestVersion;
    contributes: { widgets: readonly unknown[] };
  },
  ctx: z.RefinementCtx
): void {
  const version = manifest.manifestVersion;
  if (
    version !== undefined &&
    manifest.contributes.widgets.length > 0 &&
    !supportsManifestVersion(version, WIDGETS_SINCE)
  ) {
    ctx.addIssue({
      code: "custom",
      message: `widgets need manifestVersion ${WIDGETS_SINCE} or newer`,
      path: ["contributes", "widgets"],
    });
  }
}

/** `"MAJOR.MINOR"`, or a legacy integer `N` normalized to `"N.0"`. */
export const manifestVersionSchema = z.union([
  z
    .string()
    .regex(/^\d+\.\d+$/, 'must be "MAJOR.MINOR"')
    .transform((version) => version as ManifestVersion),
  z
    .number()
    .int()
    .transform((major): ManifestVersion => `${major}.0`),
]);

const manifestObjectSchema = z.object({
  manifestVersion: manifestVersionSchema.refine(
    (version) => supportsManifestVersion(MANIFEST_VERSION, version),
    {
      message: `must be ${MANIFEST_VERSION.split(".")[0]}.x, no newer than ${MANIFEST_VERSION}`,
    }
  ),
  id: z
    .string()
    .regex(PLUGIN_ID, "must be lowercase alphanumeric with '.' or '-' separators"),
  name: z.string().min(1),
  version: z.string().regex(SEMVER, "must be a semantic version"),
  // A superRefine rather than record key/value schemas: Zod reports a bad record key
  // as a generic "Invalid key in record", losing the actionable message.
  dependencies: z
    .record(z.string(), z.string())
    .default({})
    .superRefine((deps, ctx) => {
      for (const [name, version] of Object.entries(deps)) {
        if (!PACKAGE_NAME.test(name)) {
          ctx.addIssue({
            code: "custom",
            message: "must be an npm package name",
            path: [name],
          });
        }
        if (!SEMVER.test(version)) {
          ctx.addIssue({
            code: "custom",
            message: "must be an exact semantic version",
            path: [name],
          });
        }
      }
    }),
  permissions: z.array(permissionSchema).default([]),
  network_permissions: z
    .array(
      z.string().superRefine((value, ctx) => {
        const error = validateNetworkPermission(value);
        if (error) ctx.addIssue({ code: "custom", message: error });
      })
    )
    .default([]),
  contributes: z.object({
    views: z.array(viewSchema).default([]),
    home: homeViewSchema.optional(),
    servers: z
      .array(
        z
          .string()
          .regex(
            /\.(ts|tsx|js|jsx|mjs)$/,
            "a server module's path ends in its extension, like .ts"
          )
      )
      .default([]),
    widgets: z.array(widgetSchema).default([]).superRefine(refuseDuplicateIds),
  }),
});

export const manifestSchema = manifestObjectSchema.superRefine(requireWidgetsVersion);

export type ParsedManifest = z.infer<typeof manifestSchema>;

// A compile-time guarantee that the schema's output matches the on-disk type.
const _typeCheck: ParsedManifest extends PluginManifest ? true : never = true;
void _typeCheck;

export function parseManifest(input: unknown): PluginManifest {
  return manifestSchema.parse(input);
}

export function safeParseManifest(input: unknown) {
  return manifestSchema.safeParse(input);
}

export function formatManifestErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

type WidgetArgDeclaration = NonNullable<WidgetContribution["args"]>[string];

const listOf = (values: string[], word: "and" | "or") =>
  values.length > 1
    ? `${values.slice(0, -1).join(", ")} ${word} ${values[values.length - 1]}`
    : values.join("");

function argValueSchema(name: string, arg: WidgetArgDeclaration) {
  const wrong = (problem: string) => (issue: { input?: unknown }) =>
    issue.input === undefined ? `${name} is missing.` : `${name} ${problem}.`;
  switch (arg.type) {
    case "string":
      return z.string({ error: wrong("must be text") });
    case "number":
      // `z.coerce.number()` alone would read an empty value as 0.
      return z
        .string({ error: wrong("must be a number") })
        .trim()
        .min(1, `${name} must be a number.`)
        .pipe(z.coerce.number({ error: `${name} must be a number.` }));
    case "boolean":
      return z.stringbool({ error: wrong("must be true or false") });
    case "enum": {
      const values = (arg.values ?? []) as [string, ...string[]];
      return z.enum(values, {
        error: wrong(`must be ${listOf(values, "or")}`),
      });
    }
  }
}

/**
 * The check an embed's argument values must pass, built from the widget's declaration. Values
 * arrive as the text an address carries and leave converted to their declared types; an
 * undeclared argument is refused.
 */
export function widgetArgsSchema(
  widget: Pick<WidgetContribution, "args">
): z.ZodType<WidgetArgValues, Record<string, string>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, arg] of Object.entries(widget.args ?? {})) {
    const value: z.ZodType = argValueSchema(name, arg);
    shape[name] =
      arg.default !== undefined
        ? value.default(value.parse(String(arg.default)))
        : arg.optional
          ? value.optional()
          : value;
  }
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `This widget has no argument${issue.keys.length > 1 ? "s" : ""} ${listOf(
            issue.keys.map((key) => `"${key}"`),
            "and"
          )}.`
        : undefined,
  }) as unknown as z.ZodType<WidgetArgValues, Record<string, string>>;
}
