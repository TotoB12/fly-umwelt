export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') {
      row.push(field.replace(/\r$/, '')); field = '';
      if (row.some(v => v.length)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

export function csvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map(values => Object.fromEntries(header.map((h, i) => [h, values[i] ?? ''])));
}

export async function gunzipText(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${response.url}`);
  if ('DecompressionStream' in globalThis) {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  throw new Error('This browser lacks DecompressionStream support. Upload an unpacked data pack or use a current browser.');
}

export async function gunzipBuffer(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${response.url}`);
  if ('DecompressionStream' in globalThis) {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  throw new Error('This browser lacks DecompressionStream support.');
}
