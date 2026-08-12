import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

export const TENANT_TABLE_POLICY = Object.freeze({
  guest_requests: "strict",
  guest_stays: "strict",
  guest_stay_devices: "strict",
  guest_surveys: "strict",
  guest_push_subscriptions: "strict",
  staff_push_subscriptions: "strict",
  staff_access_pins: "strict",
  massage_booking_attempts: "strict",
  massage_calendar_snapshots: "strict",
  massage_calendar_sync_state: "strict",
  hotel_test_rooms: "strict",
  hotel_config_revisions: "strict",
  hotel_config_publication_state: "strict",
  hotel_config_projection_state: "strict",
  staff_sessions: "identity",
  hub_events: "hybrid",
  system_events: "hybrid",
  hotels: "platform",
});

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  "node_modules",
  "tests",
  "backup",
  "backups",
  "dist",
  "build",
  "coverage",
]);

const QUERY_METHODS = new Set(["select", "insert", "upsert", "update", "delete"]);
const WRITE_METHODS = new Set(["insert", "upsert", "update", "delete"]);
const HOTEL_FILTER_METHODS = new Set(["eq", "in", "filter", "contains", "containedBy"]);

function getPropertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const arg = node.argumentExpression;
    if (ts.isStringLiteralLike(arg)) return arg.text;
  }
  return null;
}

function getCallName(node) {
  return ts.isCallExpression(node) ? getPropertyName(node.expression) : null;
}

function getLiteralText(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function getImportModuleText(node) {
  return ts.isImportDeclaration(node) ? getLiteralText(node.moduleSpecifier) : null;
}

function collectSupabaseClientIdentifiers(sourceFile) {
  const clientIdentifiers = new Set(["supabase", "supabaseAdmin"]);
  const createClientIdentifiers = new Set(["createClient"]);

  const visitImports = (node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleText = getImportModuleText(node) || "";
      const clause = node.importClause;

      if (moduleText === "@supabase/supabase-js" && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const importedName = element.propertyName?.text || element.name.text;
          if (importedName === "createClient") createClientIdentifiers.add(element.name.text);
        }
      }

      if (moduleText.includes("supabase-admin") && clause) {
        if (clause.name) clientIdentifiers.add(clause.name.text);
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) clientIdentifiers.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    const visitDeclarations = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const variableName = node.name.text;
        const initializer = unwrapExpression(node.initializer);

        if (
          initializer &&
          ts.isCallExpression(initializer) &&
          ts.isIdentifier(initializer.expression) &&
          createClientIdentifiers.has(initializer.expression.text) &&
          !clientIdentifiers.has(variableName)
        ) {
          clientIdentifiers.add(variableName);
          changed = true;
        }

        if (
          initializer &&
          ts.isIdentifier(initializer) &&
          clientIdentifiers.has(initializer.text) &&
          !clientIdentifiers.has(variableName)
        ) {
          clientIdentifiers.add(variableName);
          changed = true;
        }
      }
      ts.forEachChild(node, visitDeclarations);
    };
    visitDeclarations(sourceFile);
  }

  return clientIdentifiers;
}

function collectVariableInitializers(sourceFile) {
  const initializers = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializers;
}

function isSupabaseClientReceiver(receiver, clientIdentifiers) {
  const current = unwrapExpression(receiver);
  if (!current) return false;

  if (ts.isIdentifier(current)) return clientIdentifiers.has(current.text);

  if (ts.isPropertyAccessExpression(current)) {
    const propertyName = current.name.text;
    return clientIdentifiers.has(propertyName) || /^supabase(admin)?$/i.test(propertyName);
  }

  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    const propertyName = getLiteralText(current.argumentExpression) || "";
    return clientIdentifiers.has(propertyName) || /^supabase(admin)?$/i.test(propertyName);
  }

  if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
    return /supabase/i.test(current.expression.text);
  }

  return false;
}

function isSupabaseQueryRoot(node, clientIdentifiers) {
  if (!ts.isCallExpression(node)) return false;
  const method = getCallName(node);
  if (method !== "from" && method !== "rpc") return false;

  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false;
  return isSupabaseClientReceiver(expression.expression, clientIdentifiers);
}

function getOutermostFluentCall(rootCall) {
  let current = rootCall;
  while (current.parent) {
    const property = current.parent;
    if (
      (ts.isPropertyAccessExpression(property) || ts.isElementAccessExpression(property)) &&
      property.expression === current &&
      property.parent &&
      ts.isCallExpression(property.parent) &&
      property.parent.expression === property
    ) {
      current = property.parent;
      continue;
    }
    break;
  }
  return current;
}

function collectFluentCalls(rootCall) {
  const outermost = getOutermostFluentCall(rootCall);
  const callsOuterToInner = [];
  let current = outermost;

  while (ts.isCallExpression(current)) {
    const expression = current.expression;
    if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) break;
    callsOuterToInner.push(current);
    const receiver = unwrapExpression(expression.expression);
    if (!receiver || !ts.isCallExpression(receiver)) break;
    current = receiver;
  }

  return callsOuterToInner.reverse();
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function objectLiteralHasHotelId(node, variableInitializers, visited = new Set()) {
  const current = unwrapExpression(node);
  if (!current) return false;

  if (ts.isIdentifier(current)) {
    if (visited.has(current.text)) return false;
    visited.add(current.text);
    return objectLiteralHasHotelId(variableInitializers.get(current.text), variableInitializers, visited);
  }

  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.some((element) => objectLiteralHasHotelId(element, variableInitializers, new Set(visited)));
  }

  if (!ts.isObjectLiteralExpression(current)) return false;

  return current.properties.some((property) => {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = property.name;
      if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === "hotel_id") return true;
    }
    if (ts.isSpreadAssignment(property)) {
      return objectLiteralHasHotelId(property.expression, variableInitializers, new Set(visited));
    }
    return false;
  });
}

function hasHotelFilter(calls, variableInitializers) {
  return calls.some((call) => {
    const method = getCallName(call);
    if (method === "match") {
      return objectLiteralHasHotelId(call.arguments[0], variableInitializers);
    }
    if (!HOTEL_FILTER_METHODS.has(method)) return false;
    return getLiteralText(call.arguments[0]) === "hotel_id";
  });
}

function hasPrimaryKeyFilter(calls) {
  return calls.some((call) => getCallName(call) === "eq" && getLiteralText(call.arguments[0]) === "id");
}

function hasSecretIdentityFilter(calls) {
  return calls.some((call) => {
    if (getCallName(call) !== "eq") return false;
    const key = getLiteralText(call.arguments[0]);
    return key === "session_token_hash" || key === "token_hash";
  });
}

function findOperation(calls) {
  for (const call of calls) {
    const method = getCallName(call);
    if (WRITE_METHODS.has(method)) return method;
    if (method === "select") return "select";
  }
  return "unknown";
}

function hasHotelIdInWritePayload(calls, variableInitializers) {
  for (const call of calls) {
    const method = getCallName(call);
    if (method !== "insert" && method !== "upsert") continue;
    if (objectLiteralHasHotelId(call.arguments[0], variableInitializers)) return true;
  }
  return false;
}

function classifyQuery({ table, operation, hasHotelScope, hasHotelIdPayload, hasSecretScope, hasPrimaryKeyScope }) {
  if (!table) return { policy: "dynamic", status: "needs_review", reasons: ["dynamic_table_name"] };

  const policy = TENANT_TABLE_POLICY[table] || "unknown";
  if (policy === "unknown") return { policy, status: "needs_review", reasons: ["unclassified_table"] };

  if (policy === "platform") {
    if (operation === "select" || operation === "unknown") return { policy, status: "platform_scope", reasons: [] };
    return { policy, status: "needs_review", reasons: ["platform_table_write"] };
  }

  if (policy === "identity") {
    if (hasSecretScope) return { policy, status: "identity_scope", reasons: [] };
    if (hasHotelScope || hasHotelIdPayload) return { policy, status: "scoped", reasons: [] };
    return { policy, status: "needs_review", reasons: ["identity_scope_not_proven"] };
  }

  if (policy === "hybrid") {
    if (hasHotelScope || hasHotelIdPayload) return { policy, status: "scoped", reasons: [] };
    return { policy, status: "needs_review", reasons: ["hybrid_scope_requires_review"] };
  }

  if (operation === "insert" || operation === "upsert") {
    if (hasHotelIdPayload) return { policy, status: "scoped", reasons: [] };
    return { policy, status: "needs_review", reasons: ["write_payload_missing_hotel_id"] };
  }

  if (hasHotelScope) return { policy, status: "scoped", reasons: [] };
  if (hasPrimaryKeyScope) return { policy, status: "needs_review", reasons: ["primary_key_only_scope"] };
  return { policy, status: "needs_review", reasons: ["hotel_scope_not_proven"] };
}

export function scanTenantQueriesInSource({ filePath, sourceText }) {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const findings = [];
  const clientIdentifiers = collectSupabaseClientIdentifiers(sourceFile);
  const variableInitializers = collectVariableInitializers(sourceFile);

  const visit = (node) => {
    if (ts.isCallExpression(node) && isSupabaseQueryRoot(node, clientIdentifiers)) {
      const rootMethod = getCallName(node);
      const calls = collectFluentCalls(node);
      const firstArg = node.arguments[0];
      const table = rootMethod === "from" ? getLiteralText(firstArg) : null;
      const rpc = rootMethod === "rpc" ? getLiteralText(firstArg) : null;
      const tableExpression = firstArg ? firstArg.getText(sourceFile) : "";
      const operation = rootMethod === "rpc" ? "rpc" : findOperation(calls);
      const hotelFilter = hasHotelFilter(calls, variableInitializers);
      const hotelIdPayload = hasHotelIdInWritePayload(calls, variableInitializers);
      const secretScope = hasSecretIdentityFilter(calls);
      const primaryKeyScope = hasPrimaryKeyFilter(calls);
      const classification = rootMethod === "rpc"
        ? { policy: "rpc", status: "needs_review", reasons: ["rpc_requires_review"] }
        : classifyQuery({
            table,
            operation,
            hasHotelScope: hotelFilter,
            hasHotelIdPayload: hotelIdPayload,
            hasSecretScope: secretScope,
            hasPrimaryKeyScope: primaryKeyScope,
          });
      const location = getLineAndColumn(sourceFile, node);
      const outermost = getOutermostFluentCall(node);

      findings.push({
        filePath,
        line: location.line,
        column: location.column,
        kind: rootMethod,
        table,
        rpc,
        tableExpression,
        operation,
        hotelFilter,
        hotelIdPayload,
        secretScope,
        primaryKeyScope,
        policy: classification.policy,
        status: classification.status,
        reasons: classification.reasons,
        source: outermost.getText(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

async function walkSourceFiles(rootDirectory) {
  const output = [];
  async function walk(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
      const absolutePath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
      output.push(absolutePath);
    }
  }
  await walk(rootDirectory);
  return output;
}

export async function scanTenantQueriesInDirectories({ projectRoot, directories = ["app", "lib"] }) {
  const findings = [];
  for (const directory of directories) {
    const absoluteDirectory = resolve(projectRoot, directory);
    let files = [];
    try {
      files = await walkSourceFiles(absoluteDirectory);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const filePath of files) {
      const sourceText = await readFile(filePath, "utf8");
      const relativePath = relative(projectRoot, filePath).split(sep).join("/");
      findings.push(...scanTenantQueriesInSource({ filePath: relativePath, sourceText }));
    }
  }
  return findings;
}

export function summarizeTenantQueryFindings(findings) {
  const summary = { total: findings.length, byStatus: {}, byPolicy: {}, byTable: {} };
  for (const finding of findings) {
    const tableKey = finding.table || (finding.rpc ? `rpc:${finding.rpc}` : "dynamic");
    summary.byStatus[finding.status] = (summary.byStatus[finding.status] || 0) + 1;
    summary.byPolicy[finding.policy] = (summary.byPolicy[finding.policy] || 0) + 1;
    summary.byTable[tableKey] = (summary.byTable[tableKey] || 0) + 1;
  }
  return summary;
}
