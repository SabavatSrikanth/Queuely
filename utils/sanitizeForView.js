/**
 * escapeHtml — escapes a string for safe interpolation into HTML markup
 * (text content or attribute values).
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * escapeJsString — escapes a string for safe interpolation inside a
 * single-quoted JavaScript string literal embedded in server-rendered
 * markup (e.g. `const id = '<%= escapeJsString(id) %>';`). Prevents an
 * attacker-controlled route param from breaking out of the string literal
 * and injecting arbitrary script.
 */
const escapeJsString = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
};

module.exports = { escapeHtml, escapeJsString };
