const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "packages", "database", "models");

function toPascal(name) {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  const tableMatch = text.match(/export const (\w+Table)\s*=\s*/);
  if (!tableMatch) return;

  const tableName = tableMatch[1];
  const entityName = toPascal(path.basename(filePath, ".ts"));
  const selectTypeName = `${entityName}Type`;
  const insertTypeName = `Insert${entityName}Type`;

  const originalText = text;

  text = text.replace(
    /export type \w+ = typeof \w+\.\$inferSelect;/g,
    `export type ${selectTypeName} = typeof ${tableName}.$inferSelect;`,
  );
  text = text.replace(
    /export type \w+ = typeof \w+\.\$inferInsert;/g,
    `export type ${insertTypeName} = typeof ${tableName}.$inferInsert;`,
  );

  const hasSelect = new RegExp(
    `export type ${selectTypeName} = typeof ${tableName}\\.\\$inferSelect;`,
  ).test(text);
  const hasInsert = new RegExp(
    `export type ${insertTypeName} = typeof ${tableName}\\.\\$inferInsert;`,
  ).test(text);

  if (!hasSelect || !hasInsert) {
    let addition = "";
    if (!hasSelect)
      addition += `export type ${selectTypeName} = typeof ${tableName}.$inferSelect;\r\n`;
    if (!hasInsert)
      addition += `export type ${insertTypeName} = typeof ${tableName}.$inferInsert;\r\n`;
    text = text.trimEnd() + "\r\n\r\n" + addition;
  }

  if (text !== originalText) {
    fs.writeFileSync(filePath, text, "utf8");
    console.log(`Updated ${filePath}`);
  }
}

walk(root);
