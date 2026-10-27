import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const updateDirectory = join(root, "dist", "app", "update");
const dictionaryPath = join(root, "dist", "app", "dictionary", "x_82900_docsera_rm_member.xml");
const keysPath = join(root, "src", "fluent", "generated", "keys.ts");

const updateFiles = await readdir(updateDirectory);
const updateXml = await Promise.all(updateFiles.filter((file) => file.endsWith(".xml")).map(async (file) => ({
  file,
  content: await readFile(join(updateDirectory, file), "utf8")
})));
const dictionary = await readFile(dictionaryPath, "utf8");
const keys = await readFile(keysPath, "utf8");
const m2m = updateXml.find(({ content }) => content.includes('<record_update table="sys_m2m">'))?.content;
const dbObject = updateXml.find(({ content }) => content.includes("<name>x_82900_docsera_rm_member</name>"))?.content;

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`CTO-3B generated-metadata verification failed: ${message}`);
}

requireEvidence(!dictionary.includes("batch_page_key"), "the removed synthetic key was emitted");
for (const column of ["removal_batch", "page", "first_pending_sequence"]) {
  requireEvidence(dictionary.includes(`<element name="${column}"`), `missing ${column} column`);
}
requireEvidence(dictionary.includes('<index name="removal_batch_page_unique" unique="true">'), "missing unique index");
requireEvidence(dictionary.includes('<element name="removal_batch"/>') && dictionary.includes('<element name="page"/>'), "index is not composite");
requireEvidence(Boolean(m2m), "missing sys_m2m update record");
requireEvidence(m2m.includes("<from_table>x_82900_docsera_workspace_removal_batch</from_table>"), "wrong sys_m2m from endpoint");
requireEvidence(m2m.includes("<to_table>x_82900_docsera_page</to_table>"), "wrong sys_m2m to endpoint");
requireEvidence(m2m.includes('<m2m_table name="x_82900_docsera_rm_member">'), "sys_m2m does not reference link table");
requireEvidence(Boolean(dbObject) && dbObject.includes("<sys_scope display_value=\"x_82900_docsera\">"), "missing scoped sys_db_object");
requireEvidence(Boolean(dbObject) && dbObject.includes("<ws_access>false</ws_access>") && dbObject.includes("<access>package_private</access>"), "table access settings changed");
requireEvidence(keys.includes("table: 'sys_m2m'") && keys.includes("table: 'sys_index'") && keys.includes("col_name_string: 'removal_batch,page'"), "generated key identities do not prove M2M and composite index records");

console.log("CTO-3B generated metadata verified: 3 columns, sys_m2m registration, and composite unique index.");
