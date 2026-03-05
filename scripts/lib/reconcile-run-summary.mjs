import { readFile, writeFile } from "node:fs/promises";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function renderValidationNotes(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  return findings
    .map((finding) => `${finding.phase}: ${finding.message}`)
    .join(" | ");
}

export async function reconcileRunSummary({
  summaryPath,
  validationPath,
  baseOperatorNotes = null
}) {
  const [summary, validation] = await Promise.all([readJson(summaryPath), readJson(validationPath)]);

  summary.status = validation.status ?? summary.status;
  summary.failurePhase = validation.failurePhase ?? summary.failurePhase;

  const noteParts = [];
  if (typeof baseOperatorNotes === "string" && baseOperatorNotes.trim()) {
    noteParts.push(baseOperatorNotes.trim());
  }

  const validationNotes = renderValidationNotes(validation.findings);
  if (validationNotes) {
    noteParts.push(validationNotes);
  }

  summary.operatorNotes = noteParts.length > 0 ? noteParts.join(" ") : null;

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, validation };
}
