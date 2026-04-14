import {
  FASTNEAR_STRUCTURED_GRAPH,
  type GeneratedFastnearStructuredGraph,
} from "./generatedFastnearStructuredGraph";

export * from "./generatedFastnearStructuredGraph";

export type FastnearStructuredGraph = GeneratedFastnearStructuredGraph;
export type FastnearStructuredFamily = FastnearStructuredGraph["families"][number];
export type FastnearStructuredOperation = FastnearStructuredGraph["operations"][number];
export type FastnearStructuredBreadcrumb = FastnearStructuredGraph["breadcrumbs"][number];

export const fastnearStructuredFamiliesById: Record<string, FastnearStructuredFamily> =
  Object.fromEntries(FASTNEAR_STRUCTURED_GRAPH.families.map((family) => [family.id, family]));

export const fastnearStructuredOperationsByPageModelId: Record<string, FastnearStructuredOperation> =
  Object.fromEntries(
    FASTNEAR_STRUCTURED_GRAPH.operations.map((operation) => [operation.pageModelId, operation])
  );

export const fastnearStructuredOperationsByCanonicalPath: Record<string, FastnearStructuredOperation> =
  Object.fromEntries(
    FASTNEAR_STRUCTURED_GRAPH.operations.map((operation) => [operation.canonicalPath, operation])
  );

export const fastnearStructuredOperationsByDocsPath: Record<string, FastnearStructuredOperation> =
  Object.fromEntries(
    FASTNEAR_STRUCTURED_GRAPH.operations.map((operation) => [operation.docsPath, operation])
  );

export const fastnearStructuredBreadcrumbsByPageModelId: Record<string, FastnearStructuredBreadcrumb> =
  Object.fromEntries(
    FASTNEAR_STRUCTURED_GRAPH.breadcrumbs.map((breadcrumb) => [breadcrumb.pageModelId, breadcrumb])
  );
