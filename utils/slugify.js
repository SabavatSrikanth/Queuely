/**
 * Generate a URL-safe slug from a string
 * @param {string} str - Input string
 * @returns {string} Slug
 */
const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Generate a unique slug by appending a suffix if needed
 * @param {string} base - Base string
 * @param {Function} checkExists - Async fn(slug) => boolean
 * @returns {Promise<string>} Unique slug
 */
const uniqueSlug = async (base, checkExists) => {
  let slug = slugify(base);
  let exists = await checkExists(slug);
  let counter = 1;
  while (exists) {
    slug = `${slugify(base)}-${counter++}`;
    exists = await checkExists(slug);
  }
  return slug;
};

module.exports = { slugify, uniqueSlug };
