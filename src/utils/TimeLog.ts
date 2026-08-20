const TIME_LOG_HEADER = "| Date | Hours | Start | End |";

/** Inserts a row into the Time Log table, creating the section when missing. */
export function appendTimeLogRow(content: string, row: string): string {
  if (!content.includes(TIME_LOG_HEADER)) {
    return (
      content.replace(/\s*$/, "") +
      `\n\n## Time Log\n\n${TIME_LOG_HEADER}\n|------|-------|-------|-----|\n${row}\n`
    );
  }

  const lines = content.split("\n");
  let pastSep = false;
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(TIME_LOG_HEADER)) {
      pastSep = false;
      continue;
    }
    if (!pastSep && lines[i].startsWith("|---")) {
      pastSep = true;
      continue;
    }
    if (pastSep && lines[i].startsWith("|")) continue;
    if (pastSep) {
      insertAt = i;
      break;
    }
  }
  if (insertAt < 0) insertAt = lines.length;
  const next = [...lines];
  next.splice(insertAt, 0, row);
  return next.join("\n");
}
