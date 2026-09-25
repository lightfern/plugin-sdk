import { z } from "zod";

import type { ManifestVersion, PluginManifest } from "./manifest";
import { MANIFEST_VERSION, supportsManifestVersion } from "./manifest";
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

const permissionSchema = z.enum(["files.read", "files.write"]);

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

export const manifestSchema = z.object({
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
  permissions: z.array(permissionSchema),
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
  }),
});

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
