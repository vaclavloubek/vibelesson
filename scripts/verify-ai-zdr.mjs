import fs from 'node:fs';
import ts from 'typescript';

const SOURCE_FILES = ['lib/ai.ts', 'lib/grading.ts'];

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function getObjectProperty(object, name) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    if (propertyName(property.name) === name) return property;
  }
  return null;
}

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function gatewayBranchEnforcesZdr(node) {
  node = unwrap(node);

  if (ts.isConditionalExpression(node)) {
    return gatewayBranchEnforcesZdr(node.whenTrue) && gatewayBranchEnforcesZdr(node.whenFalse);
  }

  if (!ts.isObjectLiteralExpression(node)) return false;
  const zdr = getObjectProperty(node, 'zeroDataRetention');
  if (!zdr || !ts.isPropertyAssignment(zdr)) return false;
  return zdr.initializer.kind === ts.SyntaxKind.TrueKeyword;
}

function verifyFile(path) {
  const text = fs.readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const failures = [];
  let calls = 0;

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'generateText'
    ) {
      calls += 1;
      const options = unwrap(node.arguments[0]);
      let ok = false;

      if (options && ts.isObjectLiteralExpression(options)) {
        const providerOptions = getObjectProperty(options, 'providerOptions');
        if (providerOptions && ts.isPropertyAssignment(providerOptions)) {
          const providerObject = unwrap(providerOptions.initializer);
          if (ts.isObjectLiteralExpression(providerObject)) {
            const gateway = getObjectProperty(providerObject, 'gateway');
            if (gateway && ts.isPropertyAssignment(gateway)) {
              ok = gatewayBranchEnforcesZdr(gateway.initializer);
            }
          }
        }
      }

      if (!ok) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${path}:${position.line + 1}:${position.character + 1}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return { calls, failures };
}

let totalCalls = 0;
const failures = [];

for (const path of SOURCE_FILES) {
  const result = verifyFile(path);
  totalCalls += result.calls;
  failures.push(...result.failures);
}

if (totalCalls === 0) {
  console.error('SEC-015 check failed: no generateText calls were found.');
  process.exit(1);
}

if (failures.length > 0) {
  console.error('SEC-015 check failed: AI Gateway ZDR is not fail-closed for these generateText calls:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`SEC-015 check passed: ${totalCalls} generateText calls enforce AI Gateway zeroDataRetention=true on every routing branch.`);
